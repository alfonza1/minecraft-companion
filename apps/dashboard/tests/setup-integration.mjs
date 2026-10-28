import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { createApp } from '../../../services/api/index.js';
import { Store } from '../../../services/memory/store.js';

// Real local API/store. No Microsoft sign-in, model request, microphone grant,
// Realm connection or user data is used by this onboarding navigation check.
const directory = await mkdtemp(join(tmpdir(), 'companion-setup-'));
const evidence = join(process.cwd(), '.git', 'verification', 'setup');
await mkdir(evidence, { recursive: true });
const app = await createApp({ store: new Store(directory) });
await app.listen({ host: '127.0.0.1', port: 0 });
const base = `http://127.0.0.1:${app.server.address().port}`;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
const errors = [], mutations = [], checks = [];
await page.addInitScript(() => {
  window.__setupMicRequests = 0;
  // Permission-denial fixture; never opens this PC's physical microphone.
  navigator.mediaDevices.getUserMedia = async () => { window.__setupMicRequests++; throw new DOMException('Microphone permission denied by setup test', 'NotAllowedError'); };
});
page.on('pageerror', error => errors.push(error.message));
page.on('request', request => { if (request.method() === 'POST') mutations.push(new URL(request.url()).pathname); });
try {
  await page.goto(base);
  await page.getByRole('heading', { name: 'Overview', exact: true }).waitFor();
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Setup', exact: true }).click();
  await page.getByRole('heading', { name: 'Setup', exact: true, level: 1 }).waitFor();
  await page.getByRole('heading', { name: 'Check your local services', exact: true }).waitFor();
  await page.getByText(/Showing existing service status|Status checked/).waitFor();
  assert.equal(await page.evaluate(() => window.__setupMicRequests), 0);
  assert.equal(mutations.some(path => /\/auth\/|\/conversation$|\/control$|\/voice\/(?:desktop|transcribe|speak)$|\/realms\/check$/.test(path)), false);
  checks.push('Overview opens a real five-step setup page. Mounting performs no sign-in, model, Realm, microphone or gameplay action.');
  await page.getByRole('button', { name: 'Check local services', exact: true }).click();
  await page.getByRole('button', { name: 'Check local services', exact: true }).waitFor();
  assert.equal(mutations.includes('/api/setup/check'), true);
  assert.equal((await (await fetch(`${base}/api/state`)).json()).usage.requests, 0);
  for (const [step, heading] of [
    ['Minecraft account', 'Give your teammate its own account'],
    ['Your Realm', "Choose where you'll play"],
    ['Voice check', 'Make sure you can hear each other'],
    ['First session', 'Start with a small first session'],
  ]) {
    await page.getByRole('navigation', { name: 'Setup steps' }).getByRole('button', { name: new RegExp(step) }).click();
    await page.getByRole('heading', { name: heading, exact: true }).waitFor();
    assert.equal(await page.locator('body').evaluate(element => element.scrollWidth > innerWidth), false);
    await page.screenshot({ path: join(evidence, `${step.replaceAll(' ', '-').toLowerCase()}-desktop.png`), fullPage: true });
  }
  assert.equal(await page.getByRole('button', { name: 'Connect to selected Realm', exact: true }).isDisabled(), true);
  checks.push('Account, Realm and voice steps render genuine disconnected/unverified states. Realm join remains disabled without account and protocol checks.');
  await page.getByRole('button', { name: 'Start planning offline', exact: true }).click();
  await page.getByRole('heading', { name: 'Companion', exact: true, level: 1 }).waitFor();
  let state = await (await fetch(`${base}/api/state`)).json();
  assert.equal(state.planning, true); assert.equal(state.state, 'ACTIVE'); assert.equal(state.world, null); assert.equal(state.usage.requests, 0);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  state = await (await fetch(`${base}/api/state`)).json(); assert.equal(state.state, 'PAUSED');
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Setup', exact: true }).click();
  await page.getByRole('navigation', { name: 'Setup steps' }).getByRole('button', { name: /Voice check/ }).click();
  assert.equal(await page.getByRole('button', { name: 'Start local audio checks', exact: true }).isDisabled(), true);
  await page.getByRole('button', { name: 'Stop and disconnect', exact: true }).click();
  checks.push('Offline planning starts through the real control API with zero requests. Pause disables setup audio and Stop disconnects.');
  if ((await (await fetch(`${base}/api/state`)).json()).voice.available) {
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent.includes('Start local audio checks') && !button.disabled));
    await page.getByRole('button', { name: 'Start local audio checks', exact: true }).click();
    await page.getByText('Microphone permission denied by setup test', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.__setupMicRequests), 1);
    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Overview', exact: true }).click();
    await page.getByRole('button', { name: 'Resume companion', exact: true }).waitFor();
    assert.equal((await (await fetch(`${base}/api/state`)).json()).state, 'PAUSED');
    await page.getByRole('button', { name: 'Stop and disconnect', exact: true }).click();
    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Setup', exact: true }).click();
    checks.push('An explicit audio check alone requests microphone permission. A denial fixture captures no audio; leaving pauses the wizard-owned offline session.');
  }
  await page.setViewportSize({ width: 390, height: 844 });
  for (const step of ['Local services', 'Minecraft account', 'Your Realm', 'Voice check', 'First session']) {
    await page.getByRole('navigation', { name: 'Setup steps' }).getByRole('button', { name: new RegExp(step) }).click();
    assert.equal(await page.locator('body').evaluate(element => element.scrollWidth > innerWidth), false, `${step} mobile overflow`);
    await page.screenshot({ path: join(evidence, `${step.replaceAll(' ', '-').toLowerCase()}-mobile.png`), fullPage: true });
  }
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Setup', exact: true }).click();
  await page.getByRole('heading', { name: 'Setup', exact: true, level: 1 }).waitFor();
  assert.deepEqual(errors, []);
  state = await (await fetch(`${base}/api/state`)).json();
  assert.equal(state.state, 'DISCONNECTED'); assert.equal(state.usage.requests, 0); assert.equal(state.world, null);
  checks.push('All five steps fit 1440px and 390px without page errors or horizontal overflow. Settings reopens setup. No physical audio or Microsoft login is claimed.');
  await writeFile(join(evidence, 'results.json'), JSON.stringify({ at: new Date().toISOString(), checks, errors }, null, 2));
  console.log(checks.join('\n'));
} finally { await browser.close(); await app.close(); await rm(directory, { recursive: true, force: true }); }
