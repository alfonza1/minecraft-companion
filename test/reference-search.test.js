import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store} from '../services/memory/store.js';
import {createOrchestrator} from '../services/agent-orchestrator/index.js';
import {verifyVideoOptions,youtubeSearchIntent} from '../services/reference-ingestion/search.js';
import {assistedAssignments} from '../services/resource-ledger/acquisition.js';
import {projectConversation} from '../services/agent-orchestrator/project-conversation.js';
import {registerBuildRoutes} from '../services/build-planner/index.js';
import Fastify from 'fastify';

async function fixture(t,options={}){
  const dir=await mkdtemp(join(tmpdir(),'companion-search-')),store=new Store(dir);
  let enabled=true;
  const runtime=Object.assign(new EventEmitter(),{isActive:()=>enabled,snapshot:()=>({state:enabled?'ACTIVE':'PAUSED',world:null})});
  const orchestrator=createOrchestrator({store,runtime,publish:()=>{},...options});
  t.after(async()=>{await orchestrator.close();store.close();await rm(dir,{recursive:true,force:true});});
  return {store,runtime,orchestrator,pause:()=>{enabled=false;}};
}
test('search verifies canonical public videos, deduplicates IDs and never fetches arbitrary URLs',async()=>{
  const fetched=[];
  const options=await verifyVideoOptions([{url:'https://evil.example/watch?v=abcdefghijk'}, {url:'https://youtu.be/abcdefghijk',reason:'Nice cottage'}, {url:'https://www.youtube.com/watch?v=abcdefghijk'}, {url:'https://youtu.be/12345678901'}],{metadata:async(url)=>{fetched.push(url);if(url.endsWith('12345678901'))throw new Error('Unavailable');return {id:'ref',url,title:'Verified title'};}});
  assert.equal(options.length,1);assert.equal(options[0].title,'Verified title');assert.equal(fetched.length,2);assert.ok(fetched.every(url=>url.startsWith('https://www.youtube.com/watch?v=')));
  assert.equal(youtubeSearchIntent('Find a house to build on YouTube'),'Find a house to build on YouTube');assert.equal(youtubeSearchIntent('I watched YouTube yesterday'),null);
});
test('voice discovery uses one explicit cancellable web request, records usage and saves real provider options',async t=>{
  let calls=0,query;
  const f=await fixture(t,{searchRequest:async(input)=>{calls++;query=input;return {model:'test',usage:{input_tokens:12,output_tokens:4},data:{videos:[{url:'https://youtu.be/abcdefghijk'}]}};},verifyVideos:async()=>[{id:'verified',title:'Cottage',url:'https://youtu.be/abcdefghijk'}]});
  f.store.put('memories',{id:'styles',label:'Building style',value:'Natural medieval cottagecore'});
  f.store.put('conversation',{id:'private',role:'user',text:'Private unrelated conversation'});
  assert.match(await f.orchestrator.respond('Find medieval houses on YouTube'),/Build Studio/);
  assert.equal(calls,1);assert.deepEqual(Object.keys(query).sort(),['query','styles']);assert.equal(query.styles,'Natural medieval cottagecore');
  assert.equal(f.orchestrator.usage.inputTokens,12);assert.equal(f.store.get('referenceSearches')[0].videos[0].id,'verified');
  f.pause();await assert.rejects(f.orchestrator.searchYouTube('Another house'),/Resume/);assert.equal(calls,1);
});
test('cancelling search prevents late results being saved and joins owned inference',async t=>{
  let signal;
  const f=await fixture(t,{searchRequest:(_input,options)=>new Promise((_resolve,reject)=>{signal=options.signal;signal.addEventListener('abort',()=>reject(signal.reason));})});
  const pending=f.orchestrator.searchYouTube('Medieval cottage');const rejected=assert.rejects(pending);
  await f.orchestrator.cancelInference();await rejected;assert.equal(signal.aborted,true);assert.deepEqual(f.store.get('referenceSearches'),[]);
});
test('assisted splits preserve progress, split common supplies and assign unvalidated resources to the player',()=>{
  const rows=assistedAssignments([{name:'oak_log',quantity:101},{name:'quartz',quantity:40},{name:'wheat',quantity:12}],[{material:'oak_log',aiProgress:9,userProgress:4,aiObservedAt:'then'}]);
  assert.equal(rows[0].aiRequired,50);assert.equal(rows[0].userRequired,51);assert.equal(rows[0].aiProgress,9);assert.equal(rows[0].userProgress,4);assert.equal(rows[0].aiObservedAt,'then');
  assert.equal(rows[1].aiRequired,0);assert.equal(rows[1].userRequired,40);assert.equal(rows[1].acquisition.difficulty,'player-recommended');assert.equal(rows[2].aiRequired,6);
});
test('selected reference, inspired design, exact blueprint BOM and assisted split persist through real API boundaries',async t=>{
  const f=await fixture(t),app=Fastify();t.after(()=>app.close());
  const blueprint={version:'1.21.11',dimensions:{x:2,y:1,z:1},blocks:[{x:0,y:0,z:0,name:'oak_planks'},{x:1,y:0,z:0,name:'quartz_block'}],provenance:'reconstructed',uncertainties:['Hidden video blocks are unknown.']};
  let designInput;
  registerBuildRoutes(app,{...f,publish:()=>{},orchestrator:{searchYouTube:f.orchestrator.searchYouTube,designBlueprint:async input=>{designInput=input;return blueprint;}}});
  f.store.put('referenceSearches',{id:'search',videos:[{id:'video',title:'Public cottage title',url:'https://www.youtube.com/watch?v=abcdefghijk',type:'youtube',reason:'Medieval cottage'}]});
  const project=(await app.inject({method:'POST',url:'/api/projects',payload:{name:'Cottage',version:'1.21.11'}})).json();
  const path=`/api/projects/${project.id}`;
  assert.equal((await app.inject({method:'POST',url:path+'/reference-choice',payload:{searchId:'search',referenceId:'fake'}})).statusCode,400);
  const selected=await app.inject({method:'POST',url:path+'/reference-choice',payload:{searchId:'search',referenceId:'video'}});assert.equal(selected.statusCode,200,selected.body);
  f.store.put('projects',{...selected.json(),references:[...selected.json().references,{id:'private',type:'text',text:'Private unrelated reference'}]});
  const generated=await app.inject({method:'POST',url:path+'/design',payload:{description:'A compact inspired medieval cottage',includeReferences:true,selectedReferenceOnly:true,assistedSplit:true}});
  assert.equal(generated.statusCode,200,generated.body);const saved=generated.json();
  assert.equal(designInput.references.length,1);assert.equal(designInput.references[0].title,'Public cottage title');
  assert.equal(saved.approvedRevision,null);assert.equal(saved.materials.placed.length,2);assert.equal(saved.materials.accuracy,'exact-blueprint');
  assert.equal(saved.assignments.find(row=>row.material==='quartz').aiRequired,0);
  assert.match(projectConversation('What materials do we need?',f.store),/saved design/);
  assert.match(projectConversation('Split the materials in half',f.store),/half each/);
  assert.match(projectConversation('I’ll get all the stone. You get the wood.',f.store),/you handle the stone/);
  assert.equal(f.store.get('projects')[0].assignments.find(row=>row.material==='oak_log').userRequired,0);
  assert.equal(f.store.get('projects')[0].approvedRevision,null);
  f.store.put('referenceSearches',{id:'search-new',videos:[{id:'video-new',title:'Public cottage title',url:'https://www.youtube.com/watch?v=abcdefghijk',type:'youtube'}]});
  const repeated=await app.inject({method:'POST',url:path+'/reference-choice',payload:{searchId:'search-new',referenceId:'video-new'}});
  assert.equal(repeated.json().references.length,2);assert.equal(repeated.json().selectedReference.referenceId,'video');
  assert.equal(projectConversation('What is a black hole?',f.store),null);
});
