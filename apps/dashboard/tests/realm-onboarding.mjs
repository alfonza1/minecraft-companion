import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { createApp } from '../../../services/api/index.js';
import { Store } from '../../../services/memory/store.js';
import { RealmConnector } from '../../../services/realm-connector/index.js';
import nativeProtocol from '../../../services/native-26.3/preload.cjs';

// Real API, SQLite and runtime. Realm responses are explicit fixtures; no real
// account, world, microphone or model is used by this UI regression test.
const directory = await mkdtemp(join(tmpdir(), 'companion-realm-ui-'));
const evidence = join(process.cwd(), '.git/verification/realm-onboarding');
await mkdir(evidence, { recursive: true });
const store = new Store(directory);
store.updateSettings({ realmId: 1, playerName: 'FixturePlayer' });
const connector = new RealmConnector(directory);
connector.auth = { status: 'connected', username: 'FixtureBot', device: null };
connector.realms = [{ id: 1, name: 'Fixture Realm', owner: 'FixturePlayer', state: 'OPEN' }];
const calls = [], errors = [];
let available = false, native = false, release;
connector.probeRealm = async id => {
  assert.equal(id, 1); calls.push('check');
  if (release === undefined) await new Promise(resolve => { release = resolve; });
  if (native) return connector.recordCompatibility(id, { version: '26.3', protocol: 777, protocolSource: 'realms-service' });
  connector.compatibility = { realmId: 1, status: available ? 'bridge' : 'unsupported', serverVersion: '26.3', clientVersion: '26.1', checkedAt: new Date().toISOString(), message: available ? 'Fixture translation path available' : 'Fixture unsupported version' };
  connector.emit('change'); return connector.compatibility;
};
connector.createBot = async () => { calls.push('join'); throw new Error('Fixture deliberately prevents a real world connection.'); };
const app = await createApp({ store, connector, skipExtensions: true });
let browser;
try {
  await app.listen({ host: '127.0.0.1', port: 0 });
  const base = `http://127.0.0.1:${app.server.address().port}`;
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Open guided setup', exact: true }).click();
  const steps = page.getByRole('navigation', { name: 'Setup steps' });
  await steps.getByRole('button', { name: /First session/ }).click();
  await page.getByText(/Fixture Realm.*Saved/).waitFor();
  await page.getByText('Not connected yet', { exact: true }).waitFor();
  assert.equal(await page.getByText('Needs attention', { exact: true }).count(), 0);
  assert.deepEqual(calls, []);
  const connect = page.getByRole('button', { name: 'Connect to selected Realm', exact: true });
  assert.equal(await connect.isEnabled(), true);
  await connect.click();
  await page.waitForFunction(() => [...document.querySelectorAll('button')].find(b => b.textContent.includes('Connect to selected Realm'))?.disabled);
  while (!release) await new Promise(resolve => setTimeout(resolve, 20));
  release();
  await page.getByText('Fixture unsupported version', { exact: true }).waitFor();
  assert.deepEqual(calls, ['check']);
  available = true;
  await connect.click();
  await page.getByRole('heading', { name: 'Overview', exact: true }).waitFor();
  assert.deepEqual(calls, ['check', 'check', 'join']);
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Setup', exact: true }).click();
  await page.getByRole('navigation', { name: 'Setup steps' }).getByRole('button', { name: /First session/ }).click();
  await page.getByText('Translation required', { exact: true }).waitFor();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.equal(await page.locator('body').evaluate(element => element.scrollWidth > innerWidth), false);
    await page.screenshot({ path: join(evidence, `${width}.png`), fullPage: true });
  }
  assert.deepEqual(errors, []);
  if (nativeProtocol.installed) {
    native = true;
    await steps.getByRole('button', { name: /Your Realm/ }).click();
    await page.getByRole('button', { name: 'Check Realm compatibility', exact: true }).click();
    await page.getByText('Native protocol supported', { exact: true }).waitFor();
    assert.equal(await page.getByText('Translation required', { exact: true }).count(), 0);
    assert.match(await page.locator('.setup-compatibility').innerText(), /No protocol translation/);
    const versions = await page.locator('.setup-compatibility .data-row strong').allTextContents();
    assert.deepEqual(versions, ['26.3', '26.3']);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.equal(await page.locator('body').evaluate(element => element.scrollWidth > innerWidth), false);
      await page.screenshot({ path: join(evidence, `native-${width}.png`), fullPage: true });
    }
  }
  assert.deepEqual(errors, []);
  assert.equal(app.companion.snapshot().usage.requests, 0);
  await writeFile(join(evidence, 'result.json'), JSON.stringify({ passed: true, at: new Date().toISOString(), calls, errors, scope: 'Fixture Realm, real API/store; verifies automatic preflight and refusal of unsupported connections, not actual Realm gameplay.' }, null, 2));
  console.log('Realm onboarding passed: saved selection, pending world state, automatic preflight, unsupported refusal, successful ordering, desktop/mobile.');
} finally { await browser?.close(); await app.close(); await rm(directory, { recursive: true, force: true }); }
