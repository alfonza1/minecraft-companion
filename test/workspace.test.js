import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Fastify from 'fastify';
import { Store } from '../services/memory/store.js';
import { createGameRegistry } from '../packages/game-adapters/index.js';
import { minecraftAdapter,activityProgress as liveActivityProgress,projectResources as liveProjectResources } from '../packages/game-adapters/minecraft.js';
import { strategyFixture } from '../examples/game-adapters/strategy-fixture.js';
import { createWorkspaceService } from '../services/workspace/index.js';
import { registerWorkspaceRoutes } from '../services/workspace/routes.js';
import { calculateMaterials } from '../services/build-planner/materials.js';
import { reconcileProjectInventory,assignmentNeeds,splitAssignments } from '../services/resource-ledger/index.js';

const observedAt='2026-11-01T10:00:00.000Z';
const observationNow=Date.parse(observedAt);
const activityProgress=(state,now=observationNow)=>liveActivityProgress(state,now);
const projectResources=(state,context={})=>liveProjectResources(state,{now:observationNow,...context});
const world={observedAt,inventoryExact:true,inventory:[{name:'oak_log',count:9}],position:{x:1,y:64,z:2},dimension:'overworld',health:20,food:20};
const baseline={state:'BUSY',connection:{status:'connected'},settings:{realmId:1},world,projects:[],tasks:[],currentTask:{id:'task',name:'chop_tree',descriptor:{tool:'chop_tree',args:{count:8,species:'oak'}},baselineInventory:{oak_log:4}}};
const project={id:'home',name:'Shared home',revision:2,status:'building',createdAt:'2026-01-01',materials:{accuracy:'exact-blueprint',craftedItems:[{name:'oak_log',quantity:10}]},blueprint:{blocks:Array.from({length:10},(_,x)=>({x,y:0,z:0,name:'oak_log',section:x<5?'Floor':'Walls'}))},checkpoint:{revision:2,verified:[0,1,2,3],updatedAt:observedAt},assignments:[{material:'oak_log',total:10,aiRequired:5,userRequired:5,aiProgress:2,userProgress:5}]};

test('adapter registry validates identity, rejects playable fixtures and isolates input observations',()=>{
  assert.throws(()=>createGameRegistry([minecraftAdapter,minecraftAdapter]),/Duplicate/);
  assert.throws(()=>createGameRegistry([strategyFixture]),/fixtures/);
  assert.throws(()=>createGameRegistry([{...strategyFixture,descriptor:{...strategyFixture.descriptor,playable:true}}],{allowFixtures:true}),/playable/);
  const registry=createGameRegistry([minecraftAdapter,strategyFixture],{allowFixtures:true});
  const original={stock:[{id:'energy',required:20,quantity:8}]};
  const output=registry.project('strategy-fixture',original);output.resources[0].inventory=999;
  assert.equal(original.stock[0].quantity,8);assert.equal(output.game.playable,false);
  assert.equal(registry.project('strategy-fixture',original).resources[0].missing,12);
  assert.equal(createGameRegistry([minecraftAdapter]).list().length,1);
  assert.throws(()=>registry.get('not-a-game'),/Unsupported/);
});

test('gathering progress uses observed inventory delta and becomes unknown on projected/disconnected observations',()=>{
  assert.deepEqual(activityProgress(baseline),{completed:5,total:8,unit:'items',basis:'Net observed inventory increase during this action; transfers can affect this count.'});
  assert.equal(activityProgress({...baseline,world:{...world,inventoryExact:false}}),null);
  assert.equal(activityProgress({...baseline,connection:{status:'offline'}}),null);
  assert.equal(activityProgress({...baseline,currentTask:{...baseline.currentTask,descriptor:{tool:'find_resource',args:{count:8}}}}),null);
});

test('resource accounting keeps verified construction satisfied and never counts user claims or chest snapshots as spendable stock',()=>{
  const state={...baseline,world:{...world,inventory:[{name:'oak_log',count:2}]},projects:[project]};
  const [row]=projectResources(state,{storage:[{id:'chest',realmId:1,dimension:'overworld',approved:true,allowedItems:['oak_log'],observedAt,inventory:[{name:'oak_log',count:32}]}]});
  assert.equal(row.required,10);assert.equal(row.verifiedPlaced,4);assert.equal(row.remainingToPlace,6);
  assert.equal(row.availableForProject,2);assert.equal(row.missing,4);assert.equal(row.storage,32);assert.equal(row.userReported,5);
  const completed={...project,checkpoint:{...project.checkpoint,verified:Array.from({length:10},(_,i)=>i)}};
  assert.equal(projectResources({...state,world:{...world,inventory:[]},projects:[completed]})[0].missing,0);
  assert.equal(projectResources({...state,projects:[{...project,revision:3}]})[0].verifiedPlaced,0);
  const duplicate={...project,id:'second',createdAt:'2026-02-01',checkpoint:null};
  const rows=projectResources({...state,projects:[project,duplicate]});
  assert.equal(rows.reduce((sum,item)=>sum+item.availableForProject,0),2);
});

test('section progress deduplicates and bounds verified placements, with unknown unloaded world marked stale',()=>{
  const state={...baseline,currentTask:null,projects:[{...project,checkpoint:{...project.checkpoint,verified:[0,0,1,999,-1]}}]};
  const result=minecraftAdapter.project(state,{now:Date.parse(observedAt)+16000});
  assert.equal(result.mission.progress.completed,2);assert.equal(result.mission.sections[0].verified,2);assert.equal(result.session.stale,true);
  const offline=minecraftAdapter.project({...state,world:null,connection:{status:'offline'},state:'DISCONNECTED'});
  assert.equal(offline.activity.state,'disconnected');assert.equal(offline.resources[0].inventory,null);assert.equal(offline.resources[0].missing,null);
  const working=minecraftAdapter.project({...state,currentTask:baseline.currentTask},{now:observationNow});
  assert.equal(working.mission.id,'task');assert.equal(working.mission.progress.completed,5);
});

test('recipe-derived construction coverage reduces total demand without attributing consumed raw materials to a person',()=>{
  const blueprint={version:'1.21.11',provenance:'reconstructed',dimensions:{x:8,y:1,z:1},blocks:Array.from({length:8},(_,x)=>({x,y:0,z:0,name:'oak_planks',properties:{},section:'Floor'}))};
  const materials=calculateMaterials(blueprint);
  const building={id:'recipe-house',name:'Recipe house',revision:1,blueprint,materials,assignments:splitAssignments(materials.raw,50),checkpoint:{revision:1,verified:[0,1,2,3],updatedAt:observedAt}};
  const reconciled=reconcileProjectInventory([building],[],observedAt)[0];
  assert.equal(reconciled.assignments[0].material,'oak_log');assert.equal(reconciled.assignments[0].constructionSatisfied,1);
  assert.equal(reconciled.assignments[0].aiProgress,0);assert.equal(reconciled.assignments[0].userProgress,0);assert.equal(assignmentNeeds(reconciled.assignments[0]),1);
  const rows=projectResources({...baseline,world:{...world,inventory:[]},projects:[reconciled]});
  assert.equal(rows.find(row=>row.kind==='placement').name,'oak_planks');assert.equal(rows.find(row=>row.kind==='raw').name,'oak_log');
  assert.equal(rows.find(row=>row.kind==='raw').verifiedPlaced,1);assert.equal(rows.find(row=>row.kind==='raw').userAssigned,1);
  const completed={...building,checkpoint:{revision:1,verified:[0,1,2,3,4,5,6,7],updatedAt:observedAt}};
  assert.equal(assignmentNeeds(reconcileProjectInventory([completed],[],observedAt)[0].assignments[0]),0);
  const revised={...building,revision:2};assert.equal(reconcileProjectInventory([revised],[],observedAt)[0].assignments[0].constructionSatisfied,0);
});

test('a user-supplied consumed half does not erase the companions remaining half',()=>{
  const blueprint={version:'1.21.11',provenance:'reconstructed',dimensions:{x:100,y:1,z:1},blocks:Array.from({length:100},(_,x)=>({x,y:0,z:0,name:'oak_log',properties:{},section:'Floor'}))};
  const materials=calculateMaterials(blueprint),assignments=splitAssignments(materials.raw,50);assignments[0].userProgress=50;
  const building={id:'user-supplied-half',revision:1,blueprint,materials,assignments,checkpoint:{revision:1,verified:Array.from({length:50},(_,i)=>i),updatedAt:observedAt}};
  const [row]=reconcileProjectInventory([building],[],observedAt)[0].assignments;
  assert.equal(row.constructionSatisfied,50);assert.equal(row.aiRequired,50);assert.equal(assignmentNeeds(row),50);
  const [withStock]=reconcileProjectInventory([building],[{name:'oak_log',count:20}],observedAt)[0].assignments;
  assert.equal(withStock.aiProgress,20);assert.equal(assignmentNeeds(withStock),30);
  building.checkpoint.verified=Array.from({length:100},(_,i)=>i);
  assert.equal(assignmentNeeds(reconcileProjectInventory([building],[],observedAt)[0].assignments[0]),0);
});

test('reservation-aware stock allocation protects each owner without subtracting reservations twice',()=>{
  const requirements={craftedItems:[{name:'oak_log',quantity:5}],raw:[{name:'oak_log',quantity:5}]};
  const first={id:'a',name:'A',createdAt:'a',revision:1,materials:requirements,reservations:{oak_log:5}},second={id:'b',name:'B',createdAt:'b',revision:1,materials:requirements,reservations:{oak_log:5}};
  const state={...baseline,world:{...world,inventory:[{name:'oak_log',count:10}]},projects:[first,second]};
  for(const kind of ['placement','raw']){
    const rows=projectResources(state).filter(row=>row.kind===kind);
    assert.deepEqual(rows.map(row=>row.availableForProject),[5,5]);assert.equal(rows.reduce((sum,row)=>sum+row.availableForProject,0),10);
    const priority=projectResources({...state,world:{...world,inventory:[{name:'oak_log',count:5}]},projects:[{...first,reservations:{}},second]}).filter(row=>row.kind===kind);
    assert.deepEqual(priority.map(row=>row.availableForProject),[0,5]);
  }
});

test('expired or future observations cannot claim spendable stock or current gathering progress',()=>{
  for(const now of [observationNow+15001,observationNow-1]){
    const rows=projectResources({...baseline,projects:[project]},{now});
    assert.equal(rows[0].inventory,null);assert.equal(rows[0].availableForProject,null);assert.equal(rows[0].missing,null);
    assert.equal(activityProgress(baseline,now),null);
  }
});

test('main API exposes only the real adapter and rejects foreign-origin assistance mutations',async t=>{
  const {createApp}=await import('../services/api/index.js');
  const directory=await mkdtemp(join(tmpdir(),'waypoint-adapter-api-')),store=new Store(directory);
  const app=await createApp({store,skipExtensions:true});
  t.after(async()=>{await app.close();await rm(directory,{recursive:true,force:true});});
  const response=await app.inject('/api/state');assert.equal(response.statusCode,200,response.body);
  assert.equal(response.json().workspace.game.id,'minecraft-survival');assert.equal(response.json().workspace.session.connected,false);
  const foreign=await app.inject({method:'POST',url:'/api/workspace/assistance/nonexistent',headers:{origin:'https://foreign.example'},payload:{action:'player',revision:0}});
  assert.equal(foreign.statusCode,403);
  assert.equal((await app.inject('/api/games')).json().games[0].playable,true);
  assert.equal((await app.inject({method:'POST',url:'/api/workspace/game',payload:{gameId:'strategy-fixture'}})).statusCode,409);
});

async function fixture(t){
  const directory=await mkdtemp(join(tmpdir(),'waypoint-workspace-')),store=new Store(directory);
  store.put('projects',structuredClone(project));
  store.put('materialRequests',{id:'home:2:oak_log',projectId:'home',revision:2,item:'oak_log',count:6,status:'requested',reason:'The walls need logs.',at:observedAt});
  const state={...structuredClone(baseline),taskStack:{frames:[]}};
  const runtime=Object.assign(new EventEmitter(),{...state,isActive(){return ['ACTIVE','BUSY'].includes(this.state);},snapshot(){return {...state,state:this.state,connection:this.connection,world:this.world,taskStack:{frames:this.taskStack.frames}};},async suspendWork(){this.suspended=true;}});
  let scheduled=0;runtime.taskStack={frames:[],hold(){this.held=true;},async submit(actions,label,{beforeEnqueue}={}){beforeEnqueue?.();scheduled++;this.frames.push({id:'new',status:'queued',actions,label});}};
  const service=createWorkspaceService({runtime,store,clock:()=>observationNow});
  const app=Fastify();app.setErrorHandler((error,_request,reply)=>reply.code(error.statusCode||400).send({error:error.message}));registerWorkspaceRoutes(app,service);
  t.after(async()=>{await app.close();store.close();await rm(directory,{recursive:true,force:true});});
  return {directory,store,runtime,service,app,scheduled:()=>scheduled};
}

test('real assistance API persists decisions, updates responsibility, rejects stale clicks and never assumes delivery',async t=>{
  const f=await fixture(t),id='material:home:2:oak_log';
  const response=await f.app.inject({method:'POST',url:`/api/workspace/assistance/${id}`,payload:{action:'player',revision:0}});
  assert.equal(response.statusCode,200,response.body);assert.equal(response.json().request.status,'accepted');
  const assignment=f.store.get('projects')[0].assignments[0];assert.equal(assignment.userRequired,10);assert.equal(assignment.aiRequired,0);assert.equal(assignment.userProgress,5);
  assert.equal(f.store.get('materialRequests')[0].status,'requested');
  const repeated=await f.app.inject({method:'POST',url:`/api/workspace/assistance/${id}`,payload:{action:'companion',revision:0}});
  assert.equal(repeated.statusCode,409);assert.equal(f.scheduled(),0);
  const reopened=new Store(f.directory);assert.equal(reopened.get('assistance')[0].owner,'player');reopened.close();
  assert.equal(f.service.snapshot({...baseline,projects:f.store.get('projects')}).assistance[0].status,'accepted');
});

test('companion requests submit real bounded tasks and paused requests cannot trigger gameplay',async t=>{
  const f=await fixture(t),id='material:home:2:oak_log';
  f.runtime.state='PAUSED';
  assert.equal((await f.app.inject({method:'POST',url:`/api/workspace/assistance/${id}`,payload:{action:'companion',revision:0}})).statusCode,409);
  assert.equal(f.scheduled(),0);f.runtime.state='ACTIVE';
  const result=await f.app.inject({method:'POST',url:`/api/workspace/assistance/${id}`,payload:{action:'companion',revision:0}});
  assert.equal(result.statusCode,200,result.body);assert.equal(f.scheduled(),1);
  assert.deepEqual(f.runtime.taskStack.frames[0].actions,[{tool:'chop_tree',args:{species:'oak',count:6}}]);
  assert.equal(f.store.get('projects')[0].assignments[0].aiRequired,10);
  assert.equal(f.store.get('materialRequests')[0].status,'requested');
});

test('source edits invalidate old responses and requested shares do not transfer an entire larger plan',async t=>{
  const f=await fixture(t),id='material:home:2:oak_log';
  f.store.put('materialRequests',{...f.store.get('materialRequests')[0],count:2});
  await assert.rejects(f.service.respond(id,{action:'player',revision:0}),/changed/);
  const result=await f.service.respond(id,{action:'player',revision:1});
  assert.equal(result.request.status,'accepted');
  const a=f.store.get('projects')[0].assignments[0];assert.equal(a.aiRequired,3);assert.equal(a.userRequired,7);
  assert.equal(f.store.get('projects')[0].materialResponsibilities.oak_log.quantity,2);
});

test('defer survives source refresh, replan holds actual work, and observed supplies resolve the request',async t=>{
  const f=await fixture(t),id='material:home:2:oak_log';
  await f.service.respond(id,{action:'defer',revision:0});f.runtime.emit('change');
  assert.equal(f.store.get('assistance')[0].status,'deferred');
  await f.service.respond(id,{action:'replan',revision:1});assert.equal(f.runtime.taskStack.held,true);assert.equal(f.runtime.suspended,true);
  assert.equal(f.store.get('workspaceDecisions')[0].status,'awaiting-instructions');
  f.store.put('materialRequests',{...f.store.get('materialRequests')[0],status:'supplied'});f.runtime.emit('change');
  assert.equal(f.store.get('assistance')[0].status,'resolved');
  assert.equal((await f.app.inject('/api/games')).json().games.length,1);
  assert.equal((await f.app.inject({method:'POST',url:'/api/workspace/game',payload:{gameId:'strategy-fixture'}})).statusCode,400);
});

test('accepted assistance retries are idempotent after source sync and do not transfer or enqueue twice',async t=>{
  const f=await fixture(t),id='material:home:2:oak_log';
  f.store.put('materialRequests',{...f.store.get('materialRequests')[0],count:2});f.service.sync();
  const first=await f.service.respond(id,{action:'player',revision:1});f.runtime.emit('change');
  const retried=await f.service.respond(id,{action:'player',revision:first.request.revision});
  assert.equal(retried.request.revision,first.request.revision);assert.equal(f.store.get('projects')[0].assignments[0].userRequired,7);
  const deferred=await f.service.respond(id,{action:'defer',revision:retried.request.revision});
  const reclaimed=await f.service.respond(id,{action:'player',revision:deferred.request.revision});
  assert.equal(f.store.get('projects')[0].assignments[0].userRequired,7);
  const assigned=await f.service.respond(id,{action:'companion',revision:reclaimed.request.revision});f.runtime.emit('change');
  await f.service.respond(id,{action:'companion',revision:assigned.request.revision});assert.equal(f.scheduled(),1);
});

test('source resolution during suspension cannot resurrect a request or change material ownership',async t=>{
  const f=await fixture(t),id='material:home:2:oak_log';
  f.runtime.suspendWork=async()=>{f.store.put('materialRequests',{...f.store.get('materialRequests')[0],status:'supplied'});f.runtime.emit('change');};
  await assert.rejects(f.service.respond(id,{action:'player',revision:0}),/changed/);
  assert.equal(f.store.get('assistance')[0].status,'resolved');assert.equal(f.store.get('projects')[0].assignments[0].aiRequired,5);
});

test('companion assignment rejects stale observations and requests from a different Realm',async t=>{
  const f=await fixture(t),id='material:home:2:oak_log';
  f.runtime.world={...f.runtime.world,observedAt:new Date(observationNow-15001).toISOString()};
  await assert.rejects(f.service.respond(id,{action:'companion',revision:0}),/fresh observations/);
  f.runtime.world={...f.runtime.world,observedAt};
  f.store.put('materialRequests',{...f.store.get('materialRequests')[0],realmId:'another-realm'});f.service.sync();
  await assert.rejects(f.service.respond(id,{action:'companion',revision:1}),/another Realm/);assert.equal(f.scheduled(),0);
});

test('an enqueue guard prevents source changes during suspension from starting stale assistance work',async t=>{
  const f=await fixture(t),id='material:home:2:oak_log';
  let queued=false;
  f.runtime.taskStack.submit=async(_actions,_label,{beforeEnqueue})=>{
    f.store.put('projects',{...f.store.get('projects')[0],revision:3});
    beforeEnqueue();queued=true;
  };
  await assert.rejects(f.service.respond(id,{action:'companion',revision:0}),/changed/);
  assert.equal(queued,false);assert.equal(f.store.get('assistance')[0].status,'resolved');
});
