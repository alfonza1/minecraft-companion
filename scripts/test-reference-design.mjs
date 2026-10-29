import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {codexBlueprintRequest} from '../services/agent-orchestrator/index.js';
import {createModelCatalog} from '../services/agent-orchestrator/models.js';
import {validateBlueprint,calculateMaterials} from '../services/build-planner/index.js';
import {assistedAssignments} from '../services/resource-ledger/acquisition.js';
if(!process.argv.includes('--live-codex'))throw new Error('Use --live-codex for one real blueprint generation with public reference metadata.');
const search=JSON.parse(await readFile('.git/verification/reference-search/live.json','utf8'));
assert.equal(search.passed,true);const reference=search.search.videos[0],modelCatalog=createModelCatalog();
try{
  const start=performance.now();
  const result=await codexBlueprintRequest({version:'26.3',description:`A tiny medieval cottage inspired by the public title ${reference.title}. Footprint at most 5x5 and height at most 5, full-cube oak and cobblestone only, solid floor, doorway opening, complete low roof. Max 100 block placements. No stairs, slabs, furniture or terrain work. This is a compact original interpretation; do not claim to have watched or copied the video.`,references:[{title:reference.title,url:reference.url,available:'Public metadata only; video unseen.'}]},{model:'gpt-6.1-sol',provider:'codex',modelCatalog});
  const blueprint=validateBlueprint(result.blueprint),materials=calculateMaterials(blueprint),assignments=assistedAssignments(materials.raw);
  assert.ok(blueprint.blocks.length>20);assert.equal(materials.placed.reduce((n,row)=>n+row.quantity,0),blueprint.blocks.length);assert.ok(blueprint.uncertainties.length);
  await writeFile('.git/verification/reference-search/design.json',JSON.stringify({at:new Date().toISOString(),passed:true,ms:Math.round(performance.now()-start),model:result.model,usage:result.usage,reference,blueprint,materials,assignments,scope:'Actual work-model generated original compact interpretation from verified public title/URL. Validated explicit blocks and calculated version-specific quantities. Video was not analyzed; no construction, Realm or private conversation.'},null,2));
  console.log({model:result.model,placements:blueprint.blocks.length,raw:materials.raw,uncertainties:blueprint.uncertainties});
}finally{await modelCatalog.close();}
