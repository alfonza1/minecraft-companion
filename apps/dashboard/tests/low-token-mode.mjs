import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { createApp } from '../../../services/api/index.js';
import { registerBuildRoutes } from '../../../services/build-planner/index.js';
import { Store } from '../../../services/memory/store.js';

const directory = await mkdtemp(join(tmpdir(), 'companion-low-token-ui-'));
const store = new Store(directory);
store.updateSettings({ realmId: 42 });
const before = store.settings();
const app = await createApp({ store, skipExtensions: true });
registerBuildRoutes(app, app.companion);
await app.companion.runtime.control('plan');
await app.listen({ host: '127.0.0.1', port: 0 });
const browser = await chromium.launch({ headless: true });
const output = join(process.cwd(), '.git/verification/low-token-mode');
const evidence = { at: new Date().toISOString(), passed: false, errors: [], scope: 'Real isolated API/SQLite, live WebSocket and built headless dashboard. Offline planning only; zero model turns, no Realm connection or microphone capture. Explicit HTTP failure fixture tests save-error recovery.' };
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, reducedMotion: 'reduce' });
  page.on('pageerror', error => evidence.errors.push(error.message));
  await page.goto(`http://127.0.0.1:${app.server.address().port}`);
  const navigate = name => page.getByRole('navigation').getByRole('button', { name, exact: true }).click();
  const toggle = () => page.getByRole('checkbox', { name: 'Low token mode', exact: true });
  await navigate('Settings'); await toggle().waitFor();
  assert.equal(await toggle().isChecked(), false);
  await page.route('**/api/settings', route => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Temporary settings save failure' }) }), { times: 1 });
  await toggle().click();
  await page.locator('.low-token-setting [role="alert"]').filter({ hasText: 'Temporary settings save failure' }).waitFor();
  assert.equal(store.settings().lowTokenMode, false); assert.equal(await toggle().isChecked(), false);
  await toggle().click();
  await page.waitForFunction(() => document.querySelector('input[aria-label="Low token mode"]')?.checked && !document.querySelector('input[aria-label="Low token mode"]')?.disabled);
  assert.equal(store.settings().lowTokenMode, true);
  const panel = page.locator('.low-token-setting');
  for (const text of ['Live inventory updates use zero model tokens', 'Disables new AI blueprint generation', '4 previous messages', '5 relevant saved notes', 'Omits optional coding-skill instructions', 'no Codex request', 'Applies to the next AI request']) assert.ok((await panel.innerText()).includes(text), text);
  assert.equal(store.settings().model, before.model); assert.deepEqual(store.settings().voice, before.voice);
  await page.reload(); await navigate('Settings'); await toggle().waitFor(); assert.equal(await toggle().isChecked(), true);
  await mkdir(output, { recursive: true });
  await panel.screenshot({ path: join(output, 'setting.png') });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1100 });
    await page.screenshot({ path: join(output, `settings-${width}.png`), fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Horizontal overflow at ${width}px`);
  }
  await page.setViewportSize({ width: 1440, height: 1100 });
  const created = await page.request.post(new URL('/api/projects', page.url()).href, { data: { name: 'Low token test hut', version: '1.21.5' } });
  assert.equal(created.status(), 200);
  await navigate('Build studio');
  await page.getByRole('textbox', { name: 'YouTube URL or design notes' }).fill('A small cobblestone hut with a simple flat roof.');
  assert.equal(await page.getByRole('button', { name: 'Design blueprint with Codex', exact: true }).isDisabled(), true);
  await page.getByText('Low token mode disables new AI designs.', { exact: false }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Save reference', exact: true }).isEnabled(), true);
  await page.screenshot({ path: join(output, 'studio-disabled.png'), fullPage: true });
  await navigate('Settings'); await toggle().click();
  await page.waitForFunction(() => !document.querySelector('input[aria-label="Low token mode"]')?.checked && !document.querySelector('input[aria-label="Low token mode"]')?.disabled);
  assert.equal(store.settings().lowTokenMode, false);
  await navigate('Build studio');
  await page.getByRole('textbox', { name: 'YouTube URL or design notes' }).fill('A small cobblestone hut with a simple flat roof.');
  assert.equal(await page.getByRole('button', { name: 'Design blueprint with Codex', exact: true }).isEnabled(), true);
  assert.equal(app.companion.snapshot().usage.requests, 0); assert.deepEqual(evidence.errors, []);
  evidence.passed = true;
} finally {
  await mkdir(output, { recursive: true }); await writeFile(join(output, 'results.json'), JSON.stringify(evidence, null, 2));
  await browser.close(); await app.close(); await rm(directory, { recursive: true, force: true });
}
console.log(JSON.stringify(evidence));
