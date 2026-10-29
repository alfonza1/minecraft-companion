import test from 'node:test';
import assert from 'node:assert/strict';
import {createSpeechWorker} from '../services/voice/speech-worker.js';

const fixture=`const rl=require('node:readline').createInterface({input:process.stdin});console.log(JSON.stringify({ready:true}));rl.on('line',line=>{const value=JSON.parse(line);const wav=Buffer.alloc(52);wav.write('RIFF');wav.writeUInt32LE(44,4);wav.write('WAVE',8);wav.writeUInt32LE(process.pid,44);setTimeout(()=>console.log(JSON.stringify({audio:wav.toString('base64')})),value.text==='slow'?1000:10);});`;
test('local speech reuses its process for consecutive replies and releases it on close',async t=>{
  const worker=createSpeechWorker({command:process.execPath,args:['-e',fixture]});t.after(()=>worker.close());
  const first=await worker.request({text:'first'}),second=await worker.request({text:'second'});
  assert.equal(first.readUInt32LE(44),second.readUInt32LE(44));assert.equal(worker.running,true);await worker.close();assert.equal(worker.running,false);
  assert.throws(()=>process.kill(first.readUInt32LE(44),0));
});
test('cancelling active speech waits for actual process-tree cleanup and later replies start cleanly',async t=>{
  const worker=createSpeechWorker({command:process.execPath,args:['-e',fixture]});t.after(()=>worker.close());
  const pid=(await worker.request({text:'first'})).readUInt32LE(44),controller=new AbortController();
  const work=worker.request({text:'slow'},controller.signal),cancelled=assert.rejects(work,{name:'AbortError'});
  setTimeout(()=>controller.abort(),30);await cancelled;assert.equal(worker.running,false);assert.throws(()=>process.kill(pid,0));
  assert.notEqual((await worker.request({text:'again'})).readUInt32LE(44),pid);
});
test('cancelled queued speech cannot cancel another reply, and idle weights are unloaded',async t=>{
  const worker=createSpeechWorker({command:process.execPath,args:['-e',fixture],idleMs:30});t.after(()=>worker.close());
  const first=worker.request({text:'slow'}),controller=new AbortController(),second=worker.request({text:'cancelled'},controller.signal);controller.abort();
  const rejected=assert.rejects(second,{name:'AbortError'});assert.ok((await first).length>44);await rejected;
  const deadline=Date.now()+3000;while(worker.running&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,20));assert.equal(worker.running,false);
});
