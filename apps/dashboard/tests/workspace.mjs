import { navigateWorkspace } from './navigation.mjs';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {chromium,expect} from '@playwright/test';
import {createApp} from '../../../services/api/index.js';
import {Store} from '../../../services/memory/store.js';

const directory=await mkdtemp(join(tmpdir(),'waypoint-workspace-'));
const store=new Store(directory), evidence=join(process.cwd(),'.git/verification/workspace');
await mkdir(evidence,{recursive:true});
let requests=0;
const app=await createApp({store,modelRequest:async()=>{requests++;return {plan:{reply:'A quiet evening and a shared adventure sounds good.',intent:'casual',actions:[]},usage:{input_tokens:10,output_tokens:10},model:'test-provider-double'};}});
await app.listen({host:'127.0.0.1',port:0});
const base=`http://127.0.0.1:${app.server.address().port}`;
const browser=await chromium.launch();
const page=await browser.newPage({viewport:{width:1440,height:1050},reducedMotion:'reduce'});
const errors=[];page.on('pageerror',error=>errors.push(error.message));
const routes=['Session','My companion','Current mission','Tasks & plans','Inventory','Resources','Collaboration','Activity','Communication','Build studio','Games','Extensions','Community','Settings','Setup','Diagnostics & logs'];
const post=async(path,body={})=>{const response=await fetch(base+'/api'+path,{method:'POST',headers:{'content-type':'application/json',origin:base},body:JSON.stringify(body)});const data=await response.json();assert.equal(response.ok,true,JSON.stringify(data));return data;};
async function navigate(label){return navigateWorkspace(page,label);}
try{
  await page.goto(base);await page.getByText('Connected to local runtime',{exact:true}).waitFor();
  for(const width of [1440,768,414,375,320]){
    await page.setViewportSize({width,height:1050});
    for(const label of routes){await navigate(label);await page.waitForTimeout(40);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${label}: ${width}px overflow`);}
    await navigate('Session');await page.screenshot({path:join(evidence,`overview-${width}.png`),fullPage:true});
  }
  await page.setViewportSize({width:1440,height:1050});await navigate('Session');
  // Keep test evidence separate from the website's deliberately framed product capture.
  await page.screenshot({path:join(evidence,'public-workspace.png'),fullPage:false});
  await navigate('My companion');await page.getByRole('textbox',{name:'Companion name',exact:true}).fill('Trail');await page.getByRole('button',{name:'Save name',exact:true}).click();
  await page.getByRole('combobox',{name:'Conversation style',exact:true}).selectOption('dry-humor');
  await expect(page.getByRole('combobox',{name:'Conversation style',exact:true})).toHaveValue('dry-humor');
  const olderSnapshot=await (await fetch(base+'/api/state')).json();
  let finishDelayedFetch;
  const delayedFetch=new Promise(resolve=>{finishDelayedFetch=resolve;});
  await page.route('**/api/state',async route=>{
    await page.waitForTimeout(150);
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(olderSnapshot)});
    finishDelayedFetch();
  },{times:1});
  await page.getByRole('textbox',{name:'Companion name',exact:true}).fill('Trailblazer');
  await page.getByRole('button',{name:'Save name',exact:true}).click();
  await delayedFetch;
  await expect(page.getByRole('heading',{name:'Trailblazer',exact:true})).toBeVisible();
  await expect(page.getByRole('textbox',{name:'Companion name',exact:true})).toHaveValue('Trailblazer');
  await navigate('Session');await page.getByRole('button',{name:'Start planning offline',exact:true}).click();
  await page.getByRole('textbox',{name:'Message your companion',exact:true}).fill('Let’s just hang out');
  await page.getByRole('button',{name:'Send message',exact:true}).click();
  // Curly apostrophe may use model routing; explicit mode command is deterministic.
  await post('/conversation',{text:'switch to hangout mode'});assert.equal(store.get('companionProfile')[0].mode,'hangout');
  await page.getByRole('button',{name:/Remember this message from/}).first().click();
  await navigate('My companion');await page.getByRole('heading',{name:'A conversation to remember',exact:true}).waitFor();
  await page.getByRole('checkbox',{name:'Use saved memories',exact:true}).click();
  await expect(page.getByRole('checkbox',{name:'Use saved memories',exact:true})).not.toBeChecked();
  assert.equal(store.get('companionProfile')[0].memoryEnabled,false);
  await page.reload();await page.getByRole('heading',{level:1,name:'My companion',exact:true}).waitFor();
  await expect(page.getByRole('checkbox',{name:'Use saved memories',exact:true})).not.toBeChecked();
  assert.equal(store.get('adventureMoments').length,1);
  await page.getByRole('button',{name:'Delete moment A conversation to remember',exact:true}).click();
  await expect(page.getByRole('heading',{name:'A conversation to remember',exact:true})).toHaveCount(0);
  await post('/control',{command:'pause'});const before=requests;
  const paused=await fetch(base+'/api/conversation',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text:'Hello'})});assert.ok(!paused.ok);assert.equal(requests,before);
  // Synthetic world fixtures below validate rendering/event propagation; native gameplay is a separate suite.
  const runtime=app.companion.runtime;runtime.state='ACTIVE';runtime.planning=false;runtime.connection={...runtime.connection,status:'connected',realmId:101,username:'FixtureCompanion',version:'26.3'};store.updateSettings({realmId:101});
  const observedAt=new Date().toISOString();
  runtime.world={observedAt,inventoryExact:true,provenance:'observed',position:{x:10,y:64,z:15},dimension:'overworld',health:20,food:20,oxygen:20,experience:{level:0},equipment:{head:null,torso:null,legs:null,feet:null,hand:null,offhand:null},inventory:[{slot:36,name:'oak_log',count:42,displayName:'Oak Log',stackSize:64,type:1}],nearbyPlayers:[],nearbyEntities:[],timeOfDay:1000};
  runtime.currentTask={id:randomUUID(),name:'chop_tree',tool:'chop_tree',status:'running',descriptor:{tool:'chop_tree',args:{count:64,species:'oak'}},baselineInventory:{},startedAt:observedAt};
  runtime.emit('change');await navigate('Session');await expect(page.getByText('42', {exact:false}).first()).toBeVisible();
  await navigate('Inventory');await page.getByRole('button',{name:'Slot 36: 42 Oak Log',exact:true}).click();await page.getByRole('heading',{name:'Oak Log',exact:true}).waitFor();
  runtime.world.inventory[0].count=64;runtime.world.observedAt=new Date().toISOString();runtime.emit('change');await expect(page.getByRole('button',{name:'Slot 36: 64 Oak Log',exact:true})).toBeVisible();
  const project=await post('/projects',{name:'Browser fixture build',version:'26.3'});
  await post(`/projects/${project.id}/blueprint`,{blueprint:{version:'26.3',dimensions:{x:2,y:1,z:1},blocks:[{x:0,y:0,z:0,name:'oak_log',section:'foundation'},{x:1,y:0,z:0,name:'oak_log',section:'foundation'}],provenance:'reconstructed',uncertainties:[]}});
  await post(`/projects/${project.id}/split`,{aiPercent:50});
  const savedProject=store.get('projects').find(value=>value.id===project.id);
  runtime.currentTask=null;runtime.world.inventory=[];
  store.put('materialRequests',{id:`${project.id}:${savedProject.revision}:oak_log`,projectId:project.id,revision:savedProject.revision,item:'oak_log',count:1,targetStock:1,reason:'One log is missing for the fixture foundation.',status:'requested',at:new Date().toISOString()});runtime.emit('change');
  await navigate('Collaboration');await page.getByRole('button',{name:'I’ll handle it',exact:true}).click();await page.getByRole('button',{name:'Accepted',exact:true}).click();await page.getByText('Owned by you',{exact:true}).waitFor();
  await page.reload();await page.getByText('Connected to local runtime',{exact:true}).waitFor();await page.getByRole('button',{name:'Accepted',exact:true}).click();await page.getByText('Owned by you',{exact:true}).waitFor();
  await navigate('Resources');await page.getByRole('button',{name:'Finished building items',exact:true}).click();await page.getByRole('heading',{name:'Oak Log',exact:true}).waitFor();
  await navigate('Games');assert.equal(await page.getByRole('button',{name:/Open .* workspace/}).count(),1);
  await navigate('Extensions');await page.getByRole('button',{name:'Inspect current state',exact:true}).click();await expect(page.locator('.diagnostic-output')).toContainText('observed');
  await page.getByRole('button',{name:'Open conversation panel',exact:true}).click();await expect(page.getByRole('complementary',{name:'Companion conversation'})).toBeVisible();await page.getByRole('button',{name:'Close conversation panel',exact:true}).last().click();
  await page.context().setOffline(true);await page.waitForTimeout(500);await page.context().setOffline(false);await page.reload();await page.getByText('Connected to local runtime',{exact:true}).waitFor();
  assert.deepEqual(errors,[]);
  const result={passed:true,viewportChecks:routes.length*5,routes:routes.length,scope:'Real local HTTP/WebSocket/SQLite and browser; synthetic world/provider fixtures explicitly isolated. Native gameplay tested separately.',checks:['profile and mode persistence','older HTTP snapshot cannot replace newer WebSocket state','source-backed memory save/disable/delete','paused no inference','inventory event update','assistance ownership persistence','raw/placement views','only one playable game','observer extension','conversation panel','state restored after reopen'],modelDoubleRequests:requests,consoleErrors:errors};
  await writeFile(join(evidence,'results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}catch(error){console.error('Browser errors:',errors);await page.screenshot({path:join(evidence,'failure.png'),fullPage:true}).catch(()=>{});throw error;}finally{await browser.close();await app.close();await rm(directory,{recursive:true,force:true});}
