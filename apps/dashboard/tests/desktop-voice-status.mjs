import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { createApp } from '../../../services/api/index.js';
import { Store } from '../../../services/memory/store.js';
import { createDesktopStatus } from '../../../services/voice/desktop-status.js';

const directory=await mkdtemp(join(tmpdir(),'companion-desktop-status-'));
const store=new Store(directory);store.updateSettings({voice:{pushToTalk:{key:'Mouse5',modifiers:[]}}});
let running=true;const status=createDesktopStatus();
const voiceModule={getVoiceStatus:()=>({available:true,status:'ready',error:null,desktop:{running,hotkey:'Mouse 5',mode:'push-to-talk',...status.snapshot()}})};
const app=await createApp({store,skipExtensions:true,voiceModule});
app.get('/api/voice/status',async()=>voiceModule.getVoiceStatus());
app.post('/api/voice/cancel',async()=>({stopped:true}));
app.post('/api/voice/desktop',async request=>{running=request.body.enabled;app.companion.publish();return voiceModule.getVoiceStatus();});
await app.companion.runtime.control('plan');await app.listen({host:'127.0.0.1',port:0});
const browser=await chromium.launch({headless:true});
try {
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{window.__COMPANION_DESKTOP__={updatesPending:false};window.micRequests=0;navigator.mediaDevices.getUserMedia=async()=>{window.micRequests++;throw new Error('Physical microphone forbidden in this UI fixture');};});
  await page.goto(`http://127.0.0.1:${app.server.address().port}`);
  const dock=page.locator('.voice-dock');
  await dock.getByText('Opening desktop microphone…').waitFor();
  assert.match(await dock.innerText(),/Works while Minecraft or another app is focused/);
  assert.equal(await dock.getByRole('button',{name:'Enable voice',exact:true}).count(),0);
  for(const phase of ['ready','listening','transcribing','thinking','speaking']) {
    status.receive(JSON.stringify({phase})+'\n');app.companion.publish();
    await page.waitForFunction(expected=>document.querySelector('.voice-dock strong').textContent===expected,{
      ready:'Desktop push to talk ready',listening:'Listening…',transcribing:'Transcribing your speech…',thinking:'Companion thinking…',speaking:'Companion speaking',
    }[phase]);
  }
  status.receive('{"phase":"error","code":"silence"}\n');app.companion.publish();
  await dock.getByText(/No speech was heard/).waitFor();
  const evidence=join(process.cwd(),'.git/verification/desktop-voice-status');await mkdir(evidence,{recursive:true});
  for(const width of [1440,390]) {
    await page.setViewportSize({width,height:1000});
    assert.equal(await page.locator('body').evaluate(element=>element.scrollWidth>innerWidth),false);
    await page.screenshot({path:join(evidence,`status-${width}.png`),fullPage:true});
  }
  await dock.getByRole('button',{name:'Disable desktop voice',exact:true}).click();
  await dock.getByRole('button',{name:'Enable desktop voice',exact:true}).waitFor();
  assert.equal(running,false);
  await dock.getByRole('button',{name:'Enable desktop voice',exact:true}).click();
  await dock.getByRole('button',{name:'Disable desktop voice',exact:true}).waitFor();
  assert.equal(running,true);assert.equal(await page.evaluate(()=>window.micRequests),0);
  assert.equal(app.companion.snapshot().usage.requests,0);assert.deepEqual(errors,[]);
  await writeFile(join(evidence,'results.json'),JSON.stringify({passed:true,at:new Date().toISOString(),errors,scope:'Actual isolated API, SQLite and WebSocket UI with explicit desktop status fixture. All native voice phases/errors and disable control verified at desktop/mobile sizes; zero physical microphone, model or Realm requests.'},null,2));
  console.log('Desktop voice status, errors and disable control passed; no browser capture or model requests.');
} finally {await browser.close();await app.close();await rm(directory,{recursive:true,force:true});}
