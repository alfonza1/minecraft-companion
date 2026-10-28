import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { createApp } from '../../../services/api/index.js';
import { Store } from '../../../services/memory/store.js';
import { createModelCatalog } from '../../../services/agent-orchestrator/models.js';

const directory = await mkdtemp(join(tmpdir(), 'companion-codex-ui-')), store = new Store(directory);
const actualCatalog = createModelCatalog(); let unavailable = false;
const modelCatalog = createModelCatalog({ discover: async () => { if (unavailable) throw new Error('Model catalog is temporarily unavailable. Refresh to retry.'); return actualCatalog.get(); } });
const app = await createApp({ store, skipExtensions: true, modelCatalog }); await app.listen({ host: '127.0.0.1', port: 0 });
const browser = await chromium.launch({ headless: true }), output = join(process.cwd(), '.git/verification/codex-models');
const evidence = { at: new Date().toISOString(), passed: false, errors: [], scope: 'Actual installed Codex app-server metadata, isolated API/SQLite and headless UI. Zero model turns, no mic or Minecraft connection. Catalog-error state uses an explicit discovery failure fixture.' };
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, reducedMotion: 'reduce' }); page.on('pageerror', error => evidence.errors.push(error.message));
  await page.goto(`http://127.0.0.1:${app.server.address().port}`);
  const settings = () => page.getByRole('navigation').getByRole('button', { name: 'Settings', exact: true }).click();
  await settings(); const selector = page.getByRole('combobox', { name: 'Companion model', exact: true });
  await selector.waitFor(); await page.waitForFunction(() => document.querySelector('select[aria-label="Companion model"]')?.options.length > 2);
  const catalog = await actualCatalog.get(); assert.ok(catalog.models.length >= 2); assert.ok(catalog.defaultModel);
  await page.locator('.model-current code').filter({ hasText: catalog.defaultModel }).waitFor();
  const alternative = catalog.models.find(model => model.id !== catalog.defaultModel);
  await selector.selectOption(alternative.id);
  await page.waitForFunction(id => document.querySelector('.model-current code')?.textContent === id, alternative.id);
  assert.equal(store.settings().model, alternative.id);
  await page.reload(); await settings();
  await page.waitForFunction(id => document.querySelector('select[aria-label="Companion model"]')?.value === id && !document.querySelector('select[aria-label="Companion model"]')?.disabled, alternative.id);
  const account = page.getByRole('heading', { name: 'Minecraft account', exact: true }).locator('xpath=ancestor::section[1]'), codex = page.getByRole('heading', { name: 'AI models & reasoning', exact: true }).locator('xpath=ancestor::section[1]');
  const first = await account.boundingBox(), second = await codex.boundingBox();
  assert.ok(Math.abs(first.x - second.x) < 2); assert.ok(second.y - first.y - first.height >= 0 && second.y - first.y - first.height < 36, 'Codex must directly follow account settings without audio-panel whitespace.');
  unavailable = true; await page.getByRole('button', { name: 'Refresh models', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Model catalog is temporarily unavailable' }).waitFor();
  assert.equal(store.settings().model, alternative.id);
  unavailable = false; await page.getByRole('button', { name: 'Refresh models', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('select[aria-label="Companion model"]')?.options.length > 2);
  await page.getByRole('combobox', { name: 'Companion model', exact: true }).selectOption('');
  await page.waitForFunction(id => document.querySelector('.model-current code')?.textContent === id, catalog.defaultModel);
  assert.equal(store.settings().model, ''); assert.equal(app.companion.snapshot().usage.requests, 0);
  await mkdir(output, { recursive: true });
  await codex.screenshot({ path: join(output, 'model-selector.png') });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1100 }); await page.screenshot({ path: join(output, `settings-${width}.png`), fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Horizontal overflow at ${width}px`);
  }
  assert.deepEqual(evidence.errors, []); evidence.models = catalog.models.map(model => model.id); evidence.defaultModel = catalog.defaultModel; evidence.passed = true;
} finally {
  await mkdir(output, { recursive: true }); await writeFile(join(output, 'results.json'), JSON.stringify(evidence, null, 2));
  await browser.close(); await app.close(); await actualCatalog.close(); await rm(directory, { recursive: true, force: true });
}
console.log(JSON.stringify(evidence));
