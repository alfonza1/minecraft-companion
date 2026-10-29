import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {chromium} from 'playwright';
import {Store} from '../../../services/memory/store.js';
import {createApp} from '../../../services/api/index.js';
import {companionPerformance} from '../../../services/companion-runtime/performance.js';
import {requestMaterial} from '../../../services/resource-ledger/material-requests.js';
import {reviseProject} from '../../../services/build-planner/index.js';

const directory=await mkdtemp(join(tmpdir(),'companion-speed-ui-')),store=new Store(directory),output='.git/verification/speed-ui';
store.updateSettings({voice:{desktopEnabled:false}});
const project=reviseProject({id:'11111111-1111-4111-8111-111111111111',name:'Cottage fixture',version:'26.3',revision:0,references:[],aiPercent:50},{version:'26.3',dimensions:{x:1,y:1,z:1},provenance:'reconstructed',blocks:[{x:0,y:0,z:0,name:'oak_planks'}]});
store.put('projects',project);
const app=await createApp({store}),browser=await chromium.launch({headless:true});
const evidence={passed:false,errors:[],scope:'Headless UI with isolated SQLite fixture; no Realm or model calls.'};
try{
  await app.listen({host:'127.0.0.1',port:0});await mkdir(output,{recursive:true});
  const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',error=>evidence.errors.push(error.message));
  await page.goto(`http://127.0.0.1:${app.server.address().port}`);
  await page.getByRole('navigation').getByRole('button',{name:'Settings',exact:true}).click();
  await page.getByText('No timing samples yet.',{exact:false}).waitFor();
  await companionPerformance.measure('walking',()=>new Promise(resolve=>setTimeout(resolve,20)));app.companion.publish();
  await page.getByRole('cell',{name:'walking',exact:true}).waitFor();
  for(const width of [1440,390]){
    await page.setViewportSize({width,height:1000});await page.getByRole('heading',{name:'Where time goes'}).scrollIntoViewIfNeeded();
    await page.screenshot({path:join(output,`diagnostics-${width}.png`)});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  }
  requestMaterial({store,project,item:'scaffolding',count:12});app.companion.publish();
  await page.getByRole('navigation').getByRole('button',{name:'Shared tasks',exact:true}).click();
  await page.getByText('Could you bring 12 Scaffolding?',{exact:true}).waitFor();
  await page.getByText('Temporary building platforms use dirt or cobblestone instead',{exact:false}).waitFor();
  for(const width of [1440,390]){
    await page.setViewportSize({width,height:1000});await page.getByText('Could you bring 12 Scaffolding?',{exact:true}).scrollIntoViewIfNeeded();
    await page.screenshot({path:join(output,`materials-${width}.png`)});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  }
  assert.deepEqual(evidence.errors,[]);assert.equal((await app.inject('/api/state')).json().usage.requests,0);evidence.passed=true;
}finally{await writeFile(join(output,'results.json'),JSON.stringify(evidence,null,2));await browser.close();await app.close();await rm(directory,{recursive:true,force:true});}
console.log(evidence);
