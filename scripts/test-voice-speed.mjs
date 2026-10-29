import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {checkVoice,synthesize,stopVoice,transcribeAudio} from '../services/voice/index.js';
await checkVoice();const results=[],transcriptions=[];
try{
  for(const text of ['Hey, I found some food over here.','Yeah, I will put the good stuff in our chest.','I am heading back to the farm.']){
    const start=performance.now(),wav=await synthesize(text,1,undefined,'kokoro:af_heart');
    assert.equal(wav.toString('ascii',0,4),'RIFF');assert.equal(wav.readUInt32LE(24),24000);
    results.push({ms:Math.round(performance.now()-start),bytes:wav.length});console.log(results.at(-1));
  }
  assert.ok(results[1].ms<results[0].ms,'Warm synthesis should avoid model loading');
  for(let index=0;index<2;index++){const wav=await synthesize('Hello friend, I found some food over here.'),start=performance.now(),transcript=await transcribeAudio(wav);assert.match(transcript.text,/found some food/i);transcriptions.push({ms:Math.round(performance.now()-start),text:transcript.text});console.log(transcriptions.at(-1));}
  await mkdir('.git/verification/voice-speed',{recursive:true});await writeFile('.git/verification/voice-speed/results.json',JSON.stringify({passed:true,at:new Date().toISOString(),results,transcriptions,scope:'Actual full-precision Kokoro CPU synthesis and Whisper transcription, fixed public sentences; no microphone, audible playback, model-provider requests or Realm actions. First calls cold, next calls reuse model weights; idle unload is 60 seconds and pause/stop unload immediately.'},null,2));
}finally{await stopVoice();}
