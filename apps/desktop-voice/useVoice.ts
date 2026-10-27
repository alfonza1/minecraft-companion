import {useCallback,useEffect,useRef,useState} from 'react';

type Settings={handsFree?:boolean;inputDevice?:string;outputDevice?:string;speed?:number;volume?:number};
type Options={state:string;settings:Settings;onTranscript:(text:string)=>Promise<string|void>;onError?:(message:string)=>void};
const ALLOWED=new Set(['ACTIVE','BUSY']);
const SILENCE_MS=800, MIN_SPEECH_MS=250, MAX_UTTERANCE_MS=30_000, VAD_THRESHOLD=0.022;

export function useVoice(options:Options) {
  const config=useRef(options);config.current=options;
  const [enabled,setEnabled]=useState(false),[listening,setListening]=useState(false),[speaking,setSpeaking]=useState(false);
  const [devices,setDevices]=useState<MediaDeviceInfo[]>([]);
  const stream=useRef<MediaStream|null>(null),recorder=useRef<MediaRecorder|null>(null),audio=useRef<HTMLAudioElement|null>(null);
  const context=useRef<AudioContext|null>(null),frame=useRef(0),request=useRef<AbortController|null>(null);
  const recordingStart=useRef(0),silentSince=useRef(0),processing=useRef(false),speakingRef=useRef(false),generation=useRef(0);
  const enabling=useRef(false);
  const report=(error:unknown)=>{if((error as Error)?.name!=='AbortError')config.current.onError?.(error instanceof Error?error.message:String(error));};
  const interrupt=useCallback(async()=>{
    generation.current++;request.current?.abort();audio.current?.pause();audio.current=null;speakingRef.current=false;setSpeaking(false);
    await fetch('/api/voice/cancel',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}).catch(()=>{});
    await fetch('/api/conversation/cancel',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}).catch(()=>{});
  },[]);
  const disable=useCallback(()=>{
    generation.current++;request.current?.abort();
    if(recorder.current?.state==='recording'){recorder.current.onstop=null;recorder.current.stop();}
    recorder.current=null;stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;
    cancelAnimationFrame(frame.current);void context.current?.close();context.current=null;
    audio.current?.pause();audio.current=null;speakingRef.current=false;setSpeaking(false);setListening(false);setEnabled(false);
    void fetch('/api/voice/cancel',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}).catch(()=>{});
  },[]);
  const speak=useCallback(async(text:string)=>{
    if(!ALLOWED.has(config.current.state)||!stream.current)return;
    const current=++generation.current;
    request.current?.abort();audio.current?.pause();
    const controller=new AbortController();request.current=controller;
    let objectUrl:string|undefined;
    try{
      const res=await fetch('/api/voice/speak',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text,speed:config.current.settings.speed??1}),signal:controller.signal});
      if(!res.ok)throw new Error((await res.json()).error??'Speech output failed.');
      const blob=await res.blob();if(current!==generation.current||!ALLOWED.has(config.current.state))return;
      objectUrl=URL.createObjectURL(blob);const output=new Audio(objectUrl);audio.current=output;
      output.volume=Math.max(0,Math.min(1,config.current.settings.volume??0.8));
      const sink=config.current.settings.outputDevice;
      if(sink&&'setSinkId'in output)await(output as HTMLAudioElement&{setSinkId:(id:string)=>Promise<void>}).setSinkId(sink);
      speakingRef.current=true;setSpeaking(true);
      await new Promise<void>((resolve,reject)=>{output.onended=()=>resolve();output.onerror=()=>reject(new Error('Audio playback failed.'));output.onpause=()=>resolve();void output.play().catch(reject);});
    }catch(error){report(error);}finally{if(objectUrl)URL.revokeObjectURL(objectUrl);if(current===generation.current){audio.current=null;speakingRef.current=false;setSpeaking(false);}}
  },[]);
  const stopTalking=useCallback(()=>{if(recorder.current?.state==='recording')recorder.current.stop();setListening(false);},[]);
  const startTalking=useCallback(()=>{
    if(!stream.current||!ALLOWED.has(config.current.state)||recorder.current?.state==='recording'||processing.current)return;
    if(speakingRef.current)void interrupt();
    const token=generation.current;
    const mime=['audio/webm;codecs=opus','audio/ogg;codecs=opus','audio/mp4'].find(m=>MediaRecorder.isTypeSupported(m));
    const input=new MediaRecorder(stream.current,mime?{mimeType:mime}:undefined),chunks:BlobPart[]=[];
    recorder.current=input;recordingStart.current=performance.now();silentSince.current=0;
    input.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
    input.onstop=()=>{void(async()=>{
      setListening(false);if(token!==generation.current||!ALLOWED.has(config.current.state))return;
      if(performance.now()-recordingStart.current<MIN_SPEECH_MS)return;
      processing.current=true;const controller=new AbortController();request.current=controller;
      try{
        const form=new FormData();form.append('audio',new Blob(chunks,{type:input.mimeType.split(';')[0]}),'utterance.audio');
        const response=await fetch('/api/voice/transcribe',{method:'POST',body:form,signal:controller.signal});
        if(!response.ok)throw new Error((await response.json()).error??'Transcription failed.');
        const {text}=await response.json();if(!text||token!==generation.current||!ALLOWED.has(config.current.state))return;
        const reply=await config.current.onTranscript(text);
        processing.current=false;
        if(reply&&token===generation.current)await speak(reply);
      }catch(error){report(error);}finally{processing.current=false;}
    })();};
    input.start();setListening(true);
  },[interrupt,speak]);
  const enable=useCallback(async()=>{
    if(stream.current||enabling.current)return;
    if(!ALLOWED.has(config.current.state)){report(new Error('Start or resume the companion before enabling your microphone.'));return;}
    enabling.current=true;const token=++generation.current;
    try{
      const device=config.current.settings.inputDevice;
      const captured=await navigator.mediaDevices.getUserMedia({audio:{deviceId:device?{exact:device}:undefined,echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
      if(token!==generation.current||!ALLOWED.has(config.current.state)){captured.getTracks().forEach(t=>t.stop());return;}
      stream.current=captured;setEnabled(true);setDevices(await navigator.mediaDevices.enumerateDevices());
      const ctx=new AudioContext(),analyser=ctx.createAnalyser();analyser.fftSize=1024;
      ctx.createMediaStreamSource(captured).connect(analyser);context.current=ctx;
      const samples=new Float32Array(analyser.fftSize);
      const tick=()=>{
        if(!stream.current)return;
        analyser.getFloatTimeDomainData(samples);
        const rms=Math.sqrt(samples.reduce((sum,v)=>sum+v*v,0)/samples.length),now=performance.now();
        // Headphones plus echo cancellation are required for reliable hands-free
        // barge-in. PTT always interrupts playback explicitly.
        if(config.current.settings.handsFree&&!processing.current){
          if(rms>VAD_THRESHOLD){silentSince.current=0;if(recorder.current?.state!=='recording')startTalking();}
          else if(recorder.current?.state==='recording'){silentSince.current||=now;if(now-silentSince.current>SILENCE_MS)stopTalking();}
        }
        if(recorder.current?.state==='recording'&&now-recordingStart.current>MAX_UTTERANCE_MS)stopTalking();
        frame.current=requestAnimationFrame(tick);
      };tick();
    }catch(error){disable();report(error);}finally{enabling.current=false;}
  },[disable,startTalking,stopTalking]);
  useEffect(()=>{if(!ALLOWED.has(options.state))disable();},[options.state,disable]);
  useEffect(()=>disable,[disable]);
  useEffect(()=>{const blur=()=>stopTalking();window.addEventListener('blur',blur);return()=>window.removeEventListener('blur',blur);},[stopTalking]);
  return{enabled,listening,speaking,devices,enable,disable,startTalking,stopTalking,speak,interrupt};
}
