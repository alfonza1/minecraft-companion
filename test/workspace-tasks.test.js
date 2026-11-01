import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../services/memory/store.js';
import { TaskStack } from '../services/agent-orchestrator/task-stack.js';

async function fixture(t){
  const directory=await mkdtemp(join(tmpdir(),'waypoint-task-controls-')),store=new Store(directory);
  let count=0,controller,executions=0;
  const runtime=Object.assign(new EventEmitter(),{
    state:'ACTIVE',currentTask:null,isActive(){return this.state==='ACTIVE';},
    snapshot(){return {world:{observedAt:String(count),inventoryExact:true,inventory:[{name:'oak_log',count}],position:{x:0,y:64,z:0},dimension:'overworld'}};},
    async execute(tool,args){executions++;controller=new AbortController();this.currentTask={tool,args};try{return await new Promise((_resolve,reject)=>controller.signal.addEventListener('abort',()=>reject(controller.signal.reason)));}finally{this.currentTask=null;}},
    async suspendWork(){controller?.abort(new Error('Saved task changed.'));},async waitForIdle(){},
  });
  const stack=new TaskStack({runtime,store,publish(){}});
  t.after(async()=>{stack.hold();await runtime.suspendWork();await stack.worker;store.close();await rm(directory,{recursive:true,force:true});});
  return {stack,runtime,store,setCount(value){count=value;},executions:()=>executions};
}

test('claiming active work checkpoints actual progress and cannot silently resume player-owned tasks',async t=>{
  const f=await fixture(t);
  await f.stack.submit([{tool:'chop_tree',args:{count:8,species:'oak'}}],'Wood');
  f.setCount(3);const id=f.stack.frames[0].id;
  const changed=await f.stack.manage(id,{action:'claim',revision:0});
  assert.equal(changed.frames[0].owner,'player');assert.equal(changed.frames[0].status,'assigned-player');
  assert.equal(changed.frames[0].actions[0].args.count,5);assert.equal(f.stack.worker,null);
  await assert.rejects(f.stack.resume(),/assigned to you/);assert.equal(f.executions(),1);
  await assert.rejects(f.stack.manage(id,{action:'transfer',revision:0}),/changed/);
  await f.stack.manage(id,{action:'transfer',revision:1});
  assert.equal(f.stack.frames[0].owner,'companion');assert.equal(f.stack.held,true);assert.equal(f.executions(),1);
  const restored=new TaskStack({runtime:Object.assign(new EventEmitter(),{isActive:()=>false,snapshot:()=>({})}),store:f.store,publish(){}});
  assert.equal(restored.frames[0].actions[0].args.count,5);assert.equal(restored.frames[0].revision,2);
});

test('priority reorders only complete saved task frames and never inner action dependencies',async t=>{
  const f=await fixture(t);
  const first={id:randomUUID(),label:'Tools then mine',index:0,status:'saved',actions:[{tool:'craft_item',args:{item:'stone_pickaxe',count:1}},{tool:'gather_blocks',args:{block:'stone',count:8}}]};
  const second={id:randomUUID(),label:'Wood',index:0,status:'saved',actions:[{tool:'chop_tree',args:{count:8}}]};
  f.stack.frames=[first,second];f.stack.held=true;f.stack.save();
  await f.stack.manage(first.id,{action:'prioritize',revision:0});
  assert.equal(f.stack.frames.at(-1).id,first.id);assert.deepEqual(f.stack.frames.at(-1).actions.map(value=>value.tool),['craft_item','gather_blocks']);
  assert.equal(f.executions(),0);
  await f.stack.manage(first.id,{action:'defer',revision:1});assert.equal(f.stack.frames.at(-1).status,'deferred');
  f.stack.held=false;f.stack.start();await f.stack.worker;assert.equal(f.executions(),0);assert.equal(f.stack.held,true);
  await f.stack.manage(first.id,{action:'cancel',revision:2});assert.equal(f.stack.frames.length,1);assert.equal(f.stack.frames[0].id,second.id);
});

test('simultaneous conflicting ownership changes cannot both succeed',async t=>{
  const f=await fixture(t);await f.stack.submit([{tool:'chop_tree',args:{count:8}}],'Wood');const id=f.stack.frames[0].id;
  const results=await Promise.allSettled([f.stack.manage(id,{action:'claim',revision:0}),f.stack.manage(id,{action:'defer',revision:0})]);
  assert.equal(results.filter(value=>value.status==='fulfilled').length,1);assert.equal(f.stack.frames[0].owner,'player');assert.equal(f.stack.frames[0].revision,1);
});

test('source guard runs after suspension and leaves interrupted work saved without starting stale work',async t=>{
  const f=await fixture(t);await f.stack.submit([{tool:'chop_tree',args:{count:8}}],'Wood');f.setCount(3);
  await assert.rejects(f.stack.submit([{tool:'find_resource',args:{item:'iron_ore'}}],'Iron',{beforeEnqueue(){
    assert.equal(f.runtime.currentTask,null);throw new Error('The source request changed.');
  }}),/source request changed/);
  assert.equal(f.executions(),1);assert.equal(f.stack.frames.length,1);assert.equal(f.stack.frames[0].actions[0].args.count,5);assert.equal(f.stack.held,true);
});
