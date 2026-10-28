import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { createApp } from '../../../services/api/index.js';
import { Store } from '../../../services/memory/store.js';

const directory = await mkdtemp(join(tmpdir(), 'companion-teamwork-ui-')), store = new Store(directory);
const app = await createApp({ store, skipExtensions: true });
await app.listen({ host: '127.0.0.1', port: 0 });
const browser = await chromium.launch({ headless: true }), evidence = { at: new Date().toISOString(), passed: false, errors: [], scope: 'Headless UI against isolated actual API/SQLite. Routine preferences and error states use no Minecraft or model. Location save uses an explicitly injected synthetic observation; actual gameplay is tested separately on localhost 26.3.' };
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, reducedMotion: 'reduce' });
  page.on('pageerror', error => evidence.errors.push(error.message));
  await page.goto(`http://127.0.0.1:${app.server.address().port}`);
  await page.getByRole('navigation').getByRole('button', { name: 'Companion', exact: true }).click();
  await page.getByRole('heading', { name: 'Working together' }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Help me', exact: true }).isDisabled(), true);
  assert.equal(await page.getByRole('button', { name: 'Resume saved work', exact: true }).isDisabled(), true);
  await page.getByLabel('Routine supplies', { exact: true }).fill('bread 6\ntorch 24\nstone_pickaxe 1');
  await page.getByRole('button', { name: 'Save routine', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Routine saved.' }).waitFor();
  assert.equal(store.get('routines')[0].supplies.find(value => value.name === 'torch').count, 24);
  await page.getByLabel('Restock before new gathering jobs').click();
  await page.waitForFunction(() => [...document.querySelectorAll('label')].find(label => label.textContent.includes('Restock before new gathering jobs'))?.querySelector('input')?.checked);
  await page.getByLabel('Teammate updates').selectOption('quiet');
  await page.waitForFunction(() => document.querySelector('select[aria-label="Teammate updates"]')?.value === 'quiet');
  await page.reload();
  await page.getByRole('navigation').getByRole('button', { name: 'Companion', exact: true }).click();
  await page.getByLabel('Routine supplies', { exact: true }).waitFor();
  await page.waitForFunction(() => document.querySelector('textarea[aria-label="Routine supplies"]')?.value.includes('torch 24'));
  assert.equal(await page.getByLabel('Restock before new gathering jobs').isChecked(), true);
  assert.equal(await page.getByLabel('Teammate updates').inputValue(), 'quiet');
  await page.getByLabel('Routine supplies', { exact: true }).fill('diamond 64');
  await page.getByRole('button', { name: 'Save routine', exact: true }).click();
  await page.locator('.inline-error[role="alert"]').filter({ hasText: 'Rare resources require an explicit task' }).waitFor();
  assert.equal(store.get('routines')[0].supplies[0].name, 'bread');
  await page.getByLabel('Routine supplies', { exact: true }).fill('bread 6\ntorch 24\nstone_pickaxe 1');
  app.companion.runtime.world = { observedAt: new Date().toISOString(), dimension: 'overworld', position: { x: 12, y: 64, z: -23 }, inventory: [], nearbyPlayers: [], nearbyEntities: [], equipment: {}, health: 20, food: 20 };
  app.companion.runtime.emit('change');
  await page.getByLabel('Location source').selectOption('companion');
  await page.getByLabel('Place name', { exact: true }).fill('Riverside base and the shared project supply depot');
  await page.getByRole('button', { name: 'Save place', exact: true }).click();
  await page.getByText('Riverside base and the shared project supply depot', { exact: true }).waitFor();
  assert.deepEqual(store.get('locations')[0].position, { x: 12, y: 64, z: -23 });
  await page.getByRole('button', { name: 'Delete place Riverside base and the shared project supply depot' }).click();
  await page.getByText('No places saved yet.', { exact: true }).waitFor();
  await page.getByText('Approved supply chests · 0', { exact: true }).click();
  assert.equal(store.get('supplyChests').length, 0);
  const output = join(process.cwd(), '.git/verification/teammate-ui'); await mkdir(output, { recursive: true });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1100 });
    await page.screenshot({ path: join(output, `companion-${width}.png`), fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Overflow at ${width}px`);
  }
  assert.deepEqual(evidence.errors, []); evidence.passed = true;
} finally {
  await mkdir(join(process.cwd(), '.git/verification/teammate-ui'), { recursive: true });
  await writeFile(join(process.cwd(), '.git/verification/teammate-ui/results.json'), JSON.stringify(evidence, null, 2));
  await browser.close(); await app.close(); await rm(directory, { recursive: true, force: true });
}
console.log(JSON.stringify(evidence));
