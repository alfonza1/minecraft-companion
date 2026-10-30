const normalize = text => text.toLowerCase().replaceAll('_', ' ').replace(/\b(logs|axes|sticks|stones|diamonds)\b/g, word => ({logs:'log',axes:'axe',sticks:'stick',stones:'stone',diamonds:'diamond'})[word]).trim();

function ownedItems(phrase, inventory) {
  const name = normalize(phrase.replace(/^(?:the |your |some )/, ''));
  let matching = inventory.filter(item => [normalize(item.name), normalize(item.displayName || '')].includes(name));
  if (/^(?:wood|logs?|timber)$/.test(name)) matching = inventory.filter(item => /_(?:log|stem)$/.test(item.name));
  if (/^planks?$/.test(name)) matching = inventory.filter(item => item.name.endsWith('_planks'));
  const totals = new Map();
  for (const item of matching) totals.set(item.name, (totals.get(item.name) ?? 0) + item.count);
  return [...totals].map(([name, count]) => ({ name, count }));
}

// Anchored everyday commands only. Ambiguous or unrelated speech falls through
// to conversation; this path performs no model or external service request.
export function quickPlan(text, { world, playerName, currentTask, locations = [], project } = {}) {
  if (!world) return null;
  const message = text.trim().toLowerCase().replace(/^[\s]*(?:hey[, ]+|yo[, ]+)?(?:can you |could you |please )?/, '').replace(/[.!?]+$/, '').replace(/ please$/, '').trim();
  for(const [pattern,tool,reply] of [
    [/^(?:hunt(?: for food)?|get (?:some )?meat|hunt (?:some )?animals)$/,'hunt_food','I’ll look for a safe wild animal.'],
    [/^(?:farm|tend (?:the |our )?farm|harvest (?:the |our )?(?:farm|crops))$/,'tend_farm','I’ll harvest the ripe crops and replant.'],
    [/^(?:cook(?: (?:some |the )?food)?|smelt (?:the )?food)$/,'cook_food','I’ll cook what I own in an empty nearby furnace.'],
    [/^(?:explore|go exploring|scout(?: (?:the area|nearby))?)$/,'explore_nearby','I’ll check nearby safe surface paths and come back.'],
    [/^(?:store (?:your |the )?(?:loot|items|valuables)|deposit(?: (?:your |the )?(?:loot|items|surplus))?|put (?:your |the )?(?:loot|items|valuables) away)$/,'store_surplus','I’ll put the surplus in approved storage and keep my kit.'],
    [/^(?:resume (?:the )?build|(?:continue|keep|carry on) (?:the )?(?:build|building)|build (?:the )?approved (?:house|project))$/,'resume_approved_build','I’ll check the approved blueprint and saved site, then continue.'],
    [/^(?:find|get|gather)(?: (?:some|us))? food$/,'find_food','I’ll check safe food sources.'],
  ])if(pattern.test(message))return {reply,intent:'minecraft_action',actions:[{tool,args:{}}]};
  const search = message.match(/^(?:find|look for|search for|go find|you (?:find|look for)) (?:some |the |a source of )?([a-z_ ]{1,60})$/);
  if(search && !/\b(?:house|build|youtube|video|food|movie)\b/.test(search[1])) {
    const phrase=normalize(search[1]), item=phrase==='jungle'?'jungle_log':phrase.replaceAll(' ','_');
    if(!/^(?:bamboo|scaffolding|string|cobweb|glass|sand|dirt|stone|cobblestone|diamond|iron_ingot|coal|cocoa_beans|(?:oak|birch|spruce|jungle|acacia|dark_oak|cherry|mangrove)_(?:log|planks))$/.test(item))return null;
    return {reply:`I’ll check nearby for ${phrase}, then search farther if my home route and supplies are ready. I’ll come back afterward.`,intent:'minecraft_action',actions:[{tool:'find_resource',args:{item}}]};
  }
  const stack = message.match(/^(?:get|gather|collect|chop) (?:me )?(?:another |one |a )?stack(?: of ([a-z ]+))?$/);
  if(stack){
    const phrase=stack[1]||currentTask?.args?.species&&`${currentTask.args.species} logs`||currentTask?.args?.block;
    if(phrase){const name=normalize(phrase).replaceAll(' ','_');const wood=name==='wood'||name==='log'||name.endsWith('_log');return {reply:'I’ll get another stack, then return to my previous task.',intent:'minecraft_action',actions:[{tool:wood?'chop_tree':'gather_blocks',args:wood?{count:64,...(name.endsWith('_log')?{species:name.slice(0,-4)}:{})}:{block:name,count:64}}]};}
  }
  const remainingRequest = message.match(/^(?:bring|fetch|get) (?:me )?(?:the )?remaining (wood|stone|[a-z_]+)$/);
  if(remainingRequest&&project?.assignments&&playerName){
    const row=project.assignments.find(value=>remainingRequest[1]==='wood'?value.material.endsWith('_log'):remainingRequest[1]==='stone'?value.material==='cobblestone':value.material===remainingRequest[1]);
    const missing=row?Math.max(0,row.total-(row.aiProgress||0)-(row.userProgress||0)):0;
    if(row)return missing?{reply:`I’ll bring up to ${Math.min(64,missing)} ${row.material.replaceAll('_',' ')} from this project’s missing amount.`,intent:'minecraft_action',actions:[{tool:'bring_items',args:{item:row.material,count:Math.min(64,missing),player:playerName}}]}:{reply:'The reported assignments for that material are covered. Check the stock at the build site before gathering more.',intent:'minecraft_question',actions:[]};
  }
  if (/^(?:help me|come help me|come help|i need help|rescue me)$/.test(message)) return { reply: 'Coming to help. I’ll pick up my work afterward.', intent: 'minecraft_action', actions: [{ tool: 'rescue_player', args: {} }] };
  const routine = message.match(/^(?:get ready|prepare)(?: to| for)? (mine|mining|build|building|travel|a trip)$/);
  if (routine) return { reply: 'Let me check my supplies.', intent: 'minecraft_action', actions: [{ tool: 'prepare_routine', args: { routine: /min/.test(routine[1]) ? 'mining' : /build/.test(routine[1]) ? 'building' : 'travel' } }] };
  if (/^(?:restock|restock supplies|top up supplies)$/.test(message)) return { reply: 'I’ll check the approved supply chests.', intent: 'minecraft_action', actions: [{ tool: 'restock_supplies', args: { routine: 'mining' } }] };
  if (/^(?:recover (?:my|your|the) items|go get (?:my|your) stuff|recover your gear)$/.test(message)) return { reply: 'I’ll check the saved death site and the danger first.', intent: 'minecraft_action', actions: [{ tool: 'recover_items', args: {} }] };
  const place = message.match(/^(?:go|return|head)(?: back)? (?:to )?(.{1,60})$/);
  if (place && locations.some(value => value.id === place[1])) return { reply: `Heading to ${place[1]}.`, intent: 'minecraft_action', actions: [{ tool: 'visit_location', args: { name: place[1] } }] };
  const bring = message.match(/^(?:bring|fetch)(?: me)? (?:(?:a |one )?stack of |(\d+) )([a-z ]+)$/);
  if (bring && playerName) {
    const count = Number(bring[1] || 64), phrase = bring[2];
    let name = phrase === 'wood' || phrase === 'logs' ? 'oak_log' : normalize(phrase).replace(/ /g, '_');
    if (name === 'torch' || name === 'torches') name = 'torch';
    if (count > 0 && count <= 64) return { reply: 'I’ll bring what’s missing, then get back to my task.', intent: 'minecraft_action', actions: [{ tool: 'bring_items', args: { item: name, count, player: playerName } }] };
  }
  if (/^(?:come here|come to me)$/.test(message) && playerName) return { reply: 'Yeah, coming over.', intent: 'minecraft_action', actions: [{ tool:'goto', args:{ player:playerName, tolerance:2 } }] };
  if (/^(?:follow me|follow along)$/.test(message) && playerName) return { reply:'Yeah, I’m with you.', intent:'minecraft_action', actions:[{tool:'follow_player',args:{player:playerName,distance:3}}] };
  if (/^(?:what are you doing|what're you doing)$/.test(message)) return {reply:currentTask ? `I'm working on ${currentTask.name || currentTask.tool}.` : 'Nothing queued up right now.',intent:'minecraft_question',actions:[]};
  const chopping = message.match(/^(?:chop|gather|collect|get)(?: me)?(?: (\d+))?(?: (oak|birch|spruce|jungle|acacia|dark oak|mangrove|cherry))? (?:wood|logs?|trees?)$/);
  if (chopping) {
    const count = Number(chopping[1] || 8);
    if (count < 1 || count > 64) return null;
    return {reply:'Yeah, I’ll grab some wood.',intent:'minecraft_action',actions:[{tool:'chop_tree',args:{count,...(chopping[2]?{species:chopping[2].replaceAll(' ','_')}:{})}}]};
  }
  const dropping = message.match(/^(drop|toss|give|hand)(?: (?:me|to me))? (.+)$/);
  if (!dropping) return null;
  const handoff = /^(give|hand)$/.test(dropping[1]) || /^(?:drop|toss) me /.test(message);
  if (handoff && !playerName) return null;
  const amount = dropping[2].match(/^(?:(all)(?: of)?(?: your| the)? |(\d+) )?(.+)$/);
  const items = ownedItems(amount[3], world.inventory || []);
  if (!items.length || items.length > 6) return null;
  let remaining = amount[2] ? Number(amount[2]) : items.reduce((sum,item)=>sum+item.count,0);
  if (!Number.isSafeInteger(remaining) || remaining < 1 || remaining > 2304) return null;
  const actions = [];
  for (const item of items) {
    const count = Math.min(item.count, remaining); if (!count) break;
    actions.push({tool:handoff?'give_items_to_player':'drop_item',args:{item:item.name,count,...(handoff?{player:playerName}:{})}}); remaining -= count;
  }
  return {reply:handoff?'Yeah, I’ll bring it over.':'Yeah, dropping it here.',intent:'minecraft_action',actions};
}
