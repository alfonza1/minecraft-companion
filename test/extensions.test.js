import test from 'node:test';
import assert from 'node:assert/strict';
import { createObserverRegistry } from '../packages/agent-extensions/index.js';
import { inventorySummary } from '../examples/extensions/inventory-summary.js';

test('observer validates registration and input; reports only observed stock', async () => {
  const registry = createObserverRegistry(); registry.register(inventorySummary);
  assert.throws(() => registry.register(inventorySummary), /duplicate/);
  assert.throws(() => registry.register({ ...inventorySummary, id: 'tool-example', kind: 'shell' }), /Only v1/);
  await assert.rejects(registry.run('inventory-summary', { search: 5 }, { snapshot: null }));
  assert.deepEqual(await registry.run('inventory-summary', {}, { snapshot: null }), { observed: false, items: [] });
  assert.deepEqual(await registry.run('inventory-summary', { search: 'iron' }, { snapshot: { inventory: [{ name: 'iron_ingot', count: 3 }, { name: 'iron_ingot', count: 2 }, { name: 'dirt', count: 8 }] } }), { observed: true, items: [{ name: 'iron_ingot', count: 5 }] });
});

test('observers receive cloned data, respect abort and validate results', async () => {
  const registry = createObserverRegistry();
  registry.register({ ...inventorySummary, observe: (_args, world) => { world.inventory.length = 0; return { observed: 'fabricated', items: [] }; } });
  const snapshot = { inventory: [{ name: 'stone', count: 4 }] };
  await assert.rejects(registry.run('inventory-summary', {}, { snapshot }));
  assert.equal(snapshot.inventory.length, 1);
  await assert.rejects(registry.run('inventory-summary', {}, { snapshot, signal: AbortSignal.abort() }), /abort/i);
});
