import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { access } from 'node:fs/promises';
import { createDesktopStatus } from '../services/voice/desktop-status.js';
import { runProcess } from '../services/agent-orchestrator/process.js';
import { createApp } from '../services/api/index.js';
import { Store } from '../services/memory/store.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as voiceModule from '../services/voice/index.js';

test('desktop status streams split lines, rejects untrusted fields and keeps errors actionable', () => {
  let updates=0; const status=createDesktopStatus(()=>updates++);
  assert.equal(status.snapshot().phase,'starting');
  status.receive('{"phase":"list');status.receive('ening"}\n');
  assert.equal(status.snapshot().phase,'listening');
  status.receive('{"phase":"error","code":"silence","message":"private data"}\n');
  assert.match(status.snapshot().error,/microphone/);assert.doesNotMatch(JSON.stringify(status.snapshot()),/private/);
  status.receive('invalid\nnull\n{"phase":"unknown"}\n');assert.equal(updates,2);
  status.receive('{"phase":"error","code":"constructor"}\n');assert.equal(typeof status.snapshot().error,'string');
  status.receive('{"phase":"ready"}\n');assert.equal(status.snapshot().error,null);
});

test('worker status is delivered before process exit and cancellation still waits for exit', async () => {
  const controller=new AbortController(); let delivered;
  const update=new Promise(resolve=>delivered=resolve);
  const worker=runProcess(process.execPath,['-e','console.log("ready");setInterval(()=>{},1000)'],{signal:controller.signal,onStdout:delivered});
  const stopped=assert.rejects(worker,{name:'AbortError'});
  assert.match(await update,/ready/);controller.abort();await stopped;
});

test('real desktop capture loop orders cancellation and reports failures using synthetic devices', async t => {
  const python=join(process.env.LOCALAPPDATA ?? '', 'MinecraftCompanion/voice-venv/Scripts/python.exe');
  try { await access(python); } catch { t.skip('Local speech environment is not installed.');return; }
  const result=await promisify(execFile)(python,['-B','apps/desktop-voice/test_bridge.py'],{windowsHide:true});
  assert.match(result.stderr,/Ran 3 tests/);assert.match(result.stderr,/OK/);
});

test('actual desktop worker reports an invalid microphone through the API without opening capture', async t => {
  if (process.platform !== 'win32' || process.env.COMPANION_TEST_LOCAL_SPEECH !== '1') { t.skip('Opt-in Windows local speech test.');return; }
  const directory=await mkdtemp(join(tmpdir(),'companion-desktop-worker-'));
  const app=await createApp({store:new Store(directory),skipExtensions:true,voiceModule});
  voiceModule.registerVoiceRoutes(app,{...app.companion});
  t.after(async()=>{await app.close();await rm(directory,{recursive:true,force:true});});
  await app.companion.runtime.control('plan');
  const start=await app.inject({method:'POST',url:'/api/voice/desktop',payload:{enabled:true,inputDevice:1000}});
  assert.equal(start.statusCode,200);assert.equal(start.json().desktop.phase,'starting');
  const deadline=Date.now()+10_000;
  while(voiceModule.getVoiceStatus().desktop.running && Date.now()<deadline) await new Promise(resolve=>setTimeout(resolve,25));
  const state=(await app.inject('/api/state')).json();
  assert.equal(state.voice.desktop.running,false);assert.match(state.voice.desktop.error,/microphone/);
  assert.doesNotMatch(JSON.stringify(state.voice),/Traceback|PortAudio/);
  assert.equal(state.usage.requests,0);
  await app.companion.runtime.control('pause');
  assert.equal((await app.inject({method:'POST',url:'/api/voice/desktop',payload:{enabled:true}})).statusCode,409);
});
