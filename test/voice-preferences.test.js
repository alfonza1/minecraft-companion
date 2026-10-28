import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createApp } from '../services/api/index.js';
import { Store } from '../services/memory/store.js';
import { normalizeHotkey, formatHotkey, hotkeyFromEvent } from '../packages/shared-types/hotkeys.js';
import { registerVoiceRoutes, synthesize, getVoiceStatus } from '../services/voice/index.js';

test('PTT bindings normalize exact chords and reject invalid or closing shortcuts', () => {
  assert.equal(formatHotkey(), 'F8');
  assert.equal(formatHotkey(normalizeHotkey({ key: 'KeyV', modifiers: ['Shift','Ctrl'] })), 'Ctrl + Shift + V');
  assert.equal(formatHotkey(hotkeyFromEvent({ code:'Mouse4',ctrlKey:false,altKey:false,shiftKey:false,metaKey:false })), 'Mouse 4');
  assert.equal(hotkeyFromEvent({ code:'KeyV',metaKey:true }), null);
  for(const value of [null,{key:'Escape',modifiers:[]},{key:'F8',modifiers:['Win']},{key:'F8',modifiers:['Ctrl','Ctrl']},{key:'F4',modifiers:['Alt']},{key:'F8',modifiers:[],shell:'anything'}]) assert.throws(()=>normalizeHotkey(value));
});
test('actual Python key resolver requires the selected keyboard/mouse chord without recording audio', async () => {
  const result=await promisify(execFile)('python',['-B','apps/desktop-voice/test_hotkeys.py'],{windowsHide:true});
  assert.match(result.stderr,/Ran 3 tests/); assert.match(result.stderr,/OK/);
});
test('voice and PTT settings persist, preserve devices, and reject unknown models before inference', async t => {
  const directory=await mkdtemp(join(tmpdir(),'companion-voice-preferences-'));
  const store=new Store(directory),app=await createApp({store,skipExtensions:true});
  registerVoiceRoutes(app,{store,runtime:app.companion.runtime,publish:app.companion.publish});
  t.after(async()=>{await app.close();await rm(directory,{recursive:true,force:true})});
  const binding={key:'KeyV',modifiers:['Ctrl','Shift']};
  for(const voice of ['kokoro:af_heart','kokoro:am_michael','piper:ljspeech']){
    const response=await app.inject({method:'POST',url:'/api/settings',payload:{voice:{pushToTalk:binding,ttsVoice:voice,inputDevice:'unchanged-device'}}});
    assert.equal(response.statusCode,200,response.body);assert.equal(response.json().voice.ttsVoice,voice);
  }
  assert.deepEqual(store.settings().voice.pushToTalk,binding);
  assert.equal(store.settings().voice.inputDevice,'unchanged-device');
  for(const patch of [{pushToTalk:{key:'F4',modifiers:['Alt']}},{ttsVoice:'https://untrusted.invalid/model'},{pushToTalk:{key:'F8',modifiers:['Win']}}])assert.equal((await app.inject({method:'POST',url:'/api/settings',payload:{voice:patch}})).statusCode,400);
  const options=(await app.inject('/api/voice/options')).json();assert.ok(options.filter(voice=>voice.provider==='kokoro').length>=8);assert.ok(options.every(voice=>typeof voice.available==='boolean'));
  const malformed=await app.inject({method:'POST',url:'/api/voice/desktop',payload:{enabled:'yes'}});assert.equal(malformed.statusCode,400);assert.equal(getVoiceStatus().desktop.running,false);
  assert.equal((await app.inject({method:'POST',url:'/api/voice/preview',payload:{voiceId:'bad-model'}})).statusCode,400);
  await app.companion.runtime.control('plan');
  assert.equal((await app.inject({method:'POST',url:'/api/voice/speak',payload:{text:'Hello',voiceId:'untrusted-model'}})).statusCode,400);
  await app.companion.runtime.control('pause');
  assert.equal((await app.inject({method:'POST',url:'/api/voice/preview',payload:{voiceId:'kokoro:af_heart'}})).statusCode,409);
  await assert.rejects(synthesize('Hello',1,undefined,'unknown:voice'),/Unknown local voice/);
  assert.equal((await app.inject('/api/state')).json().usage.requests,0);
});
