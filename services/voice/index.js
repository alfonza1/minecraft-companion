import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { runProcess } from '../agent-orchestrator/process.js';
import voices from './voices.json' with { type: 'json' };
import { DEFAULT_PUSH_TO_TALK, normalizeHotkey, formatHotkey } from '../../packages/shared-types/hotkeys.js';
import { z } from 'zod';

const voiceIdSchema=z.enum(voices.map(voice=>voice.id));
const previewSchema=z.object({voiceId:voiceIdSchema.optional(),speed:z.number().min(0.5).max(2).optional()}).strict();
const speechSchema=z.object({text:z.string().trim().min(1).max(4000),voiceId:voiceIdSchema.optional(),speed:z.number().min(0.5).max(2).optional()}).strict();
const desktopSchema=z.object({enabled:z.boolean(),inputDevice:z.number().int().min(0).max(1000).optional(),outputDevice:z.number().int().min(0).max(1000).optional()}).strict();

const root = path.dirname(fileURLToPath(import.meta.url));
const dataRoot = path.join(process.env.LOCALAPPDATA ?? os.tmpdir(),'MinecraftCompanion');
const python = path.join(dataRoot,'voice-venv',process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
const pending = new Set();
let lastError = null;
let ready = false;
let piperReady=false;
let kokoroReady=false;
let configuredBinding=DEFAULT_PUSH_TO_TALK;
let desktop = null;
export function getVoiceStatus() {
  return {available:ready,status:pending.size ? 'processing' : ready ? 'ready' : 'setup-required',error:lastError,stt:'faster-whisper tiny.en (local CPU int8)',tts:kokoroReady?'Kokoro (local full-precision neural voices)':piperReady?'Piper LJ Speech (local neural voice)':process.platform === 'win32' ? 'Windows SAPI (local fallback; neural voice not installed)' : 'unavailable',recordingsStored:false,desktop:{running:!!desktop,hotkey:formatHotkey(configuredBinding),binding:configuredBinding,mode:'push-to-talk'}};
}
export async function updateVoiceSettings(settings) {
  const binding=normalizeHotkey(settings.pushToTalk);
  if(JSON.stringify(binding)!==JSON.stringify(configuredBinding)&&desktop) await stopVoice();
  configuredBinding=binding;
}
export function voiceOptions() { return voices.map(voice=>({...voice,available:voice.provider==='kokoro'?kokoroReady:voice.provider==='piper'?piperReady:kokoroReady||piperReady||process.platform==='win32'})); }
export async function cancelSpeech() {await Promise.all([...pending].map(job=>{job.controller.abort();return job.promise.catch(()=>{});}));}
export async function stopVoice() {const bridge=desktop;bridge?.controller.abort();await Promise.all([cancelSpeech(),...(bridge?[bridge.promise]:[])]);}
export async function checkVoice() {
  try { await access(python); const {stdout}=await runProcess(python,[path.join(root,'worker.py'),'status'],{timeout:30_000}); const observed=JSON.parse(stdout);ready=observed.ready;piperReady=observed.piper;kokoroReady=Boolean(observed.kokoro);lastError=ready?null:'Speech model missing. Run services/voice/setup.ps1.'; }
  catch { ready=false;lastError='Local speech is not installed. Run services/voice/setup.ps1.'; }
  return getVoiceStatus();
}
export async function withVoiceJob(fn) {
  const controller=new AbortController();
  const job={controller,promise:null};
  job.promise=Promise.resolve().then(() => fn(controller.signal));pending.add(job);
  try { return await job.promise; } finally {pending.delete(job);}
}
export async function synthesize(text,speed=1,signal,voiceId='auto') {
  if (typeof text !== 'string' || !text.trim() || text.length > 4000) throw new Error('Speech must contain 1–4000 characters.');
  if (!Number.isFinite(speed) || speed < 0.5 || speed > 2) throw new Error('Speech speed must be 0.5–2.');
  const selected=voiceOptions().find(voice=>voice.id===voiceId);
  if(!selected)throw new Error('Unknown local voice. Choose one from the voice list.');
  if(!selected.available)throw new Error('This local voice is not installed. Run speech setup, or choose an installed voice.');
  await mkdir(dataRoot,{recursive:true});
  const temp=await mkdtemp(path.join(dataRoot,'speech-'));
  try {
    const input=path.join(temp,'text.txt'),output=path.join(temp,'speech.wav');
    await writeFile(input,text,'utf8');
    if(kokoroReady||piperReady)await runProcess(python,[path.join(root,'worker.py'),'synthesize','--input',input,'--output',output,'--speed',String(speed),'--voice',voiceId],{signal,timeout:60_000});
    else await runProcess('powershell.exe',['-NoProfile','-NonInteractive','-File',path.join(root,'sapi.ps1'),'-TextFile',input,'-OutputFile',output,'-Speed',String(speed)],{signal,timeout:60_000});
    return await readFile(output);
  } finally {await rm(temp,{recursive:true,force:true});}
}
export function registerVoiceRoutes(app,{runtime,publish,store}) {
  configuredBinding=normalizeHotkey(store?.settings?.().voice.pushToTalk);
  const gate=() => {if (!runtime.isActive()) {const error=new Error('Voice inference is disabled while companion is paused or disconnected.');error.statusCode=409;throw error;}};
  for (const event of ['pause','stop','disconnect']) runtime.on?.(event,() => {void stopVoice();});
  app.get('/api/voice/status',async() => checkVoice());
  app.get('/api/voice/options',async()=>voiceOptions());
  app.get('/api/voice/devices',async() => {const {stdout}=await runProcess(python,[path.join(root,'worker.py'),'devices'],{timeout:20_000});return JSON.parse(stdout);});
  app.post('/api/voice/desktop',async(request,reply) => {
    const settings=desktopSchema.parse(request.body);
    if(settings.enabled===false){await stopVoice();return getVoiceStatus();}
    gate();
    if(desktop)return reply.code(409).send({error:'Desktop voice bridge is already running.'});
    if(process.platform!=='win32')return reply.code(400).send({error:'Native desktop push-to-talk currently supports Windows only.'});
    const apiPort=app.server.address()?.port??Number(process.env.PORT??4365);
    const args=[path.resolve(root,'../../apps/desktop-voice/bridge.py'),'--api-url',`http://127.0.0.1:${apiPort}`,'--hotkey',JSON.stringify(normalizeHotkey(store?.settings?.().voice.pushToTalk))];
    for(const [field,flag] of [['inputDevice','--input-device'],['outputDevice','--output-device']]) {
      const value=settings[field];
      if(value!==undefined)args.push(flag,String(value));
    }
    const controller=new AbortController();
    desktop={controller,promise:runProcess(python,args,{signal:controller.signal,timeout:12*60*60*1000}).catch(error=>{if(error.name!=='AbortError')lastError=error.message;}).finally(()=>{desktop=null;publish();})};
    publish();return getVoiceStatus();
  });
  app.post('/api/voice/cancel',async() => {await cancelSpeech();return {stopped:true};});
  app.post('/api/voice/transcribe',async(request,reply) => {
    gate();
    if (pending.size) return reply.code(409).send({error:'A speech request is already active.'});
    const file=await request.file({limits:{fileSize:12*1024*1024,files:1,parts:1}});
    if (!file || !['audio/webm','audio/wav','audio/x-wav','audio/ogg','audio/mp4','audio/mpeg'].includes(file.mimetype)) return reply.code(400).send({error:'Upload one supported audio recording.'});
    const audio=await file.toBuffer();
    if (file.file.truncated) return reply.code(413).send({error:'Recording exceeds 12 MiB.'});
    gate();
    return withVoiceJob(async signal => {
      try {
        const {stdout}=await runProcess(python,[path.join(root,'worker.py'),'transcribe','--input','-'],{input:audio,signal,timeout:90_000});
        signal.throwIfAborted();gate();return JSON.parse(stdout);
      } catch(error) {lastError=error.name==='AbortError'?null:error.message;throw error;}
      finally {publish();}
    });
  });
  app.post('/api/voice/speak',async(request,reply) => {
    gate();
    const {text,speed=1,voiceId}=speechSchema.parse(request.body);
    const audio=await withVoiceJob(signal => synthesize(text,speed,signal,voiceId??store?.settings?.().voice.ttsVoice??'auto'));
    gate();return reply.type('audio/wav').header('Cache-Control','no-store').send(audio);
  });
  app.post('/api/voice/preview',async(request,reply)=>{
    if(runtime.snapshot().state==='PAUSED')return reply.code(409).send({error:'Resume the companion before previewing a voice.'});
    const settings=previewSchema.parse(request.body??{});
    const voiceId=settings.voiceId??store?.settings?.().voice.ttsVoice??'auto';
    const speed=settings.speed??store?.settings?.().voice.speed??1;
    const audio=await withVoiceJob(signal=>synthesize("Hey, I'm here. Ready to grab some wood and head out?",speed,signal,voiceId));
    if(runtime.snapshot().state==='PAUSED')return reply.code(409).send({error:'Voice preview was paused.'});
    return reply.type('audio/wav').header('Cache-Control','no-store').send(audio);
  });
  app.addHook('onClose',stopVoice);
}
