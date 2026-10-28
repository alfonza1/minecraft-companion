import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { createApp } from '../../../services/api/index.js';
import { Store } from '../../../services/memory/store.js';

const directory = await mkdtemp(join(tmpdir(), 'companion-desktop-ui-'));
const app = await createApp({ store: new Store(directory), skipExtensions: true });
const requests = [];
// Conversation provider and native bridge are explicit UI fixtures. The real
// Windows shell/update behavior is tested separately by test-desktop.mjs.
await app.listen({ host: '127.0.0.1', port: 0 });
const base = `http://127.0.0.1:${app.server.address().port}`;
const evidence = join(process.cwd(), '.git/verification/desktop-ui'); await mkdir(evidence, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/conversation', async route => { requests.push(route.request().postDataJSON().text); await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ text: 'Fixture provider received the request.' }) }); });
  await page.addInitScript(() => {
    const listeners = new Set(); window.__COMPANION_DESKTOP__ = { updatesPending: true }; window.fixtureCommands = [];
    window.chrome ??= {}; window.chrome.webview = {
      postMessage: command => window.fixtureCommands.push(command),
      addEventListener: (_name, callback) => listeners.add(callback),
      removeEventListener: (_name, callback) => listeners.delete(callback),
    };
    window.fixtureReply = data => listeners.forEach(callback => callback({ data }));
  });
  await page.goto(base);
  await page.getByText('Local changes ready. Stop the companion, then apply updates.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Apply local updates', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: 'Apply local updates', exact: true }).isDisabled(), true);
  assert.deepEqual(await page.evaluate(() => window.fixtureCommands), ['check-updates']);
  await page.evaluate(() => window.fixtureReply({ type: 'desktop-update', status: 'error', message: 'Fixture updater unavailable.' }));
  await page.getByText('Fixture updater unavailable.', { exact: true }).waitFor();
  await page.evaluate(() => window.fixtureReply({ type: 'desktop-update', status: 'current' }));
  await page.getByText('Linked to your local working copy', { exact: true }).waitFor();
  assert.equal(await page.getByRole('textbox', { name: 'What are we doing next?' }).isDisabled(), true);
  await app.companion.runtime.control('plan');
  await page.getByRole('textbox', { name: 'What are we doing next?' }).fill('Follow me');
  await page.getByRole('button', { name: 'Send companion request', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#overview-request').value === '');
  assert.deepEqual(requests, ['Follow me']);
  await app.companion.runtime.control('pause');
  await page.waitForFunction(() => document.querySelector('#overview-request').disabled);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.equal(await page.locator('body').evaluate(element => element.scrollWidth > innerWidth), false);
    await page.screenshot({ path: join(evidence, `overview-${width}.png`), fullPage: true });
  }
  assert.deepEqual(errors, []);
  await writeFile(join(evidence, 'results.json'), JSON.stringify({ passed: true, at: new Date().toISOString(), errors, scope: 'Real isolated API/SQLite and runtime controls; explicit fixture conversation provider and native bridge. Update current/pending/error and overview request/pause states, desktop/mobile screenshots.' }, null, 2));
  console.log('Desktop UI current/pending/error states, request submission, paused gating and desktop/mobile layouts passed.');
} finally { await browser.close(); await app.close(); }
