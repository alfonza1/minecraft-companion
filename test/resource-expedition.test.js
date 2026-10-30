import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Vec3 } from 'vec3';
import { findResource } from '../services/skill-executor/resource-search.js';
import { safeSearchSegment } from '../services/skill-executor/search-route.js';
import { TEAMMATE_ACTIONS } from '../services/skill-executor/teammate.js';

function fixture({food=16,home=true}={}) {
  const collections=new Map(),moves=[],bot=new EventEmitter();let items=[{name:'bread',count:food}];
  const store={settings:()=>({realmId:1}),get:name=>[...(collections.get(name)?.values()??[])],put(name,row){if(!collections.has(name))collections.set(name,new Map());collections.get(name).set(row.id,structuredClone(row));}};
  Object.assign(bot,{minenessReady:true,health:20,food:20,entity:{position:new Vec3(0,64,0),onGround:true},registry:{blocksByName:{bamboo:{id:1}}},game:{dimension:'overworld'},time:{timeOfDay:1000},inventory:{items:()=>items},pathfinder:{stop(){}},clearControlStates(){},findBlocks:()=>[],canSeeBlock:()=>true,
    blockAt:p=>({name:p.y<64?'stone':'air',position:p,boundingBox:p.y<64?'block':'empty'})});
  if(home)store.put('locations',{id:'home',name:'Home',realmId:1,dimension:'overworld',position:{x:0,y:64,z:0}});
  const service={runtime:{bot},store,threats:()=>[],reserved:()=>0,publish(){},notice(){}};
  const navigate=async(_bot,p,_tolerance,signal)=>{signal.throwIfAborted();moves.push(p.clone());bot.entity.position=p.clone();bot.emit('physicsTick');};
  return {service,store,bot,moves,navigate,setItems:value=>{items=value;}};
}

test('expanding search travels farther than 64 blocks and retraces home with persisted completion',async()=>{
  const f=fixture();
  const result=await findResource(f.service,{item:'bamboo',radius:128,steps:24},new AbortController().signal,{navigate:f.navigate});
  assert.ok(Math.max(...f.moves.map(p=>p.distanceTo(new Vec3(0,64,0))))>64);
  assert.equal(result.returnedHome,true);assert.ok(f.bot.entity.position.equals(new Vec3(0,64,0)));
  const saved=f.store.get('expeditions')[0];assert.equal(saved.status,'returned');assert.equal(saved.route.length,0);
});

test('missing home or travel food limits search to nearby terrain and explains prerequisites',async()=>{
  for(const options of [{home:false},{food:0}]){
    const f=fixture(options),result=await findResource(f.service,{item:'bamboo'},new AbortController().signal,{navigate:f.navigate});
    assert.equal(result.radius,64);assert.ok(f.moves.every(p=>p.distanceTo(new Vec3(0,64,0))<=64));assert.match(result.summary,/Home|food/);
  }
});

test('valuable loot without approved storage prevents departure',async()=>{
  const f=fixture();f.setItems([{name:'diamond',count:3},{name:'bread',count:16}]);
  await assert.rejects(findResource(f.service,{item:'bamboo'},new AbortController().signal,{navigate:f.navigate}),/No clear observed chest site|Home\/spawn/);
  assert.equal(f.moves.length,0);
});

test('early daylight or hunger reserve triggers return before more scouting',async()=>{
  const f=fixture();let outward=0;
  const navigate=async(...args)=>{await f.navigate(...args);if(++outward===3)f.bot.food=15;};
  const result=await findResource(f.service,{item:'bamboo'},new AbortController().signal,{navigate});
  assert.equal(result.returnedHome,true);assert.match(result.summary,/Turning back early/);assert.equal(f.bot.entity.position.x,0);
});

test('pause saves route without further movement and resume returns home before searching again',async()=>{
  const f=fixture(),controller=new AbortController();let outward=0;
  const navigate=async(...args)=>{await f.navigate(...args);if(++outward===10)controller.abort();};
  await assert.rejects(findResource(f.service,{item:'bamboo'},controller.signal,{navigate}),{name:'AbortError'});
  assert.equal(f.moves.length,10);assert.equal(f.store.get('expeditions')[0].status,'paused');
  f.bot.findBlocks=()=>{throw new Error('Must return before more searching');};
  const result=await findResource(f.service,{item:'bamboo'},new AbortController().signal,{navigate:f.navigate});
  assert.equal(result.returnedHome,true);assert.equal(f.store.get('expeditions')[0].status,'returned');
});

test('changed or unloaded return paths remain checkpointed and require help',async()=>{
  const f=fixture();let outward=0;
  const original=f.bot.blockAt;
  const navigate=async(...args)=>{await f.navigate(...args);if(++outward===2){f.bot.food=15;f.bot.blockAt=p=>p.x<8?null:original(p);}};
  await assert.rejects(findResource(f.service,{item:'bamboo'},new AbortController().signal,{navigate}),/unsafe/);
  assert.equal(f.store.get('expeditions')[0].status,'needs-help');assert.ok(f.store.get('expeditions')[0].route.length);
});

test('a search never crosses an observed hole and rejects unbounded model arguments',()=>{
  const f=fixture(),original=f.bot.blockAt;f.bot.blockAt=p=>p.x===4&&p.y===63?null:original(p);
  assert.equal(safeSearchSegment(f.bot,new Vec3(0,64,0),new Vec3(8,64,0)),false);
  assert.throws(()=>TEAMMATE_ACTIONS.find_resource.parse({item:'bamboo',radius:10000}));
  assert.throws(()=>TEAMMATE_ACTIONS.find_resource.parse({item:'bamboo',steps:10000}));
});

test('late daylight prevents departure and foreign Realm routes cannot be followed',async()=>{
  const f=fixture();f.bot.time.timeOfDay=11500;
  const result=await findResource(f.service,{item:'bamboo'},new AbortController().signal,{navigate:f.navigate});
  assert.equal(result.visited,0);assert.equal(result.returnedHome,true);
  f.store.put('expeditions',{id:'resource-search',realmId:2,dimension:'overworld',route:[{x:0,y:64,z:0}],status:'paused'});
  const before=f.moves.length;
  await assert.rejects(findResource(f.service,{item:'bamboo'},new AbortController().signal,{navigate:f.navigate}),/another Realm/);assert.equal(f.moves.length,before);
});
