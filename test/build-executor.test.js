import test from 'node:test';
import assert from 'node:assert/strict';
import { Vec3 } from 'vec3';
import { executeBuild, constructionCompatibility } from '../services/build-executor/index.js';
import { validateBlueprint, blueprintHash } from '../services/build-planner/blueprint.js';

function fixture(blocks = [{ x: 0, y: 0, z: 0, name: 'oak_planks' }]) {
  const blueprint = validateBlueprint({ version: '1.21.11', dimensions: { x: 4, y: 4, z: 4 }, blocks, provenance: 'reconstructed', uncertainties: [] });
  const world = new Map();
  const observed = (name, position) => ({ name, position, boundingBox: name === 'air' ? 'empty' : 'block', shapes: name === 'air' ? [] : [[0, 0, 0, 1, 1, 1]], getProperties: () => ({}) });
  const bot = {
    version: '1.21.11', game: { dimension: 'overworld' }, entity: { position: new Vec3(3, 64, 0) }, entities: {}, placed: 0,
    inventory: { items: () => [{ name: 'oak_planks', count: 64 }] },
    pathfinder: { goto: async () => {}, stop() {}, setGoal() {} },
    blockAt(position) { return world.get(position.toString()) ?? observed(position.y < 64 ? 'stone' : 'air', position); },
    equip: async () => {}, clearControlStates() {},
    async placeBlock(reference, face) { this.placed++; const position = reference.position.plus(face); world.set(position.toString(), observed('oak_planks', position)); },
  };
  const project = { id: 'p', revision: 1, approvedRevision: 1, approvedHash: blueprintHash(blueprint), blueprint, reservations: { oak_planks: blocks.length } };
  const saved = [];
  const controller = new AbortController();
  const args = { project, bot, origin: { x: 0, y: 64, z: 0 }, signal: controller.signal, save: (p) => saved.push(structuredClone(p)) };
  return { project, bot, world, saved, controller, args, observed };
}

test('survival placement saves completion only after observed server block confirmation', async () => {
  const { args, bot, saved } = fixture();
  const result = await executeBuild(args);
  assert.equal(result.status, 'complete');
  assert.equal(bot.placed, 1);
  assert.deepEqual(saved.at(-1).checkpoint.verified, [0]);
  assert.equal(saved.at(-1).reservations.oak_planks, 0);
});

test('world conflicts and unloaded regions stop before any placement', async () => {
  const f = fixture();
  f.world.set(new Vec3(0, 64, 0).toString(), f.observed('diamond_block', new Vec3(0, 64, 0)));
  await assert.rejects(executeBuild(f.args), /conflicts/);
  assert.equal(f.bot.placed, 0);
  const unloaded = fixture(); unloaded.bot.blockAt = () => null;
  await assert.rejects(executeBuild(unloaded.args), /fully observed/);
  assert.equal(unloaded.bot.placed, 0);
});

test('pause during equipment change prevents the next placement and persists checkpoint', async () => {
  const f = fixture();
  f.bot.equip = async () => { f.controller.abort(new Error('Paused')); };
  await assert.rejects(executeBuild(f.args), /Paused/);
  assert.equal(f.bot.placed, 0);
  assert.equal(f.saved.at(-1).checkpoint.status, 'paused');
  assert.deepEqual(f.saved.at(-1).checkpoint.verified, []);
});

test('stale checkpoint is reverified on resume and missing blocks are physically replaced', async () => {
  const f = fixture();
  f.project.checkpoint = { origin: f.args.origin, dimension: 'overworld', verified: [0], status: 'paused' };
  await executeBuild(f.args);
  assert.equal(f.bot.placed, 1);
  assert.equal(f.saved.at(-1).status, 'complete');
});

test('unconfirmed placement and target changing while approaching remain unverified', async () => {
  const f = fixture(); f.bot.placeBlock = async () => {};
  await assert.rejects(executeBuild(f.args), /Server did not confirm/);
  assert.equal(f.saved.at(-1).checkpoint.verified.length, 0);
  const g = fixture();
  g.bot.equip = async () => { g.world.set('(0, 64, 0)', g.observed('diamond_block', new Vec3(0, 64, 0))); };
  await assert.rejects(executeBuild(g.args), /target changed/);
  assert.equal(g.bot.placed, 0);
});

test('special block states and mutated or moved approved plans are refused', async () => {
  const f = fixture([{ x: 0, y: 0, z: 0, name: 'oak_stairs', properties: { facing: 'east' } }]);
  assert.equal(constructionCompatibility(f.project.blueprint).supported, false);
  await assert.rejects(executeBuild(f.args), /Unsupported: oak_stairs/);
  const g = fixture(); g.project.blueprint.blocks[0].name = 'diamond_block';
  await assert.rejects(executeBuild(g.args), /Approve/);
  const h = fixture(); h.project.checkpoint = { origin: { x: 100, y: 64, z: 0 }, dimension: 'overworld' };
  await assert.rejects(executeBuild(h.args), /another site/);
});
