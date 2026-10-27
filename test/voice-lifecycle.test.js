import test from 'node:test';
import assert from 'node:assert/strict';
import {getVoiceStatus,withVoiceJob,stopVoice,synthesize} from '../services/voice/index.js';

test('voice status describes observed readiness, local provider and no recording retention',()=>{
  const status=getVoiceStatus();assert.equal(status.recordingsStored,false);assert.match(status.stt,/local CPU/);assert.equal(typeof status.available,'boolean');
});
test('voice stop waits for cancellation of active backend inference',async()=>{
  let ended=false;
  const work=withVoiceJob(signal=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>{ended=true;reject(signal.reason);})));const failed=assert.rejects(work);
  await new Promise(resolve=>setImmediate(resolve));assert.equal(getVoiceStatus().status,'processing');await stopVoice();await failed;assert.equal(ended,true);assert.notEqual(getVoiceStatus().status,'processing');
});
test('speech validates input before spawning any process',async()=>{
  await assert.rejects(synthesize(''),/1–4000/);await assert.rejects(synthesize('Hello',99),/0.5–2/);
});
