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
export function quickPlan(text, { world, playerName, currentTask } = {}) {
  if (!world) return null;
  const message = text.trim().toLowerCase().replace(/^[\s]*(?:hey[, ]+|yo[, ]+)?(?:can you |could you |please )?/, '').replace(/[.!?]+$/, '').replace(/ please$/, '').trim();
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
