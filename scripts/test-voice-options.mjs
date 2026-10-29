import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { checkVoice, voiceOptions, synthesize, stopVoice } from '../services/voice/index.js';

await checkVoice();
const results=[],signatures=new Set();
for(const voice of voiceOptions().filter(voice=>voice.available&&voice.provider!=='auto')) {
  const started=performance.now();
  const wav=await synthesize('Yo, I found a pretty good cave over here.',1,undefined,voice.id);
  assert.equal(wav.toString('ascii',0,4),'RIFF');assert.equal(wav.toString('ascii',8,12),'WAVE');
  const rate=wav.readUInt32LE(24),channels=wav.readUInt16LE(22),bits=wav.readUInt16LE(34);
  assert.equal(bits,16);assert.ok([22050,24000].includes(rate));assert.equal(channels,1);
  const seconds=(wav.length-44)/(rate*channels*2);assert.ok(seconds>1&&seconds<20);
  let energy=0;for(let index=44;index+1<wav.length;index+=2)energy+=(wav.readInt16LE(index)/32768)**2;
  const rms=Math.sqrt(energy/((wav.length-44)/2));assert.ok(rms>0.005,'Voice output must contain audible non-silent samples');
  const signature=createHash('sha256').update(wav).digest('hex');assert.equal(signatures.has(signature),false);signatures.add(signature);
  const result={id:voice.id,provider:voice.provider,elapsedMs:Math.round(performance.now()-started),sampleRate:rate,audioSeconds:Number(seconds.toFixed(2)),rms:Number(rms.toFixed(4)),distinctOutput:true};results.push(result);console.log(JSON.stringify(result));
}
assert.ok(results.filter(result=>result.provider==='kokoro').length>=8);
await mkdir('.git/verification/voice-options',{recursive:true});
await writeFile('.git/verification/voice-options/results.json',JSON.stringify({passed:true,at:new Date().toISOString(),results,scope:'Actual local CPU synthesis for every offered installed neural voice. Synthetic fixed sample text; no microphone, saved audio recordings, paid API or model requests. Audio validity/distinctness does not establish subjective voice preference.'},null,2));

await stopVoice();
