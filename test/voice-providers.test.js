import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {checkVoice,synthesize,transcribeAudio,stopVoice} from '../services/voice/index.js';
import {runProcess} from '../services/agent-orchestrator/process.js';

test('installed local neural TTS -> WAV -> local STT, without microphone or recording files',{skip:process.env.COMPANION_TEST_LOCAL_SPEECH!=='1',timeout:60_000},async t=>{
  t.after(stopVoice);
  const status=await checkVoice();assert.equal(status.available,true);assert.match(status.tts,/Kokoro|Piper/);
  const wav=await synthesize('Yo, I found a pretty good cave over here.');assert.equal(wav.subarray(0,4).toString(),'RIFF');
  const python=path.join(process.env.LOCALAPPDATA,'MinecraftCompanion','voice-venv','Scripts/python.exe');
  const worker=fileURLToPath(new URL('../services/voice/worker.py',import.meta.url));
  const {stdout}=await runProcess(python,[worker,'transcribe','--input','-'],{input:wav});
  assert.match(JSON.parse(stdout).text,/found a pretty good cave/i);
  const seconds=46,samples=16000*seconds,tooLong=Buffer.alloc(44+samples*2);
  tooLong.write('RIFF');tooLong.writeUInt32LE(36+samples*2,4);tooLong.write('WAVEfmt ',8);tooLong.writeUInt32LE(16,16);tooLong.writeUInt16LE(1,20);tooLong.writeUInt16LE(1,22);tooLong.writeUInt32LE(16000,24);tooLong.writeUInt32LE(32000,28);tooLong.writeUInt16LE(2,32);tooLong.writeUInt16LE(16,34);tooLong.write('data',36);tooLong.writeUInt32LE(samples*2,40);
  await assert.rejects(runProcess(python,[worker,'transcribe','--input','-'],{input:tooLong}),/45 seconds/);
});

test('real local speech reads smart punctuation without saying euro',{skip:process.env.COMPANION_TEST_LOCAL_SPEECH!=='1',timeout:60_000},async t=>{
  t.after(stopVoice);await checkVoice();
  const wav=await synthesize('I’m here—I’ll grab the wood. You’re good.');
  const transcript=await transcribeAudio(wav);
  assert.doesNotMatch(transcript.text,/euro|trademark|â|€/i);
  assert.match(transcript.text,/grab the wood/i);
  t.diagnostic(`Actual local TTS → STT: ${transcript.text}`);
});
