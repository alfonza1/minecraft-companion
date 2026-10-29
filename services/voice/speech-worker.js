import {spawn} from 'node:child_process';
import {join} from 'node:path';

export const SPEECH_IDLE_MS=60_000;
const MAX_MESSAGE_BYTES=16*1024*1024;
export function createSpeechWorker({command,args,idleMs=SPEECH_IDLE_MS}){
  let session=null,queue=Promise.resolve(),idleTimer=null,retained=false;
  async function stop(){
    clearTimeout(idleTimer);const current=session;if(!current)return;
    if(!current.stopping){
      current.stopping=true;
      if(process.platform==='win32'&&current.child.exitCode===null){
        const killer=spawn(join(process.env.SystemRoot||'C:/Windows','System32/taskkill.exe'),['/PID',String(current.child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});
        killer.on('error',()=>current.child.kill());
      }else current.child.kill();
    }
    await current.closed;
  }
  function start(){
    const child=spawn(command,args,{windowsHide:true,shell:false,stdio:['pipe','pipe','ignore']});
    const current={child,stopping:false,waiting:null,closed:null};session=current;let buffer='';
    current.closed=new Promise(resolve=>child.once('close',()=>{if(session===current)session=null;current.waiting?.reject(new Error('Local speech worker stopped.'));resolve();}));
    child.on('error',()=>current.waiting?.reject(new Error('Local speech worker could not start.')));
    child.stdin.on('error',()=>{});
    child.stdout.on('data',chunk=>{
      buffer+=chunk.toString();if(buffer.length>MAX_MESSAGE_BYTES){void stop();return;}
      let newline;while((newline=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,newline);buffer=buffer.slice(newline+1);let value;try{value=JSON.parse(line);}catch{continue;}const waiting=current.waiting;current.waiting=null;waiting?.resolve(value);}
    });
    return current;
  }
  function response(current,signal,send){
    return new Promise((resolve,reject)=>{
      let settled=false;
      const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);if(current.waiting?.resolve===received)current.waiting=null;error?reject(error):resolve(value);};
      const received=value=>finish(null,value);
      const abort=()=>{void stop().then(()=>finish(signal.reason||new DOMException('Cancelled','AbortError')));};
      const timer=setTimeout(()=>{void stop().then(()=>finish(new Error('Local speech timed out.')));},60_000);
      current.waiting={resolve:received,reject:error=>finish(signal?.aborted?signal.reason:error)};
      signal?.addEventListener('abort',abort,{once:true});
      if(signal?.aborted){abort();return;}send?.();
    });
  }
  return {
    get running(){return Boolean(session);},
    keepWarm(value){retained=Boolean(value);clearTimeout(idleTimer);if(!retained&&session){idleTimer=setTimeout(()=>{void stop();},idleMs);idleTimer.unref?.();}},
    request(payload,signal){
      const operation=queue.catch(()=>{}).then(async()=>{
        signal?.throwIfAborted();clearTimeout(idleTimer);
        try{
          let current=session;
          if(current?.stopping){await current.closed;current=null;}
          if(!current){current=start();const ready=await response(current,signal);if(!ready?.ready)throw new Error('Local speech failed to initialize.');}
          signal?.throwIfAborted();
          const result=await response(current,signal,()=>current.child.stdin.write(JSON.stringify(payload)+'\n'));
          signal?.throwIfAborted();if(result?.error)throw new Error('Local speech failed. Check speech setup and keep recordings short.');
          if(payload.mode==='transcribe'){
            if(typeof result?.text!=='string'||result.text.length>4000)throw new Error('Local transcription returned invalid text.');
            return {text:result.text,language:'en'};
          }
          if(typeof result?.audio!=='string')throw new Error('Local speech synthesis failed. Check the selected voice.');
          const audio=Buffer.from(result.audio,'base64');if(audio.length<44||audio.toString('ascii',0,4)!=='RIFF')throw new Error('Local speech returned invalid audio.');return audio;
        }finally{if(session&&!retained){idleTimer=setTimeout(()=>{void stop();},idleMs);idleTimer.unref?.();}}
      });queue=operation.then(()=>{},()=>{});return operation;
    },
    close:stop,
  };
}
