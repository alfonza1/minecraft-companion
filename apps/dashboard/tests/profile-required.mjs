import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { createApp } from '../../../services/api/index.js';
import { Store } from '../../../services/memory/store.js';
import { requireJavaProfile, accountFailure } from '../../../services/realm-connector/java-profile.js';

// Explicit error fixture: no Microsoft requests, credentials or user cache.
let failure;
try { await requireJavaProfile({ token: 'fixture' }, async () => ({ status: 404, ok: false })); }
catch (error) { failure = accountFailure(error); }
const directory = await mkdtemp(join(tmpdir(), 'companion-profile-ui-'));
const connector = Object.assign(new EventEmitter(), {
  auth: { status: 'profile-required', username: null, device: null, issue: failure.code, error: failure.error },
  realms: [], close: async () => {}, cancelAuth: async () => {},
  connectAccount: () => assert.fail('Rendering profile setup must not initiate Microsoft sign-in.'),
});
const app = await createApp({ store: new Store(directory), connector });
let browser;
try {
  await app.listen({ host: '127.0.0.1', port: 0 });
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${app.server.address().port}`);
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Setup', exact: true }).click();
  await page.getByRole('navigation', { name: 'Setup steps' }).getByRole('button', { name: /Minecraft account/ }).click();
  await page.locator('.inline-error[role="alert"]').filter({ hasText: /Minecraft reports no Java Edition profile/ }).waitFor();
  assert.equal(await page.getByRole('link', { name: 'Open Minecraft account setup' }).getAttribute('href'), 'https://www.minecraft.net/en-us/msaprofile/mygames');
  assert.equal(await page.getByRole('button', { name: 'Check Java profile again', exact: true }).isEnabled(), true);
  const evidence = join(process.cwd(), '.git', 'verification', 'account'); await mkdir(evidence, { recursive: true });
  for (const [name, width, height] of [['desktop', 1440, 1000], ['mobile', 390, 844]]) {
    await page.setViewportSize({ width, height });
    assert.equal(await page.locator('body').evaluate(element => element.scrollWidth > innerWidth), false);
    await page.screenshot({ path: join(evidence, `profile-required-${name}.png`), fullPage: true });
  }
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Settings', exact: true }).click();
  await page.locator('.inline-error[role="alert"]').filter({ hasText: /Minecraft reports no Java Edition profile/ }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Check Java profile again', exact: true }).isEnabled(), true);
  assert.deepEqual(errors, []);
  await writeFile(join(evidence, 'profile-required-results.json'), JSON.stringify({ passed: true, at: new Date().toISOString(), scope: 'Explicit 404 UI fixture, real isolated API/store. No account sign-in, external request or profile change.', errors }, null, 2));
  console.log('Profile-required setup and Settings states passed at desktop/mobile widths; no account actions performed.');
} finally { await browser?.close(); await app.close(); await rm(directory, { recursive: true, force: true }); }
