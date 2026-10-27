import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import Fastify from 'fastify';
import { validateBlueprint, blueprintHash, calculateMaterials, reviseProject, approveProject, registerBuildRoutes } from '../services/build-planner/index.js';
import { splitAssignments, updateUserProgress, reconcileAssignments, reconcileProjectInventory, reserveMaterials, assignmentNeeds } from '../services/resource-ledger/index.js';
import { dataFor } from '../packages/minecraft-data/index.js';
import { localProductionRecipes, normalizeProductionCatalog } from '../packages/minecraft-data/production.js';

const version = '1.21.11';
function design(blocks = [{ x: 0, y: 0, z: 0, name: 'oak_planks' }], extra = {}) {
  return validateBlueprint({ version, dimensions: { x: 16, y: 8, z: 16 }, blocks, provenance: 'reconstructed', uncertainties: [], ...extra });
}

test('blueprint validates release, bounds, duplicates, names and exact block states', () => {
  assert.equal(design().blocks[0].name, 'oak_planks');
  assert.throws(() => dataFor('999.1'), /not in/);
  assert.throws(() => design([{ x: -1, y: 0, z: 0, name: 'stone' }]), /outside/);
  assert.throws(() => design([{ x: 0, y: 0, z: 0, name: 'stone' }, { x: 0, y: 0, z: 0, name: 'dirt' }]), /Duplicate/);
  assert.throws(() => design([{ x: 0, y: 0, z: 0, name: 'air' }]), /Air is implicit/);
  assert.throws(() => design([{ x: 0, y: 0, z: 0, name: 'constructor' }]), /Unknown/);
  assert.throws(() => design([{ x: 0, y: 0, z: 0, name: 'oak_stairs', properties: { facing: 'up' } }]), /Invalid state/);
  assert.throws(() => design([{ x: 0, y: 0, z: 0, name: 'stone', properties: { command: 'execute' } }]), /Unknown state/);
  assert.equal(design([{ x: 0, y: 0, z: 0, name: 'oak_stairs', properties: { facing: 'east', half: 'bottom', waterlogged: false, shape: 'straight' } }]).blocks[0].properties.waterlogged, 'false');
});

test('crafting batches aggregate planks and stairs once without double-counting logs', () => {
  const blueprint = design([{ x: 0, y: 0, z: 0, name: 'oak_planks' }, ...Array.from({ length: 4 }, (_, i) => ({ x: i + 1, y: 0, z: 0, name: 'oak_stairs' }))]);
  const materials = calculateMaterials(blueprint);
  assert.deepEqual(materials.raw.map(({ name, quantity }) => ({ name, quantity })), [{ name: 'oak_log', quantity: 2 }]);
  const planks = materials.steps.find((step) => step.name === 'oak_planks');
  assert.equal(planks.required, 7);
  assert.equal(planks.produced, 8);
  assert.equal(planks.surplus, 1);
  assert.equal(materials.steps.find((step) => step.name === 'oak_stairs').requiresCraftingTable, true);
  assert.equal(materials.placed.find((item) => item.name === 'oak_stairs').quantity, 4);
});

test('door halves and double slabs distinguish placements from required items', () => {
  const blueprint = design([
    { x: 0, y: 0, z: 0, name: 'oak_door', properties: { half: 'lower' } },
    { x: 0, y: 1, z: 0, name: 'oak_door', properties: { half: 'upper' } },
    { x: 1, y: 0, z: 0, name: 'oak_slab', properties: { type: 'double' } },
  ]);
  const materials = calculateMaterials(blueprint);
  assert.equal(materials.placed.find((i) => i.name === 'oak_door').quantity, 2);
  assert.equal(materials.craftedItems.find((i) => i.name === 'oak_door').quantity, 1);
  assert.equal(materials.craftedItems.find((i) => i.name === 'oak_slab').quantity, 2);
});

test('missing furnace data is an explicit prerequisite and cycles do not recurse forever', () => {
  const materials = calculateMaterials(design([{ x: 0, y: 0, z: 0, name: 'glass' }, { x: 1, y: 0, z: 0, name: 'stone_bricks' }, { x: 2, y: 0, z: 0, name: 'iron_block' }]));
  assert.ok(materials.unresolved.some((message) => message.includes('glass')));
  assert.ok(materials.unresolved.some((message) => message.includes('stone')));
  assert.equal(materials.raw.find((i) => i.name === 'iron_ingot').quantity, 9);
  assert.ok(!materials.raw.some((i) => i.name === 'stone_bricks'));
});

test('installed exact-version vanilla jar supplies real smelting/stonecutting recipes without modifying Minecraft', (t) => {
  const catalog = localProductionRecipes('1.21.5');
  if (!catalog.source) return t.skip('No exact-version local vanilla client jar on this test machine.');
  const blueprint = validateBlueprint({ version: '1.21.5', dimensions: { x: 2, y: 1, z: 1 }, provenance: 'reconstructed', uncertainties: [], blocks: [{ x: 0, y: 0, z: 0, name: 'stone_brick_stairs' }, { x: 1, y: 0, z: 0, name: 'glass' }] });
  const result = calculateMaterials(blueprint);
  assert.equal(result.raw.find((row) => row.name === 'cobblestone').quantity, 1);
  assert.equal(result.raw.find((row) => row.name === 'sand').quantity, 1);
  assert.ok(result.steps.some((step) => step.method === 'stonecutting'));
  assert.equal(result.fuel.cookingTicks, 400);
  assert.equal(result.fuel.quantity, null);
  assert.match(result.productionSource.sha256, /^[a-f0-9]{64}$/);
  assert.ok(result.unresolved.some((message) => message.includes('fuel')));
});

test('production catalogs resolve tags safely and reject mismatched source versions', () => {
  assert.throws(() => normalizeProductionCatalog({ version: '1.21.5', recipes: [] }, version), /version mismatch/);
  const catalog = normalizeProductionCatalog({ version, source: { kind: 'test' }, tags: { a: ['#minecraft:b'], b: ['#minecraft:a'] }, recipes: [{ id: 'bad_cycle', type: 'minecraft:smelting', ingredient: '#minecraft:a', cookingtime: 200, result: { id: 'minecraft:glass' } }] }, version);
  assert.equal(catalog.size, 0);
});

test('revisions invalidate approval and checkpoints; approval hash detects subsequent mutation', () => {
  const first = reviseProject({ id: 'p', version, revision: 0 }, design());
  const approved = approveProject(first);
  assert.equal(approved.approvedHash, blueprintHash(approved.blueprint));
  const second = reviseProject({ ...approved, checkpoint: { verified: [0] } }, design([{ x: 0, y: 0, z: 0, name: 'dirt' }]));
  assert.equal(second.revision, 2);
  assert.equal(second.approvedRevision, null);
  assert.equal(second.checkpoint, null);
  approved.blueprint.blocks[0].name = 'stone';
  assert.notEqual(approved.approvedHash, blueprintHash(approved.blueprint));
});

test('splits preserve totals, progress provenance, overachievement and missing stock semantics', () => {
  const [assignment] = splitAssignments([{ name: 'stone', quantity: 1001 }], 50);
  assert.equal(assignment.aiRequired, 500);
  assert.equal(assignment.userRequired, 501);
  const [reported] = updateUserProgress([assignment], 'stone', 1001, '2026-01-01T00:00:00Z');
  assert.equal(assignmentNeeds(reported), 0);
  assert.equal(reported.userProvenance, 'manual');
  assert.throws(() => updateUserProgress([assignment], 'stone', -1), /non-negative/);
  assert.throws(() => splitAssignments([{ name: 'stone', quantity: 1 }], 101), /percentage/);
  const live = reconcileAssignments([assignment], [{ name: 'stone', count: 22 }], 'now')[0];
  assert.equal(live.aiProgress, 22);
  assert.equal(live.aiObservedAt, 'now');
  assert.equal(reconcileAssignments([live], [], null)[0].aiProvenance, 'last-observed-inventory');
});

test('reservations cannot allocate the same bot items to two projects', () => {
  assert.throws(() => reserveMaterials([{ id: 'other', reservations: { stone: 40 } }], 'current', [{ name: 'stone', quantity: 30 }], [{ name: 'stone', count: 64 }]), /available 24/);
  assert.deepEqual(reserveMaterials([{ id: 'current', reservations: { stone: 40 } }], 'current', [{ name: 'stone', quantity: 64 }], [{ name: 'stone', count: 64 }]), { stone: 64 });
});

test('live stock is allocated once across projects and redistributes when user covers a share', () => {
  const projects = ['a', 'b'].map((id) => ({ id, createdAt: id, assignments: splitAssignments([{ name: 'oak_log', quantity: 8 }], 50) }));
  const result = reconcileProjectInventory(projects, [{ name: 'oak_log', count: 5 }], 'now');
  assert.equal(result[0].assignments[0].aiProgress, 4);
  assert.equal(result[1].assignments[0].aiProgress, 1);
  assert.equal(result[0].assignments[0].aiInventoryTotal, 5);
  projects[0].assignments[0].userProgress = 8;
  const redistributed = reconcileProjectInventory(projects, [{ name: 'oak_log', count: 5 }], 'later');
  assert.equal(redistributed[0].assignments[0].aiProgress, 0);
  assert.equal(redistributed[1].assignments[0].aiProgress, 4);
});

function fixture(orchestrator) {
  const collections = new Map();
  const store = { get: (name) => [...(collections.get(name)?.values() ?? [])], put: (name, record) => { if (!collections.has(name)) collections.set(name, new Map()); collections.get(name).set(record.id, structuredClone(record)); } };
  const runtime = new EventEmitter();
  runtime.snapshot = () => ({ state: 'PAUSED', world: null });
  runtime.isActive = () => false;
  const app = Fastify();
  registerBuildRoutes(app, { store, runtime, orchestrator, publish() {} });
  return { app, store, runtime };
}

test('real Fastify routes persist blueprint, approval, manual progress and prevent paused construction', async (t) => {
  const { app, store } = fixture(); t.after(() => app.close());
  const response = await app.inject({ method: 'POST', url: '/api/projects', payload: { name: 'Cabin', version, blueprint: design() } });
  assert.equal(response.statusCode, 200, response.body);
  const project = response.json();
  assert.equal(project.materials.raw[0].name, 'oak_log');
  assert.equal((await app.inject({ method: 'POST', url: `/api/projects/${project.id}/approve`, payload: {} })).json().approvedRevision, 1);
  assert.equal((await app.inject({ method: 'POST', url: `/api/projects/${project.id}/progress`, payload: { material: 'oak_log', owner: 'ai', quantity: 100 } })).statusCode, 400);
  const progress = await app.inject({ method: 'POST', url: `/api/projects/${project.id}/progress`, payload: { material: 'oak_log', owner: 'user', quantity: 1 } });
  assert.equal(progress.json().assignments[0].userProgress, 1);
  assert.equal((await app.inject({ method: 'POST', url: `/api/projects/${project.id}/build`, payload: { origin: { x: 0, y: 64, z: 0 } } })).statusCode, 400);
  const revised = await app.inject({ method: 'POST', url: `/api/projects/${project.id}/blueprint`, payload: { blueprint: design() } });
  assert.equal(revised.json().approvedRevision, null);
  assert.equal(store.get('blueprintRevisions').length, 2);
  const revisions = await app.inject({ method: 'GET', url: `/api/projects/${project.id}/revisions` });
  assert.equal(revisions.json().length, 2);
});

test('architect route gates model requests while paused and validates actual generated designs before revision', async (t) => {
  let requests = 0;
  const { app, runtime } = fixture({ async designBlueprint() { requests++; return design(); } }); t.after(() => app.close());
  const project = (await app.inject({ method: 'POST', url: '/api/projects', payload: { name: 'New cabin', version } })).json();
  const path = `/api/projects/${project.id}/design`;
  assert.equal((await app.inject({ method: 'POST', url: path, payload: { description: 'A small oak cabin' } })).statusCode, 400);
  assert.equal(requests, 0);
  runtime.isActive = () => true;
  const generated = await app.inject({ method: 'POST', url: path, payload: { description: 'A small oak cabin' } });
  assert.equal(generated.statusCode, 200, generated.body);
  assert.equal(generated.json().revision, 1);
  assert.equal(generated.json().approvedRevision, null);
  assert.equal(requests, 1);
});

test('architect treats archived references as local unless sharing is explicitly selected', async (t) => {
  let sent;
  const { app, runtime } = fixture({ async designBlueprint(args) { sent = args; return design(); } }); t.after(() => app.close());
  runtime.isActive = () => true;
  const project = (await app.inject({ method: 'POST', url: '/api/projects', payload: { name: 'Private notes', version } })).json();
  await app.inject({ method: 'POST', url: `/api/projects/${project.id}/references`, payload: { type: 'text', text: 'Private inspiration note' } });
  await app.inject({ method: 'POST', url: `/api/projects/${project.id}/design`, payload: { description: 'Oak cabin' } });
  assert.deepEqual(sent.references, []);
  await app.inject({ method: 'POST', url: `/api/projects/${project.id}/design`, payload: { description: 'Oak cabin', includeReferences: true } });
  assert.equal(sent.references[0].text, 'Private inspiration note');
});

test('assigned gathering reconciles real stock before requesting a bounded wood batch', async (t) => {
  const { app, runtime } = fixture(); t.after(() => app.close());
  const placements = Array.from({ length: 12 }, (_, x) => ({ x, y: 0, z: 0, name: 'oak_planks' }));
  const project = (await app.inject({ method: 'POST', url: '/api/projects', payload: { name: 'Wood project', version, blueprint: design(placements) } })).json();
  await app.inject({ method: 'POST', url: `/api/projects/${project.id}/approve`, payload: {} });
  runtime.isActive = () => true;
  runtime.snapshot = () => ({ state: 'ACTIVE', world: { inventory: [{ name: 'oak_log', count: 2 }], observedAt: 'now' } });
  runtime.execute = () => { throw new Error('No gather expected when assignment is already covered.'); };
  const enough = await app.inject({ method: 'POST', url: `/api/projects/${project.id}/gather`, payload: { material: 'oak_log' } });
  assert.equal(enough.statusCode, 200, enough.body);
  assert.equal(enough.json().started, false);
  const unsafe = await app.inject({ method: 'POST', url: `/api/projects/${project.id}/gather`, payload: { material: 'stone' } });
  assert.equal(unsafe.statusCode, 400);
});
