import test from 'node:test';
import assert from 'node:assert/strict';
import { Vec3 } from 'vec3';
import { createPerformanceMetrics } from '../services/companion-runtime/performance.js';
import { requestMaterial, resolveMaterialRequest } from '../services/resource-ledger/material-requests.js';
import { acquisitionAdvice } from '../services/resource-ledger/acquisition.js';
import { quickPlan } from '../services/agent-orchestrator/quick-actions.js';
import { orderPlacements, phasePlacements } from '../services/build-executor/work-order.js';
import { speechChunks, speechStream } from '../services/voice/streaming.js';
import { equipFastestTool } from '../src/mining.js';
import { findResource } from '../services/skill-executor/resource-search.js';

test('stage timings bound history and record failure without retaining content',async()=>{
  const metrics=createPerformanceMetrics();for(let n=0;n<150;n++)metrics.record('walking',n);
  metrics.record('walking',NaN);await assert.rejects(metrics.measure('model reply',()=>{throw new Error('private');}));
  const [walking,model]=metrics.snapshot();assert.equal(walking.sampleCount,100);assert.equal(walking.count,150);assert.equal(walking.p95Ms,144);assert.equal(model.failures,1);assert.doesNotMatch(JSON.stringify(metrics.snapshot()),/private/);
});

test('hard-material requests persist, avoid repeated notices and resolve only sufficient stock',()=>{
  const rows=new Map(),notices=[],store={get:()=>[...rows.values()],put:(_name,value)=>rows.set(value.id,value)},project={id:'house',name:'Cottage',revision:2};
  const args={store,project,item:'scaffolding',count:12,teammate:{notice:(...args)=>notices.push(args)}};
  assert.equal(requestMaterial(args).code,'MATERIAL_HELP_NEEDED');requestMaterial(args);assert.equal(notices.length,1);assert.match(notices[0][0],/bamboo/i);assert.equal(notices[0][1],'blocked');
  resolveMaterialRequest(store,project,'scaffolding',1);assert.equal([...rows.values()][0].status,'requested');
  resolveMaterialRequest(store,project,'scaffolding',12);assert.equal([...rows.values()][0].status,'supplied');
  assert.equal(acquisitionAdvice('bamboo').aiPercent,0);
});

test('explicit resource search and stack commands bypass reasoning but unrelated questions do not',()=>{
  const context={world:{inventory:[]},playerName:'Alfonza'};
  assert.equal(quickPlan('Can you find bamboo?',context).actions[0].tool,'find_resource');
  assert.equal(quickPlan('find a source of jungle logs',context).actions[0].args.item,'jungle_log');
  assert.equal(quickPlan('get another stack of oak logs',context).actions[0].args.count,64);
  for(const query of ['find a movie','find a good restaurant','how do I find bamboo','find house options on youtube'])assert.equal(quickPlan(query,context),null);
  assert.equal(quickPlan('keep building',context).actions[0].tool,'resume_approved_build');
});

test('placement routes retain layer dependencies and bounded section demand',()=>{
  const blocks=[{x:8,y:0,z:0,name:'stone'},{x:1,y:0,z:0,name:'stone'},{x:0,y:1,z:0,name:'stone'},{x:0,y:4,z:0,name:'stone'}];
  assert.deepEqual(orderPlacements([0,1,2,3],blocks,{x:0,y:0,z:0},{x:0,y:0,z:0}),[1,0,2,3]);
  assert.equal(phasePlacements([0,1,2,3],blocks).length,3);
  const large=Array.from({length:200},(_,x)=>({x,y:0,z:0}));assert.equal(phasePlacements(large.map((_,i)=>i),large).length,128);
});

test('sentence audio yields first WAV before later generation and checks pause between chunks',async()=>{
  assert.deepEqual(speechChunks('Hey. Bring 1.5 stacks, please.'),['Hey.','Bring 1.5 stacks, please.']);
  assert.ok(speechChunks('word '.repeat(100)).every(chunk=>chunk.length<=180));
  const controller=new AbortController(),generated=[],stream=speechStream({text:'First sentence. Second sentence.',signal:controller.signal,gate(){},synthesize:async text=>{generated.push(text);return Buffer.from('RIFF'+text);}});
  const iterator=stream[Symbol.asyncIterator](),first=JSON.parse((await iterator.next()).value.toString());
  assert.match(Buffer.from(first.audio,'base64').toString(),/First sentence/);assert.equal(first.index,0);
  controller.abort();await assert.rejects(iterator.next(),{name:'AbortError'});
});

test('tool selection skips a faster nearly broken tool and equips usable replacement',async()=>{
  const iron={name:'iron_axe',type:1,durabilityUsed:249},stone={name:'stone_axe',type:2,durabilityUsed:0};let equipped;
  const bot={entity:{effects:{}},registry:{itemsByName:{iron_axe:{maxDurability:250},stone_axe:{maxDurability:131}}},inventory:{items:()=>[iron,stone],slots:[]},heldItem:iron,getEquipmentDestSlot:()=>5,equip:async item=>{equipped=item;}};
  await equipFastestTool(bot,{name:'oak_log',canHarvest:()=>true,digTime:type=>type===1?100:type===2?200:1000},new AbortController().signal,{minimumDurability:16});assert.equal(equipped,stone);
});

test('explicit scouting records only visible sources and respects survival safety before movement',async()=>{
  const saved=[],point=new Vec3(2,64,2),anchor=new Vec3(0,64,0);
  const bot={minenessReady:true,health:20,food:20,entity:{position:anchor},inventory:{items:()=>[]},registry:{blocksByName:{bamboo:{id:1}}},game:{dimension:'overworld'},time:{timeOfDay:1000},findBlocks:()=>[point],blockAt:p=>p.equals(point)?{name:'bamboo',position:point}:({name:p.y<64?'stone':'air',boundingBox:p.y<64?'block':'empty',position:p}),canSeeBlock:()=>true,pathfinder:{goto:async()=>{},setGoal(){},stop(){}},clearControlStates(){}};
  const service={runtime:{bot},threats:()=>[],store:{get:()=>[],settings:()=>({realmId:1}),put:(name,row)=>saved.push({name,row})},publish(){}};
  const result=await findResource(service,{item:'bamboo'},new AbortController().signal);
  assert.equal(result.success,true);assert.equal(saved.find(value=>value.name==='resourceLocations').row.provenance,'observed');assert.match(result.summary,/haven't harvested/);
  bot.health=4;await assert.rejects(findResource(service,{item:'bamboo'},new AbortController().signal),/unsafe/);assert.equal(saved.filter(value=>value.name==='resourceLocations').length,1);
});
