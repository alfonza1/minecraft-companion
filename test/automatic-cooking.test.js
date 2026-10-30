import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {Vec3} from 'vec3';
import {availableCookingFuel,protectedCookingSource} from '../services/skill-executor/cooking-preparation.js';
import {cookFood} from '../services/skill-executor/survival.js';
import {chooseIdleWork} from '../services/skill-executor/idle-work.js';

function fixture(){
  const rows=new Map(),bot=new EventEmitter();let inventory=[];
  const store={settings:()=>({realmId:1}),get:name=>rows.get(name)??[],put(name,value){rows.set(name,[...(rows.get(name)??[]).filter(row=>row.id!==value.id),value]);}};
  Object.assign(bot,{minenessReady:true,health:20,food:20,game:{dimension:'overworld'},entity:{position:new Vec3(0,64,0)},inventory:{items:()=>inventory},supportFeature:()=>true,_syncWindow:async()=>{}});
  const service={runtime:{bot},store,reserved:()=>0,threats:()=>[],publish(){}};
  return {bot,store,service,setItems:items=>{inventory=items;}};
}
test('fuel selection accounts for yields, reservations and protected item variants',()=>{
  const f=fixture();f.setItems([{name:'coal',count:1},{name:'oak_planks',count:6}]);
  assert.equal(availableCookingFuel(f.service,8).name,'coal');assert.equal(availableCookingFuel(f.service,9).name,'oak_planks');
  f.service.reserved=name=>name==='coal'?1:0;assert.equal(availableCookingFuel(f.service,8).name,'oak_planks');
  f.setItems([{name:'oak_planks',count:64,customName:'Building reserve'}]);assert.equal(availableCookingFuel(f.service,1),undefined);
});
test('automatic furnace quarry avoids the base, known chests and saved building footprints',()=>{
  const f=fixture();f.store.put('locations',{id:'home',name:'Home',realmId:1,dimension:'overworld',position:{x:0,y:64,z:0}});
  assert.equal(protectedCookingSource(f.service,new Vec3(4,64,0)),true);
  assert.equal(protectedCookingSource(f.service,new Vec3(12,64,0)),false);
  f.store.put('supplyChests',{id:'chest',realmId:1,dimension:'overworld',position:{x:12,y:64,z:0}});assert.equal(protectedCookingSource(f.service,new Vec3(12,64,0)),true);
  f.store.put('projects',{id:'project',blueprint:{dimensions:{x:4,y:4,z:4}},checkpoint:{realmId:1,dimension:'overworld',origin:{x:25,y:64,z:0}}});assert.equal(protectedCookingSource(f.service,new Vec3(26,64,0)),true);
});
test('cancelled cooking cannot open or prepare a furnace',async()=>{
  const f=fixture(),controller=new AbortController();let opened=false;f.bot.openFurnace=()=>{opened=true;};controller.abort();
  await assert.rejects(cookFood(f.service,{count:2},controller.signal),{name:'AbortError'});assert.equal(opened,false);
});
test('idle cooking is selected even with eight raw food items and no existing storage or furnace',()=>{
  const f=fixture();f.setItems([{name:'beef',count:8}]);f.bot.inventory.emptySlotCount=()=>30;
  f.service.runtime.isActive=()=>true;f.service.preferences=()=>({busyMode:true,autoDeposit:true});f.store.settings=()=>({realmId:1,autonomy:'helpful'});
  assert.equal(chooseIdleWork(f.service).tool,'cook_food');
});
test('interrupted furnace contents must match the saved job before collecting anything',async()=>{
  const f=fixture();f.store.put('furnaceJobs',{id:'own',realmId:1,dimension:'overworld',position:{x:0,y:64,z:0},input:'beef',count:2,status:'needs-check',phase:'cooking',fuelName:'coal'});
  let taken=false;
  f.bot.pathfinder={goto:async()=>{},setGoal(){},stop(){}};f.bot.blockAt=p=>({name:'furnace',position:p});
  f.bot.openFurnace=async()=>({inputItem:()=>null,outputItem:()=>({name:'cooked_mutton',count:2}),fuelItem:()=>null,takeOutput:async()=>{taken=true;},close(){}});
  await assert.rejects(cookFood(f.service,{count:2},new AbortController().signal),/do not match/);assert.equal(taken,false);
});
