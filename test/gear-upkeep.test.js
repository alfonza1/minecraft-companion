import test from 'node:test';
import assert from 'node:assert/strict';
import minecraftData from 'minecraft-data';
import {Vec3} from 'vec3';
import {gearPlan,gearNeedsAttention,maintainGear,maintainMiningTool} from '../services/skill-executor/gear-upkeep.js';
import {bestOwnedGear,replacementThreshold} from '../services/skill-executor/gear-policy.js';
import {equipFastestTool} from '../src/mining.js';
import {chooseIdleWork} from '../services/skill-executor/idle-work.js';
import {quickPlan} from '../services/agent-orchestrator/quick-actions.js';
import {cookFood} from '../services/skill-executor/survival.js';

function fixture(items=[]){
  const rows=new Map(),slots=[],registry=minecraftData('1.21.4');
  const bot={registry,minenessReady:true,health:20,food:20,game:{dimension:'overworld'},entity:{position:new Vec3(0,64,0),effects:{}},inventory:{items:()=>items,slots,emptySlotCount:()=>20},getEquipmentDestSlot:slot=>({head:5,torso:6,legs:7,feet:8})[slot]};
  const store={settings:()=>({realmId:1,autonomy:'helpful'}),get:name=>rows.get(name)??[]};
  const service={runtime:{bot,isActive:()=>true},store,reserved:()=>0,preferences:()=>({busyMode:true,autoGear:true}),threats:()=>[],publish(){}};
  return {bot,service,rows,slots};
}
const material=(name,count)=>({name,count});

test('gear upgrade plans protect reservations and never claim shared diamonds',()=>{
  const f=fixture([material('iron_ingot',3),material('diamond',3)]);
  assert.equal(gearPlan(f.service).item,'diamond_pickaxe');
  f.service.reserved=name=>name==='diamond'?3:0;assert.equal(gearPlan(f.service).item,'iron_pickaxe');
  f.service.reserved=()=>3;assert.equal(gearPlan(f.service),null);
  f.rows.set('supplyChests',[{approved:true,realmId:1,dimension:'overworld',position:{x:1,y:64,z:0},observedAt:new Date().toISOString(),allowedItems:['diamond'],inventory:[material('diamond',64)]}]);
  assert.equal(gearPlan(f.service),null);
});

test('storage supplies must be approved, recent, nearby and in this Realm',()=>{
  const f=fixture(),chest={approved:true,realmId:1,dimension:'overworld',position:{x:2,y:64,z:0},observedAt:new Date().toISOString(),allowedItems:['iron_ingot'],inventory:[material('iron_ingot',3)]};
  f.rows.set('supplyChests',[chest]);assert.equal(gearPlan(f.service).item,'iron_pickaxe');
  for(const patch of [{approved:false},{realmId:2},{dimension:'the_nether'},{position:{x:100,y:64,z:0}},{observedAt:'2000-01-01'}]){f.rows.set('supplyChests',[{...chest,...patch}]);assert.equal(gearPlan(f.service),null);}
});

test('equipped armor counts as owned and usable custom gear is preserved',()=>{
  const f=fixture([material('iron_ingot',64)]);f.slots[6]={name:'iron_chestplate',count:1,slot:6,durabilityUsed:0};
  assert.equal(gearPlan(f.service,{family:'chestplate'}),null);
  f.bot.inventory.items=()=>[material('diamond',8)];f.slots[6].customName='My favorite';assert.equal(gearPlan(f.service,{family:'chestplate'}),null);
  delete f.slots[6].customName;f.slots[6].enchants=[{name:'protection',lvl:1}];assert.equal(gearPlan(f.service,{family:'chestplate'}),null);
});

test('tool replacement uses eight percent or sixteen uses and prefers a healthy spare',()=>{
  const old={name:'diamond_pickaxe',count:1,slot:10,durabilityUsed:1500},spare={name:'iron_pickaxe',count:1,slot:11,durabilityUsed:0};
  const f=fixture([old,spare]);assert.equal(replacementThreshold(f.bot,old),125);assert.equal(bestOwnedGear(f.bot,'pickaxe'),spare);
  assert.equal(gearPlan(f.service,{family:'pickaxe'}),null);
});

test('mining switches to a fresh same-tier spare instead of using a tool to breaking point',async()=>{
  const old={name:'iron_axe',count:1,slot:10,type:1,durabilityUsed:235},spare={name:'iron_axe',count:1,slot:11,type:1,durabilityUsed:0};
  const f=fixture([old,spare]);f.bot.heldItem=old;let equipped;
  f.bot.equip=async item=>{equipped=item;};
  await equipFastestTool(f.bot,{canHarvest:()=>true,digTime:type=>type===1?100:1000},new AbortController().signal);assert.equal(equipped,spare);
});

test('automatic gear defaults on, obeys opt-out and pauses without any world actions',async()=>{
  const f=fixture([material('iron_ingot',3),material('bread',12)]);
  assert.equal(chooseIdleWork(f.service).tool,'maintain_gear');
  f.service.preferences=()=>({busyMode:true,autoGear:false});assert.notEqual(chooseIdleWork(f.service).tool,'maintain_gear');
  f.service.runtime.isActive=()=>false;assert.equal(chooseIdleWork(f.service).tool,undefined);
  const controller=new AbortController();controller.abort();await assert.rejects(maintainGear(f.service,controller.signal),{name:'AbortError'});
});

test('gear furnace jobs are separate from meals and gear commands need no model',()=>{
  const f=fixture();f.rows.set('furnaceJobs',[{category:'gear',status:'needs-check',realmId:1,dimension:'overworld'}]);assert.equal(gearNeedsAttention(f.service),true);
  assert.equal(quickPlan('Can you upgrade your gear?',{world:{inventory:[]}}).actions[0].tool,'maintain_gear');
  assert.equal(quickPlan('Why upgrade gear?',{world:{inventory:[]}}),null);
});

test('meal recovery never opens or consumes a saved gear-smelting batch',async()=>{
  const f=fixture();let opened=false;f.bot.openFurnace=async()=>{opened=true;throw new Error('Must not open a gear batch');};
  f.rows.set('furnaceJobs',[{category:'gear',status:'needs-check',realmId:1,dimension:'overworld',input:'raw_iron',output:'iron_ingot',count:3}]);
  assert.equal((await cookFood(f.service,{count:2},new AbortController().signal)).cooked,0);assert.equal(opened,false);
});

test('wear near the replacement boundary is confirmed, while healthy tools need no sync',async()=>{
  const old={name:'iron_axe',count:1,slot:10,durabilityUsed:229},f=fixture([old]);let syncs=0;
  f.bot.heldItem=old;f.bot.supportFeature=()=>true;f.bot._syncWindow=async()=>{syncs++;old.durabilityUsed=230;};
  await maintainMiningTool(f.service,{name:'oak_log'},new AbortController().signal);assert.equal(syncs,1);assert.equal(old.durabilityUsed,230);
  old.durabilityUsed=0;await maintainMiningTool(f.service,{name:'oak_log'},new AbortController().signal);assert.equal(syncs,1);
});
