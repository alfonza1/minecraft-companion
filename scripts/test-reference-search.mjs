import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {codexVideoSearch,codexRequest} from '../services/agent-orchestrator/index.js';
import {createModelCatalog} from '../services/agent-orchestrator/models.js';
import {verifyVideoOptions} from '../services/reference-ingestion/search.js';
if(!process.argv.includes('--live-codex'))throw new Error('Use --live-codex for two actual account requests with fixed public prompts.');
const modelCatalog=createModelCatalog(),results={at:new Date().toISOString(),scope:'Actual Codex live web search and YouTube public oEmbed verification; fixed public query only. One Luna greeting. No microphone, private chat, Minecraft connection or video downloading. These benchmark calls are outside app usage totals.'};
if(process.argv.includes('--search-only')){
  try{results.conversation=JSON.parse(await readFile('.git/verification/reference-search/live.json','utf8')).conversation;}catch{}
  results.scope+=' Search-only reruns preserve the previously measured greeting.';
}
try{
  let start=performance.now();
  if(!process.argv.includes('--search-only')){
    const chat=await codexRequest('Return a short casual greeting to a Minecraft teammate, intent casual and actions empty. Do not use tools.',{model:'gpt-6-luna',provider:'codex',modelCatalog,fastResponses:true});
    assert.equal(chat.plan.actions.length,0);results.conversation={model:chat.model,ms:Math.round(performance.now()-start),usage:chat.usage,reply:chat.plan.reply};console.log(results.conversation);
  }
  start=performance.now();
  const search=await codexVideoSearch({query:'Minecraft small medieval cottage survival build tutorial materials list',styles:'Natural, medieval and cottagecore'},{provider:'codex',model:'gpt-6.1-sol',modelCatalog});
  const videos=await verifyVideoOptions(search.data.videos);assert.ok(videos.length>=2);
  assert.ok(search.webSearchItems.length>0,'The CLI must report an actual web-search tool item.');
  results.search={ms:Math.round(performance.now()-start),model:search.model,usage:search.usage,webSearchItems:search.webSearchItems,videos};console.log({videos:videos.map(v=>({title:v.title,url:v.url})),ms:results.search.ms,webSearchItems:search.webSearchItems});results.passed=true;
}finally{await mkdir('.git/verification/reference-search',{recursive:true});await writeFile('.git/verification/reference-search/live.json',JSON.stringify(results,null,2));await modelCatalog.close();}
