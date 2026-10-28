import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { createApp } from '../../../services/api/index.js';
import { Store } from '../../../services/memory/store.js';

// Explicit opt-in network check. Requests an actual Microsoft device prompt,
// but never submits credentials, completes login or touches the user's cache.
if (!process.argv.includes('--microsoft-device-flow')) throw new Error('Use --microsoft-device-flow to request a real Microsoft device prompt.');
const directory = await mkdtemp(join(tmpdir(), 'companion-account-ui-'));
const app = await createApp({ store: new Store(directory) });
let browser;
const checks = [], errors = [];
try {
  await app.listen({ host: '127.0.0.1', port: 0 });
  const base = `http://127.0.0.1:${app.server.address().port}`;
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base);
  // This live app keeps background requests open. Wait for rendered readiness
  // instead of a global network-idle condition unrelated to account setup.
  await page.getByRole('heading', { name: 'Overview', exact: true }).waitFor();
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Setup', exact: true }).click();
  await page.getByRole('navigation', { name: 'Setup steps' }).getByRole('button', { name: /Minecraft account/ }).click();
  await page.getByRole('button', { name: 'Connect Minecraft account', exact: true }).click();
  const signIn = page.getByRole('link', { name: 'Open Microsoft sign-in' });
  await signIn.waitFor({ timeout: 30_000 });
  assert.equal(await signIn.getAttribute('href'), 'https://www.microsoft.com/link');
  const state = await (await fetch(`${base}/api/state`)).json();
  assert.equal(state.auth.status, 'authenticating');
  assert.match(state.auth.device.userCode, /^[A-Za-z0-9-]{4,32}$/);
  assert.equal(state.usage.requests, 0); assert.equal(state.world, null);
  assert.equal(state.auth.username, null); assert.equal(state.logs.some(log => log.level === 'error'), false);
  assert.deepEqual(errors, []);
  checks.push('Actual Connect button -> API -> account worker -> Microsoft device prompt -> live dashboard.');
  checks.push('No login completed, Minecraft connection, model requests, browser page errors or account tokens exposed.');
  const evidence = join(process.cwd(), '.git', 'verification', 'account'); await mkdir(evidence, { recursive: true });
  await page.screenshot({ path: join(evidence, 'device-prompt.png'), fullPage: true, mask: [page.locator('.code-copy')] });
  await writeFile(join(evidence, 'results.json'), JSON.stringify({ at: new Date().toISOString(), checks, errors, scope: 'Real Microsoft device prompt only; account authentication and Realm access remain unverified.' }, null, 2));
  console.log(checks.join('\n'));
} finally {
  await browser?.close(); await app.close(); await rm(directory, { recursive: true, force: true });
}
