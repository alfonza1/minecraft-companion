import test from 'node:test';
import assert from 'node:assert/strict';
import { Vec3 } from 'vec3';
import { selectMiningTargets, requireNaturalTree } from '../services/skill-executor/index.js';

test('mining filters an approved area before taking a count and protects the ground under the bot', () => {
  const positions = [new Vec3(0, 4, 0), new Vec3(0, 5, 0), new Vec3(100, 5, 0), new Vec3(5, 5, 0), new Vec3(6, 5, 0)];
  const bot = { entity: { position: new Vec3(0.5, 5, 0.5) }, registry: { blocksByName: { dirt: { id: 1, hardness: 1 } } }, findBlocks: () => positions, blockAt: position => ({ position, name: 'dirt' }) };
  assert.throws(() => selectMiningTargets(bot, 'dirt', 1, null), /Approve/);
  const targets = selectMiningTargets(bot, 'dirt', 1, { x: 5, y: 5, z: 0, radius: 2 });
  assert.equal(targets.length, 1); assert.deepEqual(targets[0].position, new Vec3(5, 5, 0));
});

test('logs rooted on a built foundation are rejected rather than harvested as a tree', () => {
  const position = new Vec3(1, 5, 0);
  const bot = { findBlocks: () => [position], blockAt: target => target.y === 5 ? { name: 'oak_log', position, boundingBox: 'block' } : { name: 'stone_bricks', boundingBox: 'block' } };
  assert.throws(() => requireNaturalTree(bot, 'oak'), /not rooted in natural soil/);
});
