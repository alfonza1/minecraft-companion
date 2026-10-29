import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { Store } from '../../../services/memory/store.js';
import { createApp } from '../../../services/api/index.js';
import { reviseProject, approveProject } from '../../../services/build-planner/index.js';

const directory = await mkdtemp(join(tmpdir(), 'companion-building-ui-'));
const store = new Store(directory), output = '.git/verification/building-ui';
let project = approveProject(reviseProject({ id: '11111111-1111-4111-8111-111111111111', name: 'Detailed building fixture', version: '26.3', revision: 0, references: [], aiPercent: 50 }, {
  version: '26.3', dimensions: { x: 3, y: 2, z: 2 }, provenance: 'reconstructed', blocks: [
    { x: 0, y: 0, z: 0, name: 'oak_stairs', properties: { facing: 'east', half: 'bottom' } },
    { x: 1, y: 0, z: 0, name: 'oak_slab', properties: { type: 'double' } },
    ...['lower', 'upper'].map((half, y) => ({ x: 2, y, z: 0, name: 'oak_door', properties: { half, facing: 'north', hinge: 'left' } })),
  ],
}));
// Exercise the startup refresh of previously saved compatibility metadata.
store.put('projects', { ...project, compatibility: { supported: false, unsupported: ['oak_stairs', 'oak_slab', 'oak_door'], limitation: 'Old full-cube gate' } });
const app = await createApp({ store });
await app.listen({ host: '127.0.0.1', port: 0 });
const browser = await chromium.launch({ headless: true });
const evidence = { passed: false, errors: [], scope: 'Headless browser with real API/SQLite, fixture blueprint, no model requests or Realm connection.' };
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', error => evidence.errors.push(error.message));
  await page.goto(`http://127.0.0.1:${app.server.address().port}`);
  await page.getByRole('navigation').getByRole('button', { name: 'Build studio', exact: true }).click();
  await page.getByRole('heading', { name: 'Ready to build?', exact: true }).waitFor();
  await page.getByText('Supports inert cubes, dry stairs/slabs', { exact: false }).waitFor();
  assert.equal(await page.getByText('Placement adapters needed:', { exact: false }).count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Start construction', exact: true }).isDisabled(), true, 'Offline companion cannot build');
  assert.equal(store.get('projects')[0].approvedHash, project.approvedHash);
  assert.equal(store.get('projects')[0].compatibility.supported, true);
  const quantity = name => page.getByRole('row').filter({ hasText: name }).locator('td').nth(1).innerText();
  assert.equal(await quantity('Oak Door'), '1'); assert.equal(await quantity('Oak Slab'), '2');
  await page.getByRole('button', { name: 'Placed blocks', exact: true }).click();
  assert.equal(await quantity('Oak Door'), '2'); assert.equal(await quantity('Oak Slab'), '1');
  await page.getByRole('button', { name: 'Inventory items', exact: true }).click();
  await mkdir(output, { recursive: true });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.getByRole('heading', { name: 'Ready to build?', exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(output, `studio-${width}.png`) });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  }
  assert.deepEqual(evidence.errors, []); evidence.passed = true;
} finally {
  await mkdir(output, { recursive: true }); await writeFile(join(output, 'results.json'), JSON.stringify(evidence, null, 2));
  await browser.close(); await app.close(); await rm(directory, { recursive: true, force: true });
}
console.log(evidence);
