import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { createApp } from '../../../services/api/index.js';
import { Store } from '../../../services/memory/store.js';

// Actual Microsoft device prompt and account worker, isolated cache/store.
// Browser launching is captured to avoid opening visible windows during tests.
if (!process.argv.includes('--microsoft-device-flow')) throw new Error('Use --microsoft-device-flow to request an actual Microsoft device prompt.');
const directory = await mkdtemp(join(tmpdir(), 'companion-private-ui-'));
const authRoot = join(directory, 'auth'); await mkdir(authRoot);
await writeFile(join(authRoot, 'live.dpapi'), 'preserved-encrypted-cache-fixture');
const launches = [], errors = [];
const app = await createApp({ store: new Store(directory), privateBrowser: {
  status: () => ({ available: true, name: 'Fixture InPrivate launcher' }),
  open: async target => { launches.push(target); return { opened: true, browser: 'Fixture InPrivate launcher' }; },
} });
let browser;
try {
  await app.listen({ host: '127.0.0.1', port: 0 });
  const base = `http://127.0.0.1:${app.server.address().port}`;
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base);
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Setup', exact: true }).click();
  await page.getByRole('navigation', { name: 'Setup steps' }).getByRole('button', { name: /Minecraft account/ }).click();
  const connect = page.getByRole('button', { name: 'Connect in private window', exact: true });
  await connect.waitFor(); await connect.click();
  await page.getByText(/Opened Fixture InPrivate launcher/).waitFor({ timeout: 30_000 });
  let state = await (await fetch(`${base}/api/state`)).json();
  assert.equal(state.auth.status, 'authenticating'); assert.match(state.auth.device.userCode, /^[A-Za-z0-9-]{4,32}$/);
  assert.deepEqual(launches, ['signin']); assert.equal(state.usage.requests, 0);
  const code = state.auth.device.userCode;
  const pointer = await readFile(join(authRoot, 'selected-session.json'), 'utf8');
  assert.match(JSON.parse(pointer).session, /^[a-f0-9-]{36}$/);
  assert.equal(await readFile(join(authRoot, 'live.dpapi'), 'utf8'), 'preserved-encrypted-cache-fixture');
  await page.getByRole('button', { name: 'Open in private window', exact: true }).click();
  await page.waitForFunction(() => ![...document.querySelectorAll('button')].find(button => button.textContent === 'Open in private window')?.disabled);
  state = await (await fetch(`${base}/api/state`)).json();
  assert.equal(state.auth.device.userCode, code); assert.equal(launches.length, 2);
  assert.equal(await readFile(join(authRoot, 'selected-session.json'), 'utf8'), pointer);
  const evidence = join(process.cwd(), '.git', 'verification', 'private-account'); await mkdir(evidence, { recursive: true });
  for (const [name, width, height] of [['desktop', 1440, 1000], ['mobile', 390, 844]]) {
    await page.setViewportSize({ width, height });
    assert.equal(await page.locator('body').evaluate(element => element.scrollWidth > innerWidth), false);
    await page.screenshot({ path: join(evidence, `${name}.png`), fullPage: true, mask: [page.locator('.code-copy')] });
  }
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Open in private window', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Stop and disconnect', exact: true }).click();
  await page.getByRole('button', { name: 'Connect in private window', exact: true }).waitFor();
  state = await (await fetch(`${base}/api/state`)).json();
  assert.equal(state.auth.device, null); assert.equal(state.state, 'DISCONNECTED'); assert.deepEqual(errors, []);
  const result = { passed: true, at: new Date().toISOString(), scope: 'Real Microsoft device flow and fresh cache. Window launcher captured; no visible private window, password, completed sign-in or Realm connection.', launches, errors, checks: ['Fresh account session selected without deleting original cache', 'Actual device prompt reaches dashboard', 'Private reopen preserves the existing code/session', 'Setup and Settings controls render at desktop/mobile widths', 'Stop cancels pending authentication; no model requests'] };
  await writeFile(join(evidence, 'results.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally { await browser?.close(); await app.close(); await rm(directory, { recursive: true, force: true }); }
