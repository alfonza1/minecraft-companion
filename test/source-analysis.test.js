import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createVideoCredentials,analyzeYouTube} from '../services/reference-ingestion/video-provider.js';
import {validateAnalysis} from '../services/reference-ingestion/analysis-schema.js';
import {expandReconstruction,reconstructionSchemaFor,assertSourceDimensions} from '../services/build-planner/reconstruction.js';
import {createApp} from '../services/api/index.js';
import {Store} from '../services/memory/store.js';

const report={sourceAccessible:true,summary:'A 3 by 3 plank floor and corner cobblestone pillar.',dimensions:{x:3,y:3,z:3},observations:[{topic:'layout',detail:'Nine oak_planks on y=0; cobblestone at (0,1,0) and (0,2,0).',evidence:'visible',timestamp:'00:04'}],materialList:[{name:'oak_planks',quantity:9,basis:'shown',timestamp:'00:01'},{name:'cobblestone',quantity:2,basis:'shown',timestamp:'00:01'}],uncertainties:['No source schematic supplied.']};
const op=(name,from,to,mode='fill')=>({name,from,to,mode,properties:'{}',section:'structure'});
const design={version:'26.3',dimensions:{x:3,y:3,z:3},operations:[op('oak_planks',{x:0,y:0,z:0},{x:2,y:0,z:2}),op('cobblestone',{x:0,y:1,z:0},{x:0,y:2,z:0})],uncertainties:[]};
const credentials={read:async()=>({key:'test-key-not-a-real-credential',model:'gemini-3.8-flash'}),status:async()=>({configured:true,model:'gemini-3.8-flash'})};
const json=value=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});

test('direct YouTube adapter sends native video input, polls one owned job, parses revision steps and deletes it',async()=>{
  const calls=[],jobs=[];
  const result=await analyzeYouTube({url:'https://youtu.be/abcdefghijk',notes:'Inspect the roof',credentials,signal:new AbortController().signal,pollMs:1,onRemoteJob:job=>jobs.push(job),fetcher:async(url,options)=>{
    calls.push({url,...options});
    if(options.method==='POST')return json({id:'job_123',status:'in_progress'});
    if(options.method==='DELETE')return new Response(null,{status:204});
    return json({id:'job_123',status:'completed',steps:[{type:'model_output',content:[{type:'text',text:JSON.stringify(report)}]}],usage:{total_input_tokens:400,total_output_tokens:30,total_cached_tokens:7}});
  }});
  assert.equal(calls.length,3);const body=JSON.parse(calls[0].body);
  assert.equal(body.input[0].type,'video');assert.equal(body.input[0].uri,'https://www.youtube.com/watch?v=abcdefghijk');assert.equal(body.background,true);assert.equal(body.store,true);assert.equal(body.tools,undefined);
  assert.equal(calls[0].headers['Api-Revision'],'2026-05-20');assert.equal(calls[2].method,'DELETE');assert.equal(jobs.at(-1).status,'completed');assert.equal(result.usage.input_tokens,400);assert.equal(validateAnalysis(result.report).exactSourceCounts,false);
});
test('remote interruption confirms provider cancellation before deletion and preserves failed-cancellation records',async()=>{
  for(const failure of [false,true]){
    const controller=new AbortController(),calls=[],jobs=[];
    await assert.rejects(analyzeYouTube({url:'https://youtu.be/abcdefghijk',credentials,signal:controller.signal,pollMs:1,onRemoteJob:job=>jobs.push(job),fetcher:async(url,options)=>{
      calls.push(options.method+' '+url);
      if(options.method==='POST'&&url.endsWith('/interactions'))return json({id:'job_cancel',status:'in_progress'});
      if(options.method==='GET'){controller.abort();throw controller.signal.reason;}
      if(url.endsWith('/cancel'))return failure?new Response(null,{status:503}):json({status:'cancelled'});
      return new Response(null,{status:204});
    }}));
    assert.ok(calls.some(call=>call.endsWith('/cancel')));
    assert.equal(calls.some(call=>call.startsWith('DELETE')),!failure);assert.equal(jobs.at(-1).status,failure?'cancellation-unconfirmed':'cancelled');
  }
});
test('invalid video URLs never reach the cloud and reports without visible evidence cannot claim source access',async()=>{
  let called=false;
  await assert.rejects(analyzeYouTube({url:'http://localhost/private',credentials,signal:new AbortController().signal,fetcher:()=>{called=true;}}),/HTTPS|YouTube/);assert.equal(called,false);
  assert.throws(()=>validateAnalysis({...report,observations:report.observations.map(value=>({...value,evidence:'inferred'}))}),/no visible/);
});
test('bounded reconstruction keeps original dimensions and palette, applies virtual erases and rejects unknown states',()=>{
  const blueprint=expandReconstruction(design,'26.3');assert.equal(blueprint.blocks.length,11);assert.deepEqual(blueprint.dimensions,{x:3,y:3,z:3});
  assertSourceDimensions(blueprint,report);assert.throws(()=>assertSourceDimensions({...blueprint,dimensions:{x:2,y:3,z:3}},report),/changed.*X dimension/);
  const erased=expandReconstruction({...design,operations:[...design.operations,op('air',{x:1,y:0,z:1},{x:1,y:0,z:1},'erase')]},'26.3');assert.equal(erased.blocks.length,10);
  assert.throws(()=>expandReconstruction({...design,operations:[{...design.operations[0],name:'minecraft_variant'}]},'26.3'),/Unknown/);
  assert.throws(()=>expandReconstruction({...design,operations:[{...design.operations[0],to:{x:3,y:0,z:2}}]},'26.3'),/outside/);
  assert.throws(()=>expandReconstruction({...design,operations:[{...design.operations[0],properties:'{"command":"run"}'}]},'26.3'),/Unknown state/);
  const palette=reconstructionSchemaFor('26.3',report).properties.operations.items.properties.name.enum;assert.ok(palette.includes('oak_planks'));assert.ok(palette.includes('cobblestone'));assert.ok(!palette.includes('minecraft_variant'));assert.ok(palette.length<200);
});
test('Windows video credentials use encrypted private persistence and never return the key in status',async t=>{
  if(process.platform!=='win32')return t.skip('Windows DPAPI persistence');
  const directory=await mkdtemp(join(tmpdir(),'companion-video-key-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const secret='test-key-only-no-account-0123456789',vault=createVideoCredentials(directory);
  await vault.save(secret);assert.deepEqual(await vault.status(),{configured:true,model:'gemini-3.8-flash'});
  assert.equal((await readFile(join(directory,'provider-secrets/geminivideo.dpapi'))).includes(Buffer.from(secret)),false);
  assert.equal((await createVideoCredentials(directory).read()).key,secret);await vault.clear();assert.equal((await vault.status()).configured,false);
});
test('actual API requires media consent, pause gates inference, reconstruction preserves source geometry and invalidates approval',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'companion-source-api-')),store=new Store(directory);let calls=0;
  const app=await createApp({store,videoCredentials:credentials,youtubeAnalysis:async()=>{calls++;return {report,model:'fixture-video',usage:{input_tokens:100}};},visionRequest:async()=>{calls++;return {data:design,model:'fixture-work',usage:{input_tokens:50}};}});
  t.after(async()=>{await app.close();await rm(directory,{recursive:true,force:true});});
  const post=(url,payload)=>app.inject({method:'POST',url:'/api'+url,payload});
  const project=(await post('/projects',{name:'Tutorial structure',version:'26.3'})).json();
  store.put('projects',{...project,references:[{id:'source',type:'youtube',url:'https://youtu.be/abcdefghijk',title:'Reference'}]});
  const path='/projects/'+project.id;
  assert.equal((await post(path+'/analyze',{provider:'youtube',referenceIds:['source'],shareMedia:false})).statusCode,400);
  assert.equal((await post(path+'/analyze',{provider:'youtube',referenceIds:['source'],shareMedia:true})).statusCode,400);assert.equal(calls,0);
  await post('/control',{command:'plan'});
  const analyzed=await post(path+'/analyze',{provider:'youtube',referenceIds:['source'],shareMedia:true});assert.equal(analyzed.statusCode,200,analyzed.body);
  const analysis=analyzed.json().sourceAnalysis;assert.equal(analysis.exactSourceCounts,false);
  assert.equal((await post(path+'/reconstruct',{analysisId:analysis.id,acceptUncertainty:false})).statusCode,400);
  const reconstructed=await post(path+'/reconstruct',{analysisId:analysis.id,acceptUncertainty:true});assert.equal(reconstructed.statusCode,200,reconstructed.body);
  const saved=reconstructed.json();assert.equal(saved.blueprint.blocks.length,11);assert.equal(saved.materials.placed.find(row=>row.name==='oak_planks').quantity,9);assert.equal(saved.approvedRevision,null);assert.equal(saved.reconstruction.exactSource,false);
  assert.equal(saved.reconstruction.materialComparison.find(row=>row.name==='oak_planks').difference,0);
  await post('/control',{command:'pause'});assert.equal((await post(path+'/reconstruct',{analysisId:analysis.id,acceptUncertainty:true})).statusCode,400);assert.equal(calls,2);
  const snapshot=(await app.inject('/api/state')).body;assert.equal(snapshot.includes('test-key-not-a-real-credential'),false);assert.equal(app.companion.snapshot().usage.inputTokens,150);
});

test('pausing active source analysis joins cancellation and cannot persist a late report',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'companion-source-cancel-')),store=new Store(directory);let started=false;
  const app=await createApp({store,videoCredentials:credentials,youtubeAnalysis:({signal})=>new Promise((_resolve,reject)=>{started=true;signal.addEventListener('abort',()=>reject(signal.reason),{once:true});})});
  t.after(async()=>{await app.close();await rm(directory,{recursive:true,force:true});});
  const post=(url,payload)=>app.inject({method:'POST',url:'/api'+url,payload});
  const project=(await post('/projects',{name:'Interrupted source',version:'26.3'})).json();store.put('projects',{...project,references:[{id:'source',type:'youtube',url:'https://youtu.be/abcdefghijk'}]});
  await post('/control',{command:'plan'});
  const pending=post(`/projects/${project.id}/analyze`,{provider:'youtube',referenceIds:['source'],shareMedia:true}).then(value=>value);
  while(!started)await new Promise(resolve=>setImmediate(resolve));
  await post('/control',{command:'pause'});assert.equal((await pending).statusCode,400);assert.equal(store.get('projects')[0].sourceAnalysis,undefined);assert.equal(app.companion.snapshot().usage.requests,1);
  await post(`/projects/${project.id}/analyze`,{provider:'youtube',referenceIds:['source'],shareMedia:true});assert.equal(app.companion.snapshot().usage.requests,1);
});

test('concurrent source requests cannot release another request’s project lock after credential lookup',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'companion-source-lock-')),store=new Store(directory);let lookedUp=0,release,started=false;
  const ready=new Promise(resolve=>{release=resolve;});
  const delayedCredentials={...credentials,status:async()=>{lookedUp++;await ready;return credentials.status();}};
  const app=await createApp({store,videoCredentials:delayedCredentials,youtubeAnalysis:({signal})=>new Promise((_resolve,reject)=>{started=true;signal.addEventListener('abort',()=>reject(signal.reason),{once:true});})});
  t.after(async()=>{await app.close();await rm(directory,{recursive:true,force:true});});
  const post=(url,payload)=>app.inject({method:'POST',url:'/api'+url,payload});
  const project=(await post('/projects',{name:'Concurrent source',version:'26.3'})).json();store.put('projects',{...project,references:[{id:'source',type:'youtube',url:'https://youtu.be/abcdefghijk'}]});await post('/control',{command:'plan'});
  const body={provider:'youtube',referenceIds:['source'],shareMedia:true},responses=[];
  const first=post(`/projects/${project.id}/analyze`,body).then(value=>{responses.push(value);return value;});
  const second=post(`/projects/${project.id}/analyze`,body).then(value=>{responses.push(value);return value;});
  while(lookedUp<2)await new Promise(resolve=>setImmediate(resolve));release();
  while(!started||responses.length<1)await new Promise(resolve=>setImmediate(resolve));
  assert.equal(responses[0].statusCode,400);assert.match(responses[0].json().error,/current project job/);
  const edited=await post(`/projects/${project.id}/blueprint`,{blueprint:{version:'26.3',dimensions:{x:1,y:1,z:1},blocks:[{x:0,y:0,z:0,name:'stone'}],provenance:'reconstructed'}});assert.equal(edited.statusCode,400);
  await post('/control',{command:'pause'});await Promise.all([first,second]);assert.equal(store.get('projects')[0].revision,0);
});
