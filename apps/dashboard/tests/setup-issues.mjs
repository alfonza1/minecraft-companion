import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { Store } from '../../../services/memory/store.js';
import { createApp } from '../../../services/api/index.js';

const directory = await mkdtemp(join(tmpdir(), 'companion-setup-banner-')), store = new Store(directory);
store.updateSettings({ realmId: 42 });
const app = await createApp({ store, skipExtensions: true }); await app.listen({ host: '127.0.0.1', port: 0 });
const browser = await chromium.launch({ headless: true }), output = join(process.cwd(), '.git/verification/setup-issues');
const evidence = { at: new Date().toISOString(), passed: false, errors: [], scope: 'Actual isolated API/SQLite/live WebSocket UI. Realm configuration is a fixture; confirmed auth failures are injected into the isolated connector. No login, Minecraft, mic or model request.' };
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, reducedMotion: 'reduce' }); page.on('pageerror', error => evidence.errors.push(error.message));
  await page.goto(`http://127.0.0.1:${app.server.address().port}`);
  await page.getByRole('heading', { name: 'Overview', exact: true }).waitFor();
  const banner = page.getByRole('alert', { name: 'Setup needs attention' });
  assert.equal(await banner.count(), 0);
  assert.equal(await page.getByText('Get ready for your first session', { exact: true }).count(), 0);
  app.companion.connector.auth = { status: 'authenticating', username: 'CachedFixture', device: null }; app.companion.connector.emit('change');
  await page.getByRole('heading', { name: 'CachedFixture', exact: true }).waitFor();
  assert.equal(await banner.count(), 0);
  app.companion.connector.auth = { status: 'expired', username: 'FixtureBot', error: 'Your Minecraft session expired. Reconnect the bot account to continue.' }; app.companion.connector.emit('change');
  await page.getByRole('heading', { name: 'Minecraft sign-in needs attention', exact: true }).waitFor();
  await mkdir(output, { recursive: true });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1100 }); await banner.screenshot({ path: join(output, `issue-${width}.png`) });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  }
  await banner.getByRole('button', { name: 'Review issue', exact: true }).click();
  await page.getByRole('navigation', { name: 'Setup steps' }).waitFor();
  app.companion.connector.auth = { status: 'connected', username: 'FixtureBot', device: null }; app.companion.connector.emit('change');
  await page.getByRole('navigation').first().getByRole('button', { name: 'Overview', exact: true }).click();
  await page.getByRole('heading', { name: 'Overview', exact: true }).waitFor(); await banner.waitFor({ state: 'hidden' });
  await page.setViewportSize({ width: 1440, height: 1100 }); await page.screenshot({ path: join(output, 'configured-offline.png'), fullPage: true });
  await page.getByRole('navigation').getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('heading', { name: 'Minecraft account', exact: true }).waitFor();
  assert.equal(await banner.count(), 0); assert.equal(await page.getByText('Setting up your companion?', { exact: true }).count(), 0);
  await app.companion.runtime.control('plan'); await app.companion.runtime.control('pause');
  await banner.waitFor({ state: 'hidden' }); assert.equal(app.companion.snapshot().usage.requests, 0);
  assert.deepEqual(evidence.errors, []); evidence.passed = true;
} finally {
  await mkdir(output, { recursive: true }); await writeFile(join(output, 'results.json'), JSON.stringify(evidence, null, 2));
  await browser.close(); await app.close(); await rm(directory, { recursive: true, force: true });
}
console.log(JSON.stringify(evidence));
