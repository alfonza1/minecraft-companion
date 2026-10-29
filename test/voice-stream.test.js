import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../services/api/index.js';
import { Store } from '../services/memory/store.js';
import { checkVoice, registerVoiceRoutes, getVoiceStatus, stopVoice } from '../services/voice/index.js';

test('real streamed neural speech returns successive WAVs and pause cancels synthesis without model requests',{skip:process.env.COMPANION_TEST_LOCAL_SPEECH!=='1',timeout:120000},async t=>{
  const directory=await mkdtemp(join(tmpdir(),'companion-stream-')),store=new Store(directory);
  store.updateSettings({voice:{desktopEnabled:false}});
  const app=await createApp({store,skipExtensions:true}),{runtime,publish}=app.companion;
  registerVoiceRoutes(app,{runtime,store,publish});await checkVoice();
  runtime.fullAudioStop=stopVoice;
  t.after(async()=>{await app.close();await rm(directory,{recursive:true,force:true});});
  await app.listen({host:'127.0.0.1',port:0});const base=`http://127.0.0.1:${app.server.address().port}`;
  await runtime.control('plan');
  // Close this test client's HTTP connections so Undici's speculative idle
  // sockets cannot delay Fastify shutdown after a cancelled response.
  const request=text=>fetch(`${base}/api/voice/speak-stream`,{method:'POST',headers:{'Content-Type':'application/json',Origin:base,Connection:'close'},body:JSON.stringify({text})});
  const started=performance.now(),response=await request('Hey, I found some wood. We can finish the roof when you get back.');
  assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/ndjson/);
  const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',firstMs,lines=[];
  while(true){const {done,value}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});let newline;
    while((newline=buffer.indexOf('\n'))>=0){const line=JSON.parse(buffer.slice(0,newline));buffer=buffer.slice(newline+1);firstMs??=performance.now()-started;assert.equal(Buffer.from(line.audio,'base64').toString('ascii',0,4),'RIFF');lines.push(line.index);}}
  assert.deepEqual(lines,[0,1]);assert.ok(firstMs<performance.now()-started);
  const warmStarted=performance.now();
  const interrupted=await request('Hold up. '+ 'We should check the wood and stone before finishing the roof. '.repeat(12));
  const partial=interrupted.body.getReader();await partial.read();const warmMs=performance.now()-warmStarted;await runtime.control('pause');await partial.cancel();
  assert.notEqual(getVoiceStatus().status,'processing');
  const paused=await request('Do not speak while paused.');assert.equal(paused.status,409);await paused.text();
  assert.equal((await app.inject('/api/state')).json().usage.requests,0);
  t.diagnostic(`First actual WAV ${Math.round(firstMs)}ms; warm first WAV ${Math.round(warmMs)}ms; two playable chunks received; paused stream cancelled.`);
});
