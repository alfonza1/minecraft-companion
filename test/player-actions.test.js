import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Vec3 } from 'vec3';
import { dropInventoryItem } from '../services/skill-executor/items.js';
import { uniqueTreeLogs } from '../services/skill-executor/tree-targets.js';
import { waitForMiningFooting, equipFastestTool } from '../src/mining.js';
import { quickPlan } from '../services/agent-orchestrator/quick-actions.js';
import { validatePlan, createOrchestrator } from '../services/agent-orchestrator/index.js';
import { canSprint } from '../services/companion-runtime/index.js';
import { chopNaturalTrees } from '../services/skill-executor/index.js';

function inventoryBot({ accepted = true, cancel } = {}) {
  let actual = 7, predicted = actual;
  const clicks = [], bot = new EventEmitter();
  Object.assign(bot, {
    currentWindow: null, inventory: { selectedItem: null, items: () => predicted ? [{ name:'oak_log',count:predicted,slot:9 }] : [] },
    supportFeature: () => true, _syncWindow: async () => { predicted = actual; },
    clickWindow: async (slot, button, mode) => { clicks.push({slot,button,mode}); const quantity = button ? predicted : 1; predicted -= quantity; if (accepted) actual -= quantity; cancel?.(); },
  });
  return { bot, clicks, actual: () => actual };
}
test('partial and whole-stack drops report server-confirmed counts without cursor items', async () => {
  for (const count of [3, 7, 64]) {
    const fixture = inventoryBot();
    const result = await dropInventoryItem(fixture.bot,{item:'oak_log',count},new AbortController().signal);
    assert.equal(result.dropped,Math.min(count,7)); assert.equal(fixture.actual(),7-result.dropped);
    assert.equal(result.recipientPickupVerified,false); assert.equal(fixture.bot.companionInventoryUnverified,false);
    assert.ok(fixture.clicks.every(click=>click.mode===4));
    if (count>=7) assert.equal(fixture.clicks.length,1);
  }
});
test('server rejection never becomes a successful predicted handoff', async () => {
  const fixture=inventoryBot({accepted:false});
  const result=await dropInventoryItem(fixture.bot,{item:'oak_log',count:3},new AbortController().signal);
  assert.equal(result.success,false); assert.equal(result.dropped,0); assert.equal(fixture.actual(),7);
});

test('player handoff approaches pickup range and steps away before authoritative reconciliation', async () => {
  const fixture = inventoryBot(), bot = fixture.bot, routes = [];
  bot.entity = { position: new Vec3(0.5, 5, 0.5) };
  bot.players = { Alfonza: { entity: { position: new Vec3(4.5, 5, 0.5) } } };
  bot.pathfinder = { goto: async goal => { routes.push(goal); bot.entity.position = new Vec3(goal.x, goal.y, goal.z); }, setGoal() {} };
  bot.lookAt = async () => {}; bot.waitForTicks = async () => {};
  const result = await dropInventoryItem(bot, { item: 'oak_log', count: 3, player: 'Alfonza' }, new AbortController().signal);
  assert.equal(result.dropped, 3); assert.equal(routes.length, 2);
  assert.equal(routes[0].rangeSq, 0.75 * 0.75);
  assert.ok(bot.entity.position.distanceTo(bot.players.Alfonza.entity.position) >= 3);
  assert.equal(result.recipientPickupVerified, false); assert.equal(bot.companionInventoryUnverified, false);
});
test('cancelling a drop stops subsequent clicks and still reconciles the completed transfer', async () => {
  const controller=new AbortController(),fixture=inventoryBot({cancel:()=>controller.abort()});
  await assert.rejects(dropInventoryItem(fixture.bot,{item:'oak_log',count:3},controller.signal),{name:'AbortError'});
  assert.equal(fixture.clicks.length,1); assert.equal(fixture.actual(),6); assert.equal(fixture.bot.companionInventoryUnverified,false);
  assert.equal(fixture.bot.companionInventorySyncing,false);
});
test('tree targets deduplicate block coordinates even when every observation creates a new object', () => {
  const root={name:'oak_log',position:new Vec3(0,5,0)};
  const bot={blockAt:position=>position.x===0&&position.z===0&&position.y>=5&&position.y<=8?{name:'oak_log',position}:null};
  const blocks=uniqueTreeLogs(bot,root,8);
  assert.equal(blocks.length,4); assert.equal(new Set(blocks.map(block=>block.position.toString())).size,4);
  assert.deepEqual(blocks.map(block=>block.position.y),[5,6,7,8]);
});
test('digging waits for landing instead of locking in the airborne mining penalty', async () => {
  const bot={entity:{onGround:false}},controller=new AbortController();
  const landing=setTimeout(()=>{bot.entity.onGround=true;},70);
  try { await waitForMiningFooting(bot,controller.signal); assert.equal(bot.entity.onGround,true); }
  finally {clearTimeout(landing);}
  bot.entity.onGround=false;controller.abort();await assert.rejects(waitForMiningFooting(bot,controller.signal),{name:'AbortError'});
});
test('tool choice includes modern efficiency enchantments and avoids redundant equip calls', async () => {
  const plain={name:'diamond_axe',type:1,enchants:[]}, enchanted={name:'iron_axe',type:2,enchants:[{name:'efficiency',lvl:4}]};
  let equipped=0;const bot={entity:{effects:{}},heldItem:plain,inventory:{slots:[],items:()=>[plain,enchanted]},getEquipmentDestSlot:()=>5,equip:async item=>{equipped++;bot.heldItem=item;}};
  const block={canHarvest:()=>true,digTime:(type,_creative,_water,_air,enchants)=>enchants.some(e=>e.name==='efficiency')?100:type?500:3000};
  await equipFastestTool(bot,block,new AbortController().signal);assert.equal(bot.heldItem,enchanted);
  await equipFastestTool(bot,block,new AbortController().signal);assert.equal(equipped,1);
});
test('a fast held tool cannot override the required harvesting tool', async () => {
  const pickaxe={type:2,name:'iron_pickaxe'},axe={type:1,name:'diamond_axe'};
  const bot={entity:{effects:{}},heldItem:axe,inventory:{slots:[],items:()=>[pickaxe,axe]},getEquipmentDestSlot:()=>5,equip:async item=>{bot.heldItem=item;}};
  await equipFastestTool(bot,{name:'diamond_ore',canHarvest:type=>type===2,digTime:type=>type===1?100:500},new AbortController().signal);
  assert.equal(bot.heldItem,pickaxe);
});
test('wood gathering stops before destroying logs when inventory cannot hold any', async () => {
  const root={name:'oak_log',position:new Vec3(0,5,0)},soil={name:'dirt',boundingBox:'block'};
  const bot={version:'1.16.5',registry:{itemsByName:{oak_log:{stackSize:64}}},inventory:{items:()=>[],emptySlotCount:()=>0},
    findBlocks:({matching})=>matching(root)?[root.position]:[new Vec3(0,9,0)],blockAt:position=>position.y===4?soil:root};
  const result=await chopNaturalTrees(bot,{run:(_name,work)=>work(new AbortController().signal)},{count:8});
  assert.equal(result.success,false);assert.equal(result.mined,0);assert.equal(result.collected,0);assert.match(result.blocked,/inventory is full/);
});
const context={playerName:'Alfonza',world:{inventory:[{name:'oak_log',displayName:'Oak Log',count:10}]}};
test('common commands route immediately but general conversation never becomes a game action', () => {
  for(const message of ['give me the wood','drop 3 oak logs','can you follow me?','get 16 oak logs'])assert.ok(validatePlan(quickPlan(message,context)));
  assert.equal(quickPlan('give me the wood',context).actions[0].tool,'give_items_to_player');
  assert.equal(quickPlan('drop 3 oak logs',context).actions[0].args.count,3);
  for(const text of ['give me advice about Java','what movie should I watch','what does drop mean in Python','get 999 wood'])assert.equal(quickPlan(text,context),null);
});
test('direct handoff requests bypass inference and model budgets while pause still gates them', async () => {
  const records=new Map(),executed=[];let active=true,calls=0;
  const store={get:c=>records.get(c)||[],put:(c,v)=>records.set(c,[...(records.get(c)||[]),v]),settings:()=>({playerName:'Alfonza',maxRequestsPerHour:0,maxInputTokens:0})};
  const runtime={isActive:()=>active,snapshot:()=>({world:context.world}),execute:async(tool,args)=>{executed.push({tool,args});return{success:true}}};
  const orchestrator=createOrchestrator({runtime,store,publish:()=>{},request:async()=>{calls++;throw Error('Unexpected inference')}});
  await orchestrator.respond('give me the wood');await new Promise(resolve=>setImmediate(resolve));
  assert.equal(calls,0);assert.equal(orchestrator.usage.requests,0);assert.equal(executed[0].tool,'give_items_to_player');
  active=false;await assert.rejects(orchestrator.respond('drop the wood'),/Resume/);assert.equal(executed.length,1);
  await orchestrator.close();
});
test('quick status questions leave ongoing gameplay running', async () => {
  let release, cancelled=0;
  const records=new Map(),store={get:c=>records.get(c)||[],put:(c,v)=>records.set(c,[...(records.get(c)||[]),v]),settings:()=>({playerName:'Alfonza'})};
  const runtime={isActive:()=>true,snapshot:()=>({world:context.world,currentTask:{name:'chopping wood'}}),execute:()=>new Promise(resolve=>{release=resolve}),cancelTask:async()=>{cancelled++;release({success:true})}};
  const orchestrator=createOrchestrator({runtime,store,publish:()=>{},request:async()=>{throw Error('Unexpected inference')}});
  await orchestrator.respond('get wood');assert.match(await orchestrator.respond('what are you doing?'),/chopping wood/);assert.equal(cancelled,0);
  release({success:true});await new Promise(resolve=>setImmediate(resolve));await orchestrator.close();
});
test('Stop wins while a quick handoff waits for the previous action to finish cancelling', async () => {
  let release,beginIdle,finishIdle;
  const idleStarted=new Promise(resolve=>{beginIdle=resolve}),idleFinished=new Promise(resolve=>{finishIdle=resolve});
  const records=new Map(),executed=[],store={get:c=>records.get(c)||[],put:(c,v)=>records.set(c,[...(records.get(c)||[]),v]),settings:()=>({playerName:'Alfonza'})};
  const runtime={actionEpoch:0,isActive:()=>true,snapshot:()=>({world:context.world}),execute:tool=>{executed.push(tool);return new Promise(resolve=>{release=resolve})},
    waitForIdle:async()=>{beginIdle();await idleFinished;},cancelTask:async()=>{runtime.actionEpoch++;release?.({success:false});await orchestrator.cancel();}};
  const orchestrator=createOrchestrator({runtime,store,publish:()=>{},request:async()=>{throw Error('Unexpected inference')}});
  await orchestrator.respond('get wood');
  const handoff=orchestrator.respond('give me the wood');
  const stopped=assert.rejects(handoff,/stopped before it could begin/);
  await idleStarted;await orchestrator.respond('stop');finishIdle();await stopped;
  assert.deepEqual(executed,['chop_tree']);await orchestrator.close();
});
test('brisk travel sprints only when fed, healthy and outside nearby hostile threats', () => {
  const bot={entity:{position:new Vec3(0,5,0)},food:20,health:20,entities:{}};
  assert.equal(canSprint(bot,{}),true);assert.equal(canSprint(bot,{movementSpeed:'normal'}),false);
  bot.food=8;assert.equal(canSprint(bot,{}),false);bot.food=20;
  bot.entities={1:{name:'creeper',position:new Vec3(3,5,0)}};assert.equal(canSprint(bot,{}),false);
});
