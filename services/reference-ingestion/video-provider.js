import {setTimeout as delay} from 'node:timers/promises';
import {join} from 'node:path';
import {secureCacheFactory} from '../realm-connector/secure-cache.js';
import {youtubeId} from './index.js';
import {analysisOutputSchema,analysisPrompt} from './analysis-schema.js';

export const DEFAULT_VIDEO_MODEL='gemini-3.8-flash';
const ENDPOINT='https://generativelanguage.googleapis.com/v1beta/interactions';
const REQUEST_TIMEOUT_MS=30000,ANALYSIS_TIMEOUT_MS=300000,MAX_RESPONSE_BYTES=2000000;
export function createVideoCredentials(directory,codec){
  const cache=secureCacheFactory(join(directory,'provider-secrets'),codec)({cacheName:'geminivideo'});
  return {
    async status(){const saved=await cache.getCached();return {configured:Boolean(saved.key),model:saved.model||DEFAULT_VIDEO_MODEL};},
    async read(){return cache.getCached();},
    async save(key,model=DEFAULT_VIDEO_MODEL){
      if(typeof key!=='string'||!/^[A-Za-z0-9_-]{20,200}$/.test(key))throw new Error('Provide a valid Google AI Studio API key in this field.');
      if(typeof model!=='string'||!/^gemini-[a-z0-9.-]{1,80}$/.test(model))throw new Error('Invalid Gemini video model.');
      await cache.setCached({key,model});return {configured:true,model};
    },
    async clear(){await cache.reset();return {configured:false,model:DEFAULT_VIDEO_MODEL};},
  };
}
async function boundedJson(response){
  let size=0;const chunks=[];
  for await(const chunk of response.body){size+=chunk.length;if(size>MAX_RESPONSE_BYTES)throw new Error('Video provider response exceeded the limit.');chunks.push(chunk);}
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new Error('Video provider returned invalid JSON.');}
}
export async function analyzeYouTube({url,notes='',credentials,signal,onRemoteJob=()=>{},fetcher=fetch,pollMs=2000}){
  const videoId=youtubeId(url),canonical=`https://www.youtube.com/watch?v=${videoId}`;
  const saved=await credentials.read();if(!saved.key)throw new Error('Connect a Google AI Studio key in Build Studio for direct YouTube analysis, or upload permitted video/screenshots for Codex analysis.');
  signal.throwIfAborted();let id,completed=false;
  const deadline=AbortSignal.any([signal,AbortSignal.timeout(ANALYSIS_TIMEOUT_MS)]);
  const headers={'x-goog-api-key':saved.key,'Content-Type':'application/json','Api-Revision':'2026-05-20'};
  async function request(suffix='',method='GET',body,requestSignal=deadline){
    const response=await fetcher(ENDPOINT+suffix,{method,headers,body:body===undefined?undefined:JSON.stringify(body),redirect:'error',signal:AbortSignal.any([requestSignal,AbortSignal.timeout(REQUEST_TIMEOUT_MS)])});
    if(!response.ok){response.body?.cancel().catch(()=>{});throw new Error(`Google video analysis failed (${response.status}). Check API-key access, public-video availability and account quota. No alternate paid provider was used.`);}
    return response.status===204?{}:boundedJson(response);
  }
  try{
    // Background mode supplies a cancellable remote ID. The temporary provider
    // record is deleted after reading/cancelling; no private game context is sent.
    let result=await request('','POST',{model:saved.model||DEFAULT_VIDEO_MODEL,background:true,store:true,input:[{type:'video',uri:canonical,processing:'agentic'},{type:'text',text:analysisPrompt(notes)}],response_format:{type:'text',mime_type:'application/json',schema:analysisOutputSchema},generation_config:{max_output_tokens:12000}});
    if(typeof result.id!=='string'||!/^[A-Za-z0-9_-]{1,300}$/.test(result.id))throw new Error('Video provider did not supply a valid cancellable job ID.');
    id=result.id;await onRemoteJob({id,model:saved.model||DEFAULT_VIDEO_MODEL,status:'running'});
    while(['in_progress','queued'].includes(result.status)){
      await delay(pollMs,undefined,{signal:deadline});result=await request('/'+id);
    }
    if(result.status!=='completed')throw new Error('Video analysis did not complete. Check the source and account quota before retrying.');
    completed=true;
    const parts=(result.steps||[]).filter(step=>step.type==='model_output').flatMap(step=>step.content||[]);
    const text=result.output_text||[...parts,...(result.outputs||[])].filter(output=>output.type==='text').map(output=>output.text||'').join('');
    let report;try{report=JSON.parse(text);}catch{throw new Error('Video analysis returned no structured source report.');}
    return {report,model:saved.model||DEFAULT_VIDEO_MODEL,usage:result.usage?{input_tokens:result.usage.total_input_tokens||0,output_tokens:result.usage.total_output_tokens||0,cached_input_tokens:result.usage.total_cached_tokens||0}:null};
  }catch(error){
    if(!id&&(error instanceof TypeError||['AbortError','TimeoutError'].includes(error.name)))throw new Error('The connection ended before Google returned a job ID. Remote work may have started; check Google AI Studio before retrying.');
    throw error;
  }finally{
    if(id){
      let cancellationFailed=false,deletionFailed=false;
      if(!completed)try{await request('/'+id+'/cancel','POST',undefined,AbortSignal.timeout(10000));}catch{cancellationFailed=true;}
      if(!cancellationFailed)try{await request('/'+id,'DELETE',undefined,AbortSignal.timeout(10000));}catch{deletionFailed=true;}
      await onRemoteJob({id,model:saved.model||DEFAULT_VIDEO_MODEL,status:cancellationFailed?'cancellation-unconfirmed':deletionFailed?'deletion-unconfirmed':completed?'completed':'cancelled'});
      if(cancellationFailed)throw new Error('Local analysis stopped, but Google cancellation could not be confirmed. Check the remote job in Google AI Studio before retrying.');
    }
  }
}
export async function cleanupVideoJob(job,credentials,fetcher=fetch){
  if(!/^[A-Za-z0-9_-]{1,300}$/.test(job.id))throw new Error('Invalid remote video job.');
  const saved=await credentials.read();if(!saved.key)throw new Error('Reconnect the same Google key to clean up this job.');
  const headers={'x-goog-api-key':saved.key,'Api-Revision':'2026-05-20'};
  async function request(method,suffix=''){
    const response=await fetcher(`${ENDPOINT}/${job.id}${suffix}`,{method,headers,redirect:'error',signal:AbortSignal.timeout(10000)});
    return response;
  }
  if(job.status!=='deletion-unconfirmed'){
    const cancelled=await request('POST','/cancel');
    if(!cancelled.ok){
      const current=await request('GET');
      if(!current.ok||!['completed','cancelled','failed'].includes((await boundedJson(current)).status))throw new Error('Google could not confirm cancellation. The remote record was preserved for another cleanup attempt.');
    }else await cancelled.body?.cancel();
  }
  const deleted=await request('DELETE');if(!deleted.ok&&deleted.status!==404)throw new Error('Remote cancellation succeeded, but the provider record could not be deleted. Retry cleanup.');
  await deleted.body?.cancel();return {...job,status:'cancelled',at:new Date().toISOString()};
}
