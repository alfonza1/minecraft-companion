import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createOrchestrator,validatePlan,validateGeneratedBlueprint,CODEX_RESTRICTIONS,interruption} from '../services/agent-orchestrator/index.js';
import {runProcess} from '../services/agent-orchestrator/process.js';

function fixture(request) {
  const records=new Map();
  const store={get:c=>[...(records.get(c)?.values()??[])],put:(c,v)=>{if(!records.has(c))records.set(c,new Map());records.get(c).set(v.id,v);},settings:()=>({maxRequestsPerHour:3,maxInputTokens:1000})};
  let active=true;const tools=[];const runtime=Object.assign(new EventEmitter(),{isActive:()=>active,snapshot:()=>({world:null}),execute:async(tool,args)=>{tools.push({tool,args});return {success:true};},cancelTask:async()=>{tools.push('cancel');}});
  return {orchestrator:createOrchestrator({runtime,store,publish:()=>{},request}),runtime,store,tools,pause:()=>{active=false;}};
}
test('ordinary conversation never executes game tools and records real usage',async()=>{
  const f=fixture(async()=>({plan:{reply:'Java has static types.',intent:'general',actions:[]},usage:{input_tokens:12,output_tokens:6,cached_input_tokens:2}}));
  assert.equal(await f.orchestrator.respond('Java or Python?'),'Java has static types.');assert.deepEqual(f.tools,[]);assert.equal(f.orchestrator.usage.inputTokens,12);assert.equal(f.orchestrator.usage.billingCost,null);
});

test('local token budget can be renewed without deleting lifetime usage or bypassing hourly limits',async()=>{
  let calls=0;
  const request=async()=>{calls++;return {plan:{reply:'Hey.',intent:'casual',actions:[]},usage:{input_tokens:1001,output_tokens:4}};};
  const f=fixture(request);
  await f.orchestrator.respond('Hello friend');
  await assert.rejects(f.orchestrator.respond('Tell me a joke'),error=>error.code==='INPUT_TOKEN_BUDGET'&&/Start new token budget/.test(error.message));
  assert.equal(calls,1);f.orchestrator.renewTokenBudget();
  assert.equal(f.orchestrator.usage.inputBudgetUsed,0);assert.equal(f.orchestrator.usage.inputTokens,1001);
  await f.orchestrator.respond('Tell me a joke');assert.equal(calls,2);
  const restored=createOrchestrator({runtime:f.runtime,store:f.store,publish:()=>{},request});
  assert.equal(restored.usage.inputBudgetUsed,1001);assert.equal(restored.usage.inputTokens,2002);
  f.orchestrator.renewTokenBudget();await f.orchestrator.respond('Another joke');f.orchestrator.renewTokenBudget();
  await assert.rejects(f.orchestrator.respond('One more joke'),error=>error.code==='MODEL_REQUEST_LIMIT');assert.equal(calls,3);
  await restored.close();await f.orchestrator.close();
});
test('pause prevents any model request',async()=>{
  let calls=0;const f=fixture(async()=>{calls++;});f.pause();await assert.rejects(f.orchestrator.respond('Hello'),/Resume/);assert.equal(calls,0);
});
test('pause during inference rejects late model actions',async()=>{
  const f=fixture(async()=>{f.pause();return {plan:{reply:'On it.',intent:'minecraft_action',actions:[{tool:'chop_tree',args:{count:4}}]}};});
  await assert.rejects(f.orchestrator.respond('Get wood'),/Resume/);assert.deepEqual(f.tools,[]);
});
test('structured plans reject shell injection, unknown tools, out-of-range arguments and general action leakage',()=>{
  for(const tool of ['exec_command','place_blocks','constructor','__proto__'])assert.throws(()=>validatePlan({reply:'x',intent:'minecraft_action',actions:[{tool,args:{}}]}));
  assert.throws(()=>validatePlan({reply:'x',intent:'general',actions:[{tool:'chop_tree',args:{}}]}));
  assert.throws(()=>validatePlan({reply:'x',intent:'minecraft_action',actions:[{tool:'chop_tree',args:{count:999}}]}));
  assert.throws(()=>validatePlan({reply:'x',intent:'minecraft_action',actions:[{tool:'gather_blocks',args:{block:'oak_log; rm',count:4}}]}));
});
test('stop cancels active inference and invokes task cancellation',async()=>{
  const f=fixture((_prompt,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason))));
  const request=f.orchestrator.respond('get wood');
  f.runtime.cancelTask=async()=>{f.tools.push('cancel');await f.orchestrator.cancel();};
  await new Promise(resolve=>setImmediate(resolve));const cancelled=assert.rejects(request);
  assert.equal(await f.orchestrator.respond('Stop'),'Okay, stopping here.');await cancelled;assert.deepEqual(f.tools,['cancel']);
});
test('interrupt cancels gameplay before awaiting an in-flight respond',async()=>{
  let cancelGame;
  const f=fixture(async()=>({plan:{reply:'On it.',intent:'minecraft_action',actions:[{tool:'chop_tree',args:{count:4}}]}}));
  f.runtime.execute=()=>new Promise((_resolve,reject)=>{cancelGame=()=>reject(new Error('Gameplay cancelled'));});
  f.runtime.cancelTask=async()=>{cancelGame?.();await f.orchestrator.cancel();};
  await f.orchestrator.respond('Chop wood');
  await new Promise(resolve=>setImmediate(resolve));
  await Promise.race([f.orchestrator.respond('Stop'),new Promise((_resolve,reject)=>setTimeout(()=>reject(new Error('Cancellation deadlocked')),1000))]);
  assert.ok(cancelGame);
});
test('unrelated conversation continues while deterministic gameplay is running',async()=>{
  let release;
  const f=fixture(async prompt=>({plan:JSON.parse(prompt.slice(prompt.lastIndexOf('\n')+1)).message==='Get wood'?{reply:'Sure.',intent:'minecraft_action',actions:[{tool:'chop_tree',args:{}}]}:{reply:'Black holes curve spacetime.',intent:'general',actions:[]}}));
  f.runtime.execute=()=>new Promise(resolve=>{release=resolve;});
  assert.equal(await f.orchestrator.respond('Get wood'),'Sure.');
  assert.equal(await f.orchestrator.respond('What is a black hole?'),'Black holes curve spacetime.');
  release({success:true});await new Promise(resolve=>setImmediate(resolve));await f.orchestrator.close();
});
test('actual subprocess terminates on AbortSignal with no lingering execution',async()=>{
  const controller=new AbortController();const started=Date.now();
  const worker=runProcess(process.execPath,['-e','setInterval(()=>{},1000)'],{signal:controller.signal});
  setTimeout(()=>controller.abort(),80);await assert.rejects(worker,{name:'AbortError'});assert.ok(Date.now()-started<5000);
});
test('actual subprocess output and timeout are bounded',async()=>{
  await assert.rejects(runProcess(process.execPath,['-e','process.stdout.write("x".repeat(10000))'],{maxBytes:100}),/limit/);
  await assert.rejects(runProcess(process.execPath,['-e','setInterval(()=>{},1000)'],{timeout:30}),/timed out/);
});
test('Codex config disables executable tools and inherited plugins without shell invocation',()=>{
  for(const flag of ['--ignore-user-config','--ignore-rules','--ephemeral','shell_tool','apps','hooks','multi_agent','features.code_mode.enabled=false','tools.view_image=false','web_search="disabled"','mcp_servers={}'])assert.ok(CODEX_RESTRICTIONS.includes(flag));
  assert.equal(interruption('Forget that!'),true);assert.equal(interruption('What is a stop codon?'),false);
});
test('architect output validates coordinates, version and duplicate placement before approval',()=>{
  const draft={version:'1.21.4',dimensions:{x:2,y:1,z:1},blocks:[{x:0,y:0,z:0,name:'oak_planks',properties:{},section:'foundation'}],uncertainties:['Reconstruction from text, not exact reference.']};
  assert.equal(validateGeneratedBlueprint(draft,'1.21.4').provenance,'reconstructed');
  assert.equal(validateGeneratedBlueprint({...draft,blocks:[{...draft.blocks[0],name:'minecraft:stone'}]},'1.21.4').blocks[0].name,'stone');
  assert.throws(()=>validateGeneratedBlueprint(draft,'1.21.5'),/version/);
  assert.throws(()=>validateGeneratedBlueprint({...draft,blocks:[...draft.blocks,...draft.blocks]},'1.21.4'),/duplicate/);
  assert.throws(()=>validateGeneratedBlueprint({...draft,blocks:[{...draft.blocks[0],x:2}]},'1.21.4'),/outside/);
});
