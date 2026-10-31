import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createSpeechWorker} from '../services/voice/speech-worker.js';

const localPython=join(process.env.LOCALAPPDATA??'', 'MinecraftCompanion','voice-venv','Scripts','python.exe');
const python=existsSync(localPython)?localPython:process.platform==='win32'?'python':'python3';
const hasPython=spawnSync(python,['--version'],{windowsHide:true}).status===0;
const resident=fileURLToPath(new URL('../services/voice/resident.py',import.meta.url));
const fixture=fileURLToPath(new URL('./fixtures/speech-encoding.py',import.meta.url));

test('resident speech preserves Unicode punctuation and currency under Windows cp1252',{skip:!hasPython},async t=>{
  for(const text of ['I’m here—I’ll grab the wood. You’re good.','“Café” costs €5… not £10.','Birch 🌳 and spruce.']){
    const worker=createSpeechWorker({command:python,args:[fixture,resident,text]});
    t.after(()=>worker.close());
    const wav=await worker.request({text,speed:1,voice:'piper:ljspeech'});
    assert.equal(wav.toString('ascii',0,4),'RIFF');
    await worker.close();
  }
});
