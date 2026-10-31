import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import minecraftData from 'minecraft-data';
import {Vec3} from 'vec3';
import {prepareMining,miningPick,miningFoodCount} from '../services/skill-executor/mining-preparation.js';
import {upgradeAutomaticSupplies,AUTOMATIC_SUPPLIES} from '../services/skill-executor/automatic-storage.js';
import {findFood} from '../services/skill-executor/food-search.js';
import {requireNaturalTree} from '../services/skill-executor/index.js';

function fixture(items=[]){
  const rows=new Map(),registry=minecraftData('1.21.4'),bot=new EventEmitter();
  Object.assign(bot,{registry,minenessReady:true,health:20,food:20,game:{dimension:'overworld'},entity:{position:new Vec3(0,64,0)},inventory:{items:()=>items},supportFeature:()=>true,_syncWindow:async()=>{},equip:async()=>{}});
  const store={settings:()=>({realmId:1}),get:name=>rows.get(name)??[],put(name,row){rows.set(name,[...(rows.get(name)??[]).filter(i=>i.id!==row.id),row]);}};
  const service={runtime:{bot},store,reserved:()=>0,threats:()=>[],publish(){},withdraw:async()=>[]};
  const add=(name,count=1,extra={})=>items.push({name,count,type:registry.itemsByName[name].id,...extra});
  return {bot,rows,store,service,items,add};
}
test('ready mining kit accepts cooked food instead of demanding bread and a better pick instead of stone',async()=>{
  const f=fixture();f.add('iron_pickaxe');f.add('cooked_beef',8);f.add('torch',16);
  assert.equal((await prepareMining(f.service,new AbortController().signal)).success,true);
  assert.equal(f.store.get('miningPreparation')[0].phase,'ready');assert.equal(miningFoodCount(f.service),8);
});
test('mining checks chests for missing kit and uses confirmed withdrawals before crafting',async()=>{
  const f=fixture(),requests=[];
  f.service.withdraw=async supplies=>{requests.push(...supplies);for(const {name,count} of supplies)if(['stone_pickaxe','torch','bread'].includes(name)&&!f.items.some(i=>i.name===name))f.add(name,count);return [];};
  assert.equal((await prepareMining(f.service,new AbortController().signal)).success,true);
  assert.ok(requests.some(r=>r.name==='stone_pickaxe'));assert.ok(requests.some(r=>r.name==='bread'));assert.ok(miningPick(f.bot));
});
test('mining never starts supply transfers after cancellation or with unverified inventory',async()=>{
  const f=fixture();let called=false;f.service.withdraw=async()=>{called=true;};const controller=new AbortController();controller.abort();
  await assert.rejects(prepareMining(f.service,controller.signal),{name:'AbortError'});assert.equal(called,false);
  f.bot.companionInventoryUnverified=true;await assert.rejects(prepareMining(f.service,new AbortController().signal),/confirmed inventory/);assert.equal(called,false);
});
test('mining tool policy rejects wooden, Silk Touch and worn picks; food respects reservations',()=>{
  const f=fixture();f.add('wooden_pickaxe');assert.equal(miningPick(f.bot),undefined);
  f.add('stone_pickaxe',1,{durabilityUsed:120});assert.equal(miningPick(f.bot),undefined);
  f.add('diamond_pickaxe',1,{enchants:[{name:'silk_touch',lvl:1}]});assert.equal(miningPick(f.bot),undefined);
  f.add('iron_pickaxe');assert.equal(miningPick(f.bot).name,'iron_pickaxe');f.add('bread',8);f.service.reserved=()=>8;assert.equal(miningFoodCount(f.service),0);
});
test('legacy automatic chest permissions gain mining supplies while custom permissions are preserved',()=>{
  const f=fixture(),legacy=AUTOMATIC_SUPPLIES.filter(name=>!['wooden_pickaxe','stone_pickaxe','iron_pickaxe','furnace','iron_ingot','raw_iron'].includes(name));
  f.store.put('supplyChests',{id:'legacy',automatic:true,approved:true,allowedItems:legacy});
  f.store.put('supplyChests',{id:'custom',automatic:true,approved:true,allowedItems:['bread']});
  f.store.put('supplyChests',{id:'manual',approved:true,allowedItems:legacy});
  upgradeAutomaticSupplies(f.store);upgradeAutomaticSupplies(f.store);
  assert.ok(f.store.get('supplyChests').find(c=>c.id==='legacy').allowedItems.includes('stone_pickaxe'));
  assert.deepEqual(f.store.get('supplyChests').find(c=>c.id==='custom').allowedItems,['bread']);assert.equal(f.store.get('supplyChests').find(c=>c.id==='manual').supplyPolicyVersion,undefined);
});
test('food gathering rechecks an approved chest even when its saved stock was empty',async()=>{
  const f=fixture();f.store.put('supplyChests',{id:'food',approved:true,realmId:1,dimension:'overworld',allowedItems:['bread'],inventory:[]});let checked=false;
  f.service.execute=async name=>{assert.equal(name,'restock_food');checked=true;f.add('bread',8);return {success:true,summary:'Checked actual chest'};};
  f.bot.pathfinder={getPathTo:()=>({status:'success',path:[]}),movements:{},goto:async()=>{},setGoal(){},stop(){}};
  assert.equal((await findFood(f.service,new AbortController().signal)).success,true);assert.equal(checked,true);
});

test('partial crafting harvests can finish their observed natural tree without accepting unknown floating logs',()=>{
  const f=fixture(),blocks=new Map(),put=(x,y,name)=>{const position=new Vec3(x,y,0);blocks.set(position.toString(),{name,position,boundingBox:'block'});};
  put(8,63,'grass_block');for(const y of [64,65,66])put(8,y,'oak_log');put(8,67,'oak_leaves');
  f.bot.blockAt=p=>blocks.get(p.toString())??{name:'air',boundingBox:'empty',position:p};
  f.bot.version='1.21.4';f.bot.findBlocks=({matching})=>[...blocks.values()].filter(block=>typeof matching==='function'?matching(block):block.name==='oak_leaves').map(b=>b.position);
  assert.equal(requireNaturalTree(f.bot).position.y,64);
  blocks.delete(new Vec3(8,64,0).toString());assert.equal(requireNaturalTree(f.bot).position.y,65);
  put(8,63,'stone');assert.throws(()=>requireNaturalTree(f.bot),/not rooted/);
});
