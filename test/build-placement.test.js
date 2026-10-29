import test from 'node:test';
import assert from 'node:assert/strict';
import { Vec3 } from 'vec3';
import { dataFor } from '../packages/minecraft-data/index.js';
import { constructionCompatibility, matchesPlacement, placementSupport, placeAdaptedBlock } from '../services/build-executor/placement.js';
import { createBuildSupplies, remainingMaterials } from '../services/build-executor/supplies.js';
import { validateBlueprint } from '../services/build-planner/blueprint.js';
import { reserveMaterials } from '../services/resource-ledger/index.js';

const version = '1.21.11';
const origin = { x: 0, y: 64, z: 0 };
const blueprint = blocks => validateBlueprint({ version, dimensions: { x: 5, y: 5, z: 5 }, provenance: 'reconstructed', blocks });
const blockAt = (name, position, properties = {}) => ({ name, position, boundingBox: name === 'air' ? 'empty' : 'block', shapes: name === 'air' ? [] : [[0, 0, 0, 1, 1, 1]], getProperties: () => properties });

test('paired doors are required and dangerous or unsupported states remain gated', () => {
  const lower = { x: 0, y: 0, z: 0, name: 'oak_door', properties: { half: 'lower', facing: 'north', hinge: 'left' } };
  assert.equal(constructionCompatibility(blueprint([lower])).supported, false);
  const upper = { ...lower, y: 1, properties: { ...lower.properties, half: 'upper' } };
  assert.equal(constructionCompatibility(blueprint([lower, upper])).supported, true);
  assert.equal(constructionCompatibility(blueprint([lower, { ...upper, properties: { ...upper.properties, facing: 'west' } }])).supported, false);
  for (const block of [
    { name: 'oak_stairs', properties: { waterlogged: 'true' } },
    { name: 'oak_trapdoor' }, { name: 'sand' }, { name: 'tnt' }, { name: 'furnace' }, { name: 'scaffolding' }, { name: 'mushroom_stem' },
  ]) assert.equal(constructionCompatibility(blueprint([{ x: 0, y: 0, z: 0, ...block }])).supported, false, block.name);
});

test('neighbour-derived stair/fence states are mandatory for final verification', () => {
  const observed = blockAt('oak_stairs', new Vec3(0, 0, 0), { facing: 'north', shape: 'straight' });
  const expected = { name: 'oak_stairs', properties: { facing: 'north', shape: 'inner_left' } };
  assert.equal(matchesPlacement(observed, expected, { final: false }), true);
  assert.equal(matchesPlacement(observed, expected), false);
  assert.equal(matchesPlacement(observed, { ...expected, properties: { facing: 'east' } }, { final: false }), false);
  assert.equal(matchesPlacement(blockAt('oak_stairs', new Vec3(0, 0, 0), { waterlogged: true }), { name: 'oak_stairs' }), false);
  assert.equal(matchesPlacement(blockAt('oak_door', new Vec3(0, 0, 0), { open: true }), { name: 'oak_door' }), false);
});

test('remaining material quantities skip upper doors and subtract a confirmed half slab', () => {
  const design = blueprint([
    { x: 0, y: 0, z: 0, name: 'oak_door', properties: { half: 'lower' } },
    { x: 0, y: 1, z: 0, name: 'oak_door', properties: { half: 'upper' } },
    { x: 2, y: 0, z: 0, name: 'oak_slab', properties: { type: 'double' } },
  ]);
  const bot = { blockAt: p => p.x === 2 ? blockAt('oak_slab', p, { type: 'bottom', waterlogged: false }) : blockAt('air', p) };
  assert.deepEqual(remainingMaterials(design, bot, origin), [{ name: 'oak_door', quantity: 1 }, { name: 'oak_slab', quantity: 1 }]);
});

test('slab halves and log axes choose compatible supports, never interactive containers', () => {
  const target = new Vec3(0, 64, 0), bot = { version, blockAt: p => blockAt(p.y < 64 ? 'stone' : 'air', p) };
  assert.equal(placementSupport(bot, target, { name: 'oak_slab', properties: { type: 'bottom' } }).face.y, 1);
  assert.equal(placementSupport(bot, target, { name: 'oak_slab', properties: { type: 'top' } }), null);
  assert.equal(placementSupport(bot, target, { name: 'oak_log', properties: { axis: 'x' } }), null);
  bot.blockAt = p => blockAt('chest', p);
  assert.equal(placementSupport(bot, target, { name: 'oak_planks' }), null);
});

test('pause after heading synchronization sends no placement packet', async () => {
  const controller = new AbortController(); let packets = 0;
  const bot = { version, look: async () => {}, waitForTicks: async () => controller.abort(new Error('Paused')), _genericPlace: async () => packets++ };
  await assert.rejects(placeAdaptedBlock(bot, { name: 'oak_stairs', properties: { facing: 'north' } }, new Vec3(0, 64, 0), { reference: blockAt('stone', new Vec3(0, 63, 0)), face: new Vec3(0, 1, 0) }, controller.signal), /Paused/);
  assert.equal(packets, 0);
});

test('a target changed during aiming is refused before a placement packet', async () => {
  let packets = 0;
  const bot = { version, look: async () => {}, waitForTicks: async () => {}, _genericPlace: async () => packets++ };
  await assert.rejects(placeAdaptedBlock(bot, { name: 'oak_stairs', properties: { facing: 'north' } }, new Vec3(0, 64, 0), { reference: blockAt('stone', new Vec3(0, 63, 0)), face: new Vec3(0, 1, 0) }, new AbortController().signal, () => { throw new Error('Target changed'); }), /Target changed/);
  assert.equal(packets, 0);
});

test('partial reservations protect other projects without demanding a whole house in inventory', () => {
  const projects = [{ id: 'other', reservations: { oak_planks: 4 } }], stock = [{ name: 'oak_planks', count: 6 }];
  assert.deepEqual(reserveMaterials(projects, 'building', [{ name: 'oak_planks', quantity: 1000 }], stock, { partial: true }), { oak_planks: 2 });
  assert.throws(() => reserveMaterials(projects, 'building', [{ name: 'oak_planks', quantity: 1000 }], stock), /available 2/);
});

function supplyFixture() {
  const registry = dataFor(version), inventory = [];
  const bot = { version, registry, inventory: { items: () => inventory }, blockAt: p => blockAt('air', p), findBlock: () => null, recipesFor: () => [], recipesAll: () => [] };
  const design = blueprint([{ x: 0, y: 0, z: 0, name: 'oak_planks' }]);
  const project = { id: 'building', blueprint: design }, other = { id: 'other', reservations: { oak_planks: 4 } };
  const store = { get: () => [project, other] };
  return { bot, inventory, project, store };
}

test('build restock requests include other reservations and cannot consume them', async () => {
  const f = supplyFixture(); f.inventory.push({ name: 'oak_planks', count: 4 });
  const calls = [];
  const ensure = createBuildSupplies({ ...f, origin, save() {}, teammate: { withdraw: async values => { calls.push(values); } } });
  await assert.rejects(ensure(f.project.blueprint.blocks[0], 1, new AbortController().signal), /could not cover/);
  assert.deepEqual(calls, [[{ name: 'oak_planks', count: 5 }]]);
  assert.equal(f.project.reservations.oak_planks, 0);
});

test('resupply cancellation stops before crafting or reporting readiness', async () => {
  const f = supplyFixture(), controller = new AbortController(); let crafted = false;
  f.bot.recipesFor = () => { crafted = true; return []; };
  const ensure = createBuildSupplies({ ...f, origin, save() {}, teammate: { withdraw: async () => controller.abort(new Error('Paused')) } });
  await assert.rejects(ensure(f.project.blueprint.blocks[0], 1, controller.signal), /Paused/);
  assert.equal(crafted, false);
});
