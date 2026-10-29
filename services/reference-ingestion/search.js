import {youtubeId,youtubeReference} from './index.js';

export const DEFAULT_BUILD_STYLES='Natural builds, medieval architecture and cottagecore';
export const videoSearchSchema={type:'object',additionalProperties:false,required:['videos'],properties:{videos:{type:'array',items:{type:'object',additionalProperties:false,required:['url','reason'],properties:{url:{type:'string'},reason:{type:'string'}}}}}};

export function youtubeSearchIntent(text){
  if(typeof text!=='string'||!/(?:you\s*tube)/i.test(text)||! /\b(find|search|look|show|suggest|recommend)\b/i.test(text))return null;
  return text.trim().slice(0,500);
}

export async function verifyVideoOptions(videos,{signal,metadata=youtubeReference}={}){
  if(!Array.isArray(videos))throw new Error('The search provider returned no video list.');
  const unique=new Map();
  for(const entry of videos.slice(0,8)){
    try{const id=youtubeId(entry?.url);if(!unique.has(id))unique.set(id,entry);}catch{}
  }
  const checked=await Promise.allSettled([...unique].map(async([id,entry])=>{
    signal?.throwIfAborted();
    const reference=await metadata(`https://www.youtube.com/watch?v=${id}`,fetch,signal);
    signal?.throwIfAborted();
    return {...reference,videoId:id,thumbnail:`https://i.ytimg.com/vi/${id}/hqdefault.jpg`,reason:String(entry.reason||'').slice(0,600)};
  }));
  signal?.throwIfAborted();
  const options=checked.filter(result=>result.status==='fulfilled').map(result=>result.value).slice(0,5);
  if(!options.length)throw new Error('No search results could be verified with YouTube. Try a different query or paste a tutorial URL in Source material.');
  return options;
}
