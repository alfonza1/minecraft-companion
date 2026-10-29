import {mkdtemp,rm,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runProcess} from '../agent-orchestrator/process.js';
export async function withReferenceFrames(reference,directory,signal,work){
  if(!/^[0-9a-f-]{36}\.(png|jpg|webp|mp4|webm)$/.test(reference.filename||''))throw new Error('Choose an archived image or video.');
  const source=join(directory,'references',reference.filename);
  if((await stat(source)).size>32*1024*1024)throw new Error('Reference exceeds the local decoder limit.');
  const output=await mkdtemp(join(directory,'frames-'));
  try{
    const python=join(process.env.LOCALAPPDATA||directory,'MinecraftCompanion','voice-venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
    const command=process.env.COMPANION_MEDIA_PYTHON||python;
    const {stdout}=await runProcess(command,[fileURLToPath(new URL('./frames.py',import.meta.url)),source,output],{signal,timeout:60000,maxBytes:16000});
    const sample=JSON.parse(stdout);
    if(!Array.isArray(sample.frames)||sample.frames.length>24||!sample.frames.length)throw new Error('Invalid frame sampling result.');
    const frames=sample.frames.map(frame=>{
      if(!/^frame-\d{2}\.png$/.test(frame.filename)||!Number.isFinite(frame.seconds))throw new Error('Invalid sampled frame.');
      return {...frame,path:join(output,frame.filename)};
    });
    signal.throwIfAborted();return await work({...sample,frames});
  }finally{await rm(output,{recursive:true,force:true});}
}
