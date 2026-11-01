import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile, stat, mkdir } from 'node:fs/promises';
import { resolve, join, extname, sep } from 'node:path';
import assert from 'node:assert/strict';
const root = resolve('apps/website/dist'), base='/minecraft-companion/';
const artifact = resolve('.git/website-checks'); await mkdir(artifact,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.woff':'font/woff','.woff2':'font/woff2'};
const server=createServer(async(req,res)=>{
  try {
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if(!pathname.startsWith(base)){res.writeHead(404);return res.end();}
    let path=resolve(root,pathname.slice(base.length)||'.');
    if(path!==root&&!path.startsWith(root+sep)){res.writeHead(403);return res.end();}
    if((await stat(path)).isDirectory())path=join(path,'index.html');
    res.writeHead(200,{'Content-Type':mime[extname(path)]||'application/octet-stream'});res.end(await readFile(path));
  } catch {res.writeHead(404);res.end('Not found');}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true});
const errors=[],requests=[]; let checked=0;
try {
  const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',req=>requests.push(req.url()));
  for(const route of ['', 'get-started/','how-it-works/','features/','docs/','engineering/','contribute/','roadmap/']){
    const response=await page.goto(origin+base+route);assert.equal(response.status(),200);
    await page.waitForLoadState('networkidle');
    assert.equal(await page.locator('h1').count(),1);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,route+' desktop overflow');
    checked++;
  }
  await page.goto(origin+base);await page.waitForLoadState('networkidle');
  assert.equal(await page.locator('.survival-scene img').evaluate(image=>image.complete && image.naturalWidth>0),true);
  assert.match(await page.locator('.hero-copy').innerText(), /AI teammate/);
  await page.screenshot({path:join(artifact,'home-desktop.png'),fullPage:true});
  await page.screenshot({path:join(artifact,'home-viewport.png')});
  await page.locator('.hero').screenshot({path:join(artifact,'hero.png')});
  await page.goto(origin+base+'how-it-works/');
  await page.getByRole('button',{name:/06.*Recover/}).click();
  assert.match(await page.locator('.lifecycle-detail').innerText(),/Reconnection returns paused/);
  await page.goto(origin+base+'docs/');
  await page.getByRole('searchbox').fill('cancellation');assert.equal(await page.locator('.doc-list>a').count(),1);
  await page.getByRole('searchbox').fill('zzzz-no-guide');await page.getByRole('button',{name:'Clear search'}).click();
  assert.equal(await page.locator('.doc-list>a').count(),12);
  await page.goto(origin+base+'get-started/');
  await page.getByRole('button',{name:'Linux',exact:true}).click();
  assert.match(await page.locator('.setup-steps').innerText(),/experimental path/);
  await page.getByRole('button',{name:'Existing subscription'}).click();
  assert.match(await page.locator('.setup-steps').innerText(),/External providers may require/);
  for(const width of [390, 760]){
    await page.setViewportSize({width,height:844});
    for(const route of ['', 'get-started/','how-it-works/','features/','docs/','engineering/','contribute/','roadmap/']){
      await page.goto(origin+base+route);await page.waitForLoadState('networkidle');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,route+' mobile overflow');
      checked++;
    }
  }
  await page.setViewportSize({width:390,height:844});await page.goto(origin+base);
  await page.getByRole('button',{name:'Menu',exact:true}).click();
  await page.locator('#primary-navigation').getByRole('link',{name:'Docs',exact:true}).click();
  assert.match(page.url(),/docs/);
  await page.goto(origin+base);await page.waitForLoadState('networkidle');
  await page.screenshot({path:join(artifact,'home-mobile.png'),fullPage:true});
  // Original social artwork rendered from this site's own components.
  await page.setViewportSize({width:1200,height:630});await page.goto(origin+base);
  await page.addStyleTag({content:'body{padding:0}.header{height:70px}.hero{min-height:560px;padding:20px 0}.hero h1{font-size:64px}.survival-scene{max-width:520px}'});
  await page.screenshot({path:resolve('apps/website/public/social.png')});
  assert.deepEqual(errors,[]);
  assert.equal(requests.some(url=>/\/api\/(state|events|settings)/.test(url)),false,'Public site contacted private runtime');
  console.log(JSON.stringify({passed:true,pagesAndViewports:checked,interactiveFlows:7,consoleErrors:errors.length,privateApiRequests:0,screenshots:'.git/website-checks'},null,2));
}finally{await browser.close();await new Promise(r=>server.close(r));}
