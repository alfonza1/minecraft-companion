import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir } from 'node:fs/promises';
import { createDesignFixture } from '../../scripts/design-fixtures.mjs';

test.use({ launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] } });
let fixture;
test.beforeEach(async () => { fixture = await createDesignFixture({scenario:'gathering'}); });
test.afterEach(async () => { await fixture.close(); });

test('native push-to-talk indicator follows live capture and clears on pause or disconnect', async ({page}, info) => {
  fixture.store.updateSettings({voice:{pushToTalk:{key:'Mouse5',modifiers:[]}}});
  const phase = value => fixture.setVoiceStatus({available:true, desktop:{running:true,phase:value}});
  phase('ready');
  await page.goto(fixture.base);
  const indicator = page.locator('.ptt-indicator');
  await expect(indicator).toHaveAttribute('data-listening','false');
  for(const value of ['listening','transcribing','thinking','speaking','ready','listening']) {
    phase(value);
    await expect(indicator).toHaveAttribute('data-listening',String(value==='listening'));
  }
  await expect(indicator).toHaveAttribute('title',/Mouse 5 held/);
  await expect(indicator).toHaveCSS('background-color','rgb(0, 103, 192)');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const pause = await page.getByRole('button',{name:'Pause',exact:true}).boundingBox();
  const mic = await indicator.boundingBox();
  expect(mic.x).toBeGreaterThanOrEqual(pause.x+pause.width);
  expect((await indicator.locator('svg').boundingBox()).width).toBe(16);
  const accessibility = await new AxeBuilder({page}).include('.runtime-controls').analyze();
  expect(accessibility.violations.filter(v=>['serious','critical'].includes(v.impact))).toEqual([]);
  await mkdir('.git/ptt-indicator',{recursive:true});
  await page.screenshot({path:`.git/ptt-indicator/${info.project.name}-listening.png`,fullPage:true});
  if(info.project.name==='mobile-390') {
    await page.setViewportSize({width:360,height:844});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
  fixture.runtime.state='PAUSED'; fixture.runtime.emit('change');
  await expect(indicator).toHaveAttribute('data-listening','false');
  fixture.runtime.state='ACTIVE'; fixture.runtime.emit('change');
  await expect(indicator).toHaveAttribute('data-listening','true');
  phase('error');
  await expect(indicator).toHaveClass(/needs-attention/);
  await indicator.click();
  await expect(page.getByRole('heading',{name:'Communication',exact:true})).toBeVisible();
  await expect(page.locator('.play-voice')).toHaveAttribute('open','');
  phase('listening');
  await expect(indicator).toHaveAttribute('data-listening','true');
  for(const socket of fixture.app.websocketServer.clients) socket.close();
  await expect(indicator).toHaveAttribute('data-listening','false');
  await expect(indicator).toHaveAttribute('title',/reconnecting/);
});

test('browser microphone indicator follows actual synthetic capture and release', async ({page}) => {
  fixture.setVoiceStatus({available:true,status:'ready',desktop:{running:false,phase:'off'}});
  fixture.store.updateSettings({voice:{pushToTalk:{key:'F8',modifiers:[]}}});
  let transcriptions=0;
  await page.route('**/api/voice/transcribe',async route=>{transcriptions++;await route.fulfill({json:{text:''}});});
  await page.goto(fixture.base);
  const indicator=page.locator('.ptt-indicator');
  await indicator.click();
  await page.getByRole('button',{name:'Enable voice',exact:true}).click();
  await page.getByRole('button',{name:'Hold to talk',exact:true}).waitFor();
  await page.keyboard.down('F8');
  await expect(indicator).toHaveAttribute('data-listening','true');
  await page.waitForTimeout(320);
  await page.keyboard.up('F8');
  await expect(indicator).toHaveAttribute('data-listening','false');
  await expect.poll(()=>transcriptions).toBe(1);
  await page.keyboard.down('F9');
  await expect(indicator).toHaveAttribute('data-listening','false');
  await page.keyboard.up('F9');
  await page.keyboard.down('F8');
  await expect(indicator).toHaveAttribute('data-listening','true');
  await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
  await expect(indicator).toHaveAttribute('data-listening','false');
  await page.keyboard.up('F8');
  await page.getByRole('button',{name:'Disable microphone',exact:true}).click();
  await expect(indicator).toHaveAttribute('title',/Microphone off/);
  fixture.store.updateSettings({voice:{pushToTalk:{key:'Mouse5',modifiers:[]}}});
  fixture.runtime.emit('change');
  await page.getByRole('button',{name:'Enable voice',exact:true}).click();
  await page.getByRole('button',{name:'Hold to talk',exact:true}).waitFor();
  await page.evaluate(()=>window.dispatchEvent(new PointerEvent('pointerdown',{button:4})));
  await expect(indicator).toHaveAttribute('data-listening','true');
  await page.evaluate(()=>window.dispatchEvent(new PointerEvent('pointerup',{button:4})));
  await expect(indicator).toHaveAttribute('data-listening','false');
  fixture.runtime.state='PAUSED'; fixture.runtime.emit('change');
  await expect(indicator).toHaveAttribute('title',/start or resume/);
  expect(fixture.app.companion.snapshot().usage.requests).toBe(0);
});
