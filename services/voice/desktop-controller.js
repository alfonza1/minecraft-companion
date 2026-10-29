import { createDesktopStatus } from './desktop-status.js';

export function resolveDesktopDevice(preference, devices, direction) {
  if (!preference) return undefined;
  const matches=devices.filter(device=>device.name===preference.name && device.hostapi===preference.hostapi && device[`max_${direction}_channels`]>0);
  if(matches.length!==1) {
    const error=new Error(`Saved desktop ${direction==='input'?'microphone':'speakers'} unavailable. Choose a connected device in Settings.`);
    error.code='DESKTOP_DEVICE_MISSING';throw error;
  }
  return matches[0].id;
}

export function createDesktopController({runtime,store,publish,launch,supported=true}) {
  let worker=null, error=null, suspended=false, closed=false, manualPlanning=false;
  let queue=Promise.resolve();
  const signature=()=>JSON.stringify([store.settings().voice.desktopEnabled,store.settings().voice.desktopInputDevice,store.settings().voice.desktopOutputDevice,store.settings().voice.pushToTalk]);
  let previous=signature();
  const allowed=()=>supported && !closed && !suspended && store.settings().voice.desktopEnabled!==false && runtime.isActive() && (runtime.connection?.status==='connected'||manualPlanning);
  const enqueue=fn=>{queue=queue.catch(()=>{}).then(fn);return queue;};
  async function stopWorker() {const current=worker;current?.controller.abort();await current?.promise;}
  function startWorker() {
    const controller=new AbortController(),status=createDesktopStatus(publish);
    const current={controller,status,promise:null};worker=current;error=null;
    current.promise=Promise.resolve().then(()=>{controller.signal.throwIfAborted();return launch(store.settings().voice,controller.signal,chunk=>status.receive(chunk));})
      .catch(failure=>{if(failure.name!=='AbortError')error=failure.code==='DESKTOP_DEVICE_MISSING'?failure.message:'Desktop microphone stopped. Check its permissions and device selection, then enable desktop voice again.';})
      .finally(()=>{if(worker===current)worker=null;publish();});
    publish();
  }
  function sync({restart=false,manual=false}={}) {
    if(manual){suspended=false;manualPlanning=Boolean(runtime.planning);}
    return enqueue(async()=>{if(restart||!allowed())await stopWorker();if(allowed()&&!worker)startWorker();});
  }
  function stop() {worker?.controller.abort();return enqueue(stopWorker);}
  const activate=()=>{suspended=false;void sync();};
  const deactivate=()=>{manualPlanning=false;void stop();};
  for(const event of ['connected','resume'])runtime.on(event,activate);
  for(const event of ['pause','stop','disconnect'])runtime.on(event,deactivate);
  return {
    snapshot:()=>({running:Boolean(worker),...(worker?.status.snapshot()??{phase:'off',error})}),
    sync,stop,
    async update(){const next=signature();if(next===previous)return;previous=next;await sync({restart:true});},
    async suspend(value){suspended=value;await sync();},
    clearError(code){if(!code)error=null;worker?.status.clearError(code);},
    async close(){closed=true;for(const event of ['connected','resume'])runtime.off(event,activate);for(const event of ['pause','stop','disconnect'])runtime.off(event,deactivate);await stop();},
  };
}
