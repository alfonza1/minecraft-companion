import test from 'node:test';
import assert from 'node:assert/strict';
import { Vec3 } from 'vec3';
import { storageAnchor,recordServerSpawn } from '../services/skill-executor/storage-policy.js';
import { approvedStores,storeSurplus } from '../services/skill-executor/survival.js';

function fixture(){
  const records=new Map(),store={settings:()=>({realmId:1}),get:name=>[...(records.get(name)?.values()??[])],put(name,row){if(!records.has(name))records.set(name,new Map());records.get(name).set(row.id,structuredClone(row));}};
  const bot={minenessReady:true,health:20,food:20,entity:{position:new Vec3(50,64,0)},game:{dimension:'overworld'}};
  const service={runtime:{bot},store,threats:()=>[]};
  const chest=(id,x,extra={})=>store.put('supplyChests',{id,position:{x,y:64,z:0},realmId:1,dimension:'overworld',approved:true,depositAllowed:true,...extra});
  return {store,bot,service,chest};
}
test('Home storage wins over a closer remote chest and spawn storage',()=>{
  const f=fixture();f.store.put('locations',{id:'home',name:'Home',realmId:1,dimension:'overworld',position:{x:0,y:64,z:0}});
  recordServerSpawn(f.store,1,{location:{x:50,y:64,z:0}},'overworld');
  f.chest('home-chest',5);f.chest('remote-chest',49);f.chest('edge',32);f.chest('outside',33);
  assert.deepEqual(approvedStores(f.service).map(value=>value.id),['home-chest','edge']);
  assert.equal(storageAnchor(f.service).kind,'home');
});
test('saved Home player coordinates may be fractional and normalize to their actual block',()=>{
  const f=fixture();f.store.put('locations',{id:'home',name:'Home',realmId:1,dimension:'overworld',position:{x:.75,y:64.01,z:-.25}});
  assert.deepEqual(storageAnchor(f.service).position,{x:0,y:64,z:-1});f.chest('home-chest',4);
  assert.equal(approvedStores(f.service)[0].id,'home-chest');
});
test('without Home only confirmed Realm/dimension spawn storage is eligible',()=>{
  const f=fixture();f.chest('spawn-chest',48);f.chest('remote',0);
  f.bot.spawnPoint=new Vec3(0,0,0);assert.deepEqual(approvedStores(f.service),[]);
  recordServerSpawn(f.store,1,{globalPos:{dimension:'minecraft:overworld',location:{x:50,y:64,z:0}}},'the_nether');
  assert.deepEqual(approvedStores(f.service).map(value=>value.id),['spawn-chest']);
  assert.equal(storageAnchor(f.service).kind,'spawn');
  f.bot.game.dimension='the_nether';assert.equal(storageAnchor(f.service),null);
});
test('Home in another dimension never silently falls back to spawn',()=>{
  const f=fixture();recordServerSpawn(f.store,1,{location:{x:50,y:64,z:0}},'overworld');
  f.store.put('locations',{id:'home',name:'Home',realmId:1,dimension:'the_nether',position:{x:0,y:64,z:0}});
  assert.equal(storageAnchor(f.service),null);assert.deepEqual(approvedStores(f.service),[]);
});
test('changing Home during approach prevents opening the old deposit chest',async()=>{
  const f=fixture();f.store.put('locations',{id:'home',name:'Home',realmId:1,dimension:'overworld',position:{x:0,y:64,z:0}});f.chest('old-home',4);
  let opened=false;f.bot.pathfinder={goto:async()=>{f.bot.entity.position=new Vec3(4,64,0);f.store.put('locations',{id:'home',name:'Home',realmId:1,dimension:'overworld',position:{x:200,y:64,z:0}});},setGoal(){}};
  f.bot.openContainer=async()=>{opened=true;};
  await assert.rejects(storeSurplus(f.service,new AbortController().signal),/changed/);assert.equal(opened,false);
});
test('spawn observations update persistently and malformed coordinates cannot become an anchor',()=>{
  const f=fixture();recordServerSpawn(f.store,1,{location:{x:0,y:64,z:0}},'overworld');
  recordServerSpawn(f.store,1,{location:{x:100,y:64,z:0}},'overworld');assert.equal(storageAnchor(f.service).position.x,100);
  recordServerSpawn(f.store,1,{location:{x:NaN,y:64,z:0}},'overworld');assert.equal(storageAnchor(f.service).position.x,100);
  f.chest('foreign',100,{realmId:2});f.chest('denied',100,{depositAllowed:false});assert.deepEqual(approvedStores(f.service),[]);
});
