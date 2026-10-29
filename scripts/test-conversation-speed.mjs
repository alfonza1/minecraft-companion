import {mkdtemp,writeFile,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {locateCodex,CODEX_RESTRICTIONS,conversationArguments} from '../services/agent-orchestrator/codex-cli.js';
import {runProcess} from '../services/agent-orchestrator/process.js';
if(!process.argv.includes('--live-codex'))throw new Error('This runs two real Codex requests. Use --live-codex explicitly.');
const directory=await mkdtemp(join(tmpdir(),'companion-speed-')),schema=join(directory,'schema.json');
await writeFile(schema,JSON.stringify({type:'object',additionalProperties:false,required:['reply'],properties:{reply:{type:'string'}}}));
const [command,prefix]=await locateCodex(),results=[];
try{
  for(const [profile,args] of [['previous',[]],['fast',conversationArguments(true)]]){
    const start=performance.now();
    const {stdout}=await runProcess(command,[...prefix,'exec',...CODEX_RESTRICTIONS,...args,'--model','gpt-6.1-sol','--json','--output-schema',schema,'-'],{cwd:directory,input:'Reply with one short casual greeting for a Minecraft teammate. No tools, actions or external requests.',timeout:90000});
    const events=stdout.trim().split(/\r?\n/).map(line=>JSON.parse(line)),failed=events.find(event=>event.type==='turn.failed'||event.type==='error');assert.equal(failed,undefined,JSON.stringify(failed));
    const final=events.findLast(event=>event.type==='item.completed'&&event.item?.type==='agent_message');assert.ok(final);
    results.push({profile,ms:Math.round(performance.now()-start),usage:events.findLast(event=>event.type==='turn.completed')?.usage,reply:JSON.parse(final.item.text).reply});console.log(results.at(-1));
  }
  await mkdir('.git/verification/conversation-speed',{recursive:true});await writeFile('.git/verification/conversation-speed/results.json',JSON.stringify({at:new Date().toISOString(),results,scope:'Two actual Codex gpt-6.1-sol CLI turns with identical fixed public prompts/schema. Previous profile vs omitted skill instructions plus low reasoning. These benchmark calls are outside companion usage totals; no private conversation, world context or Minecraft actions.'},null,2));
}finally{await rm(directory,{recursive:true,force:true});}
