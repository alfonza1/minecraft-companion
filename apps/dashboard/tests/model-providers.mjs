import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { createApp } from '../../../services/api/index.js';
import { Store } from '../../../services/memory/store.js';

const directory = await mkdtemp(join(tmpdir(), 'companion-provider-ui-')), store = new Store(directory);
store.updateSettings({ realmId: 42 }); store.put('memories', { id: 'base', label: 'Base', value: 'Stored local fixture' });
const app = await createApp({ store, skipExtensions: true }); await app.listen({ host: '127.0.0.1', port: 0 });
const browser = await chromium.launch({ headless: true });
const output = join(process.cwd(), '.git/verification/model-providers');
const evidence = { at: new Date().toISOString(), passed: false, errors: [], scope: 'Real installed Codex, Claude Code SDK and OpenCode v2 metadata, isolated API/SQLite/WebSockets, built headless UI. No login, AI inference, microphone or Realm connection. Discovery-error UI uses an explicit HTTP failure fixture.' };
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, reducedMotion: 'reduce' }); page.on('pageerror', error => evidence.errors.push(error.message));
  await page.goto(`http://127.0.0.1:${app.server.address().port}`);
  const settings = () => page.getByRole('navigation').getByRole('button', { name: 'Settings', exact: true }).click();
  await settings();
  const provider = page.getByRole('combobox', { name: 'Model provider', exact: true }), model = page.getByRole('combobox', { name: 'Companion model', exact: true });
  const loaded = () => page.waitForFunction(() => { const selector = document.querySelector('[aria-label="Companion model"]'); return selector && !selector.disabled && selector.options.length > 2; });
  await loaded(); await model.selectOption('gpt-6-luna');
  await page.waitForFunction(() => document.querySelector('[aria-label="Companion model"]').value === 'gpt-6-luna');
  await provider.selectOption('opencode'); await loaded();
  await page.getByRole('textbox', { name: 'Search models', exact: true }).fill('abliterated-model-large-v2');
  await model.selectOption('abliteration-ai/abliterated-model-large-v2');
  await page.waitForFunction(() => document.querySelector('[aria-label="Companion model"]').value === 'abliteration-ai/abliterated-model-large-v2');
  assert.equal(store.settings().providerModels.opencode, 'abliteration-ai/abliterated-model-large-v2');
  await page.getByText('OpenCode’s stateless endpoint does not report token usage.', { exact: false }).waitFor();
  await mkdir(output, { recursive: true });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1100 }); await page.screenshot({ path: join(output, `opencode-${width}.png`), fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Overflow at ${width}px`);
  }
  await page.reload(); await settings(); await loaded(); assert.equal(await provider.inputValue(), 'opencode'); assert.equal(await model.inputValue(), 'abliteration-ai/abliterated-model-large-v2');
  await provider.selectOption('claude'); await loaded(); await model.selectOption('sonnet');
  await page.waitForFunction(() => document.querySelector('[aria-label="Companion model"]').value === 'sonnet');
  await page.getByRole('button', { name: 'Sign in to Claude Code', exact: true }).waitFor();
  await page.screenshot({ path: join(output, 'claude-status.png'), fullPage: true });
  await provider.selectOption('codex'); await loaded(); assert.equal(await model.inputValue(), 'gpt-6-luna');
  await provider.selectOption('opencode'); await loaded(); assert.equal(await model.inputValue(), 'abliteration-ai/abliterated-model-large-v2');
  await page.route('**/api/ai/opencode/models/refresh', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Fixture discovery unavailable' }) }), { times: 1 });
  await page.getByRole('button', { name: 'Refresh models', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Fixture discovery unavailable' }).waitFor();
  assert.equal(store.settings().providerModels.opencode, 'abliteration-ai/abliterated-model-large-v2');
  await page.getByRole('button', { name: 'Refresh models', exact: true }).click(); await loaded();
  assert.equal(store.get('memories')[0].value, 'Stored local fixture'); assert.equal(app.companion.snapshot().usage.requests, 0);
  assert.deepEqual(evidence.errors, []); evidence.passed = true;
} finally {
  await mkdir(output, { recursive: true }); await writeFile(join(output, 'browser.json'), JSON.stringify(evidence, null, 2));
  await browser.close(); await app.close(); await rm(directory, { recursive: true, force: true });
}
console.log(JSON.stringify(evidence));
