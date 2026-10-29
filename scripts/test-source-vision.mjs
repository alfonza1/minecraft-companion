import {mkdtemp,mkdir,writeFile,readFile,copyFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {runProcess} from '../services/agent-orchestrator/process.js';
import {codexVisionRequest} from '../services/agent-orchestrator/index.js';
import {createModelCatalog} from '../services/agent-orchestrator/models.js';
import {withReferenceFrames} from '../services/reference-ingestion/frames.js';
import {analysisPrompt,analysisOutputSchema,validateAnalysis} from '../services/reference-ingestion/analysis-schema.js';
import {reconstructionPrompt,reconstructionSchemaFor,expandReconstruction} from '../services/build-planner/reconstruction.js';
import {calculateMaterials} from '../services/build-planner/index.js';
if(!process.argv.includes('--live-codex'))throw new Error('Use --live-codex for actual multimodal analysis and reconstruction of an owned fixture.');
const directory=await mkdtemp(join(tmpdir(),'companion-source-')),output='.git/verification/source-vision';await mkdir(output,{recursive:true});await mkdir(join(directory,'references'));
const browser=await chromium.launch({headless:true}),modelCatalog=createModelCatalog();
const evidence={at:new Date().toISOString(),scope:'Owned locally rendered tutorial cards encoded as a real MP4, actual PyAV sampling, actual Codex image inference then actual grounded reconstruction and version-specific materials. No YouTube downloading, private media, microphone or Realm actions.'};
try{
  const page=await browser.newPage({viewport:{width:960,height:640}}),images=[];
  const cards=[['Materials and dimensions','Footprint: 3 × 3 blocks. Height: 3 blocks.','9 oak planks for the floor. 2 cobblestone blocks for one pillar.'],['Floor plan','Fill y=0 with oak planks, x=0..2, z=0..2.','The entire floor is nine oak planks.'],['Pillar','Add cobblestone at x=0,z=0 at y=1 and y=2.','No other blocks. No roof. All positions are relative.']];
  for(const [index,card] of cards.entries()){
    await page.setContent(`<body style="margin:0;background:#15241d;color:#ebead9;font:26px Arial;padding:55px;box-sizing:border-box"><small>OWNED MINECRAFT TUTORIAL FIXTURE · STAGE ${index+1}</small><h1>${card[0]}</h1><p>${card[1]}</p><p>${card[2]}</p><div style="display:grid;grid-template-columns:repeat(3,60px);gap:4px;margin-top:30px">${Array.from({length:9},(_,i)=>`<div style="height:60px;background:${i===0&&index===2?'#81817b':'#b58b52'};border:2px solid #493d2c"></div>`).join('')}</div>`);
    const image=join(output,`card-${index}.png`);await page.screenshot({path:image});images.push(image);
  }
  const python=join(process.env.LOCALAPPDATA,'MinecraftCompanion/voice-venv/Scripts/python.exe'),filename=randomUUID()+'.mp4';
  await runProcess(python,['scripts/make-vision-fixture.py',join(output,'source.mp4'),...images],{timeout:30000});await copyFile(join(output,'source.mp4'),join(directory,'references',filename));
  const signal=AbortSignal.timeout(240000),start=performance.now();
  const result=process.argv.includes('--reconstruction-only')?JSON.parse(await readFile(join(output,'analysis.json'),'utf8')):await withReferenceFrames({filename},directory,signal,async sample=>{
    evidence.sampling={frames:sample.frames.length,duration:sample.duration};
    return codexVisionRequest({prompt:analysisPrompt('Read the supplied tutorial cards carefully. They are an owned test video, not a finished house. Do not invent a roof.')+`\nFrame timestamps: ${JSON.stringify(sample.frames.map(frame=>frame.seconds))}`,images:sample.frames.map(frame=>frame.path),schema:analysisOutputSchema},{signal,model:'gpt-6.1-sol',modelCatalog});
  });
  const report=validateAnalysis(result.data);assert.equal(report.sourceAccessible,true);
  await writeFile(join(output,'analysis.json'),JSON.stringify(result,null,2));
  assert.equal(report.materialList.find(row=>row.name==='oak_planks')?.quantity,9);assert.equal(report.materialList.find(row=>row.name==='cobblestone')?.quantity,2);
  const design=await codexVisionRequest({prompt:reconstructionPrompt({analysis:report,version:'26.3'}),schema:reconstructionSchemaFor('26.3',report)},{signal,model:'gpt-6.1-sol',modelCatalog});
  await writeFile(join(output,'reconstruction.json'),JSON.stringify(design,null,2));
  const blueprint=expandReconstruction(design.data,'26.3'),materials=calculateMaterials(blueprint);
  assert.equal(blueprint.blocks.length,11);assert.equal(materials.placed.find(row=>row.name==='oak_planks')?.quantity,9);assert.equal(materials.placed.find(row=>row.name==='cobblestone')?.quantity,2);
  Object.assign(evidence,{passed:true,ms:Math.round(performance.now()-start),report,blueprint,materials,usage:{analysis:result.usage,reconstruction:design.usage}});
  console.log({passed:true,frames:evidence.sampling?.frames||'previous sampled analysis',placements:blueprint.blocks.length,sourceMaterials:report.materialList});
}finally{await writeFile(join(output,'results.json'),JSON.stringify(evidence,null,2));await browser.close();await modelCatalog.close();await rm(directory,{recursive:true,force:true});}
