import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store} from '../services/memory/store.js';
import {createDesktopController,resolveDesktopDevice} from '../services/voice/desktop-controller.js';
import {createApp} from '../services/api/index.js';
import * as voiceModule from '../services/voice/index.js';

async function fixture(t){
  const directory=await mkdtemp(join(tmpdir(),'companion-desktop-persistence-')),store=new Store(directory);
  const runtime=Object.assign(new EventEmitter(),{state:'DISCONNECTED',connection:{status:'offline'},isActive(){return ['ACTIVE','BUSY'].includes(this.state);}});
  const started=[];let live=0,maxLive=0;
  const controller=createDesktopController({runtime,store,publish:()=>{},launch:(settings,signal,receive)=>new Promise((resolve,reject)=>{
    started.push(structuredClone(settings));live++;maxLive=Math.max(live,maxLive);receive('{"phase":"ready"}\n');
    signal.addEventListener('abort',()=>{live--;reject(signal.reason);},{once:true});
  })});
  t.after(async()=>{await controller.close();store.close();await rm(directory,{recursive:true,force:true});});
  const connect=()=>{runtime.state='ACTIVE';runtime.connection.status='connected';runtime.emit('connected');return controller.sync();};
  return {controller,store,runtime,started,connect,maxLive:()=>maxLive};
}

test('desktop voice defaults on, restores after pause/resume and never captures while disconnected or paused',async t=>{
  const f=await fixture(t);assert.equal(f.store.settings().voice.desktopEnabled,true);
  await f.controller.sync();assert.equal(f.started.length,0);
  await f.connect();assert.equal(f.started.length,1);
  f.runtime.state='PAUSED';f.runtime.emit('pause');await f.controller.sync();assert.equal(f.controller.snapshot().running,false);
  f.runtime.state='ACTIVE';f.runtime.emit('resume');await f.controller.sync();assert.equal(f.started.length,2);
  await f.controller.sync();await f.controller.sync();assert.equal(f.started.length,2);assert.equal(f.maxLive(),1);
  f.runtime.state='DISCONNECTED';f.runtime.connection.status='offline';f.runtime.emit('disconnect');await f.controller.sync();assert.equal(f.controller.snapshot().running,false);
});

test('saved devices and explicit disable survive reopening SQLite and rebinding never erases auto-enable',async t=>{
  const f=await fixture(t);
  const microphone={name:'Microphone',hostapi:1},speakers={name:'Headphones',hostapi:1};
  f.store.updateSettings({voice:{desktopInputDevice:microphone,desktopOutputDevice:speakers}});await f.controller.update();await f.connect();
  assert.deepEqual(f.started[0].desktopInputDevice,microphone);
  await f.controller.suspend(true);assert.equal(f.controller.snapshot().running,false);
  f.store.updateSettings({voice:{pushToTalk:{key:'Mouse5',modifiers:[]}}});await f.controller.update();assert.equal(f.controller.snapshot().running,false);
  await f.controller.suspend(false);assert.equal(f.started.at(-1).pushToTalk.key,'Mouse5');assert.equal(f.store.settings().voice.desktopEnabled,true);
  await f.controller.suspend(true);f.runtime.emit('resume');await f.controller.sync();assert.equal(f.controller.snapshot().running,true,'resume clears an abandoned key-selection suspension');
  f.store.updateSettings({voice:{desktopEnabled:false}});await f.controller.update();f.runtime.emit('resume');await f.controller.sync();assert.equal(f.controller.snapshot().running,false);
  const reopened=new Store(f.store.directory);assert.equal(reopened.settings().voice.desktopEnabled,false);assert.deepEqual(reopened.settings().voice.desktopOutputDevice,speakers);reopened.close();
  f.store.updateSettings({voice:{desktopEnabled:true}});await f.controller.update();assert.equal(f.controller.snapshot().running,true);assert.equal(f.maxLive(),1);
});

test('device identity survives numeric reordering and missing/ambiguous devices cannot silently redirect audio',()=>{
  const preference={name:'Headphones',hostapi:1},device={...preference,id:9,max_output_channels:2};
  assert.equal(resolveDesktopDevice(preference,[device],'output'),9);
  assert.equal(resolveDesktopDevice(preference,[{...device,id:14}],'output'),14);
  assert.equal(resolveDesktopDevice(null,[],'input'),undefined);
  assert.throws(()=>resolveDesktopDevice(preference,[],'output'),/unavailable/);
  assert.throws(()=>resolveDesktopDevice(preference,[device,{...device,id:10}],'output'),/unavailable/);
});

test('real settings and voice APIs persist auto-enable/devices, and resume launches exactly one isolated worker',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'companion-desktop-api-')),store=new Store(directory);
  const app=await createApp({store,skipExtensions:true,voiceModule});let starts=0,stops=0;
  voiceModule.registerVoiceRoutes(app,{...app.companion,launchDesktop:(_settings,signal,receive)=>new Promise((_resolve,reject)=>{starts++;receive('{"phase":"ready"}\n');signal.addEventListener('abort',()=>{stops++;reject(signal.reason);},{once:true});})});
  t.after(async()=>{await app.close();await rm(directory,{recursive:true,force:true});});
  const preference={name:'Saved headset',hostapi:1};
  assert.equal((await app.inject({method:'POST',url:'/api/settings',payload:{voice:{desktopInputDevice:preference}}})).statusCode,200);
  assert.deepEqual(store.settings().voice.desktopInputDevice,preference);assert.equal(starts,0);
  await app.companion.runtime.control('plan');assert.equal(starts,0);
  for(let index=0;index<2;index++)assert.equal((await app.inject({method:'POST',url:'/api/voice/desktop',payload:{enabled:true}})).statusCode,200);
  assert.equal(starts,1);
  await app.companion.runtime.control('pause');await voiceModule.stopVoice();assert.equal(stops,1);
  await app.companion.runtime.control('resume');await new Promise(resolve=>setImmediate(resolve));assert.equal(starts,1,'offline planning must not auto-open a microphone');
  assert.equal((await app.inject({method:'POST',url:'/api/settings',payload:{voice:{desktopInputDevice:{name:'bad',hostapi:-1}}}})).statusCode,400);
  assert.equal((await app.inject({method:'POST',url:'/api/voice/desktop',payload:{enabled:false}})).statusCode,200);assert.equal(store.settings().voice.desktopEnabled,false);
});
