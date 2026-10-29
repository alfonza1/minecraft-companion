import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Vec3 } from 'vec3';
import { validateBlueprint, blueprintHash } from '../services/build-planner/blueprint.js';
import { executeBuild, matchesPlacement } from '../services/build-executor/index.js';
import { calculateMaterials } from '../services/build-planner/materials.js';

// Only called by test-native-game's disposable localhost official server.
export async function buildingFixtureChecks({ check, command, until, runtime, store, api }) {
  const bot = runtime.bot;
  const owned = name => bot.inventory.items().filter(item => item.name === name).reduce((sum, item) => sum + item.count, 0);
  const origin = { x: 3, y: -59, z: 0 };
  const at = (x = 0, y = 0, z = 0) => new Vec3(origin.x + x, origin.y + y, origin.z + z);
  async function reset(items) {
    command('tp NativeFixture 0 -59 0');
    command('fill 1 -59 -4 12 -50 12 minecraft:air');
    command('clear NativeFixture');
    await until(() => bot.entity.position.distanceTo(new Vec3(.5, -59, .5)) < .2 && !bot.inventory.items().length && bot.blockAt(at())?.name === 'air', 'clear fixture');
    for (const [name, count] of Object.entries(items)) command(`give NativeFixture minecraft:${name} ${count}`);
    await until(() => Object.entries(items).every(([name, count]) => owned(name) === count), 'fixture inventory');
  }
  const projectFor = blocks => {
    const blueprint = validateBlueprint({ version: '26.3', dimensions: { x: 8, y: 6, z: 8 }, blocks, provenance: 'reconstructed' });
    return { id: randomUUID(), name: 'Local building test', version: '26.3', revision: 1, approvedRevision: 1, blueprint, approvedHash: blueprintHash(blueprint), assignments: [], reservations: {}, status: 'approved' };
  };
  const build = (project, save = p => store.put('projects', p)) => runtime.runJob('building-fixture', signal => executeBuild({ project, origin, bot, signal, save, realmId: 1 }));
  await check('native stair facing and halves use actual survival state placement', async () => {
    for (const facing of ['north', 'east', 'south', 'west']) for (const half of ['bottom', 'top']) {
      await reset({ oak_stairs: 1 });
      if (half === 'top') { command('setblock 4 -59 0 minecraft:stone'); await until(() => bot.blockAt(at(1))?.name === 'stone', 'stair side support'); }
      const block = { x: 0, y: 0, z: 0, name: 'oak_stairs', properties: { facing, half, shape: 'straight', waterlogged: 'false' } };
      await build(projectFor([block]));
      assert.ok(matchesPlacement(bot.blockAt(at()), block), JSON.stringify(bot.blockAt(at()).getProperties()));
      assert.equal(owned('oak_stairs'), 0);
    }
    return { directions: 4, halves: 2, verified: 8 };
  });
  await check('native bottom top and double slabs confirm states and item use', async () => {
    for (const type of ['bottom', 'top', 'double']) {
      await reset({ oak_slab: type === 'double' ? 2 : 1 });
      if (type === 'top') { command('setblock 4 -59 0 minecraft:stone'); await until(() => bot.blockAt(at(1))?.name === 'stone', 'slab side support'); }
      const block = { x: 0, y: 0, z: 0, name: 'oak_slab', properties: { type, waterlogged: 'false' } };
      const project = projectFor([block]); await build(project);
      assert.ok(matchesPlacement(bot.blockAt(at()), block)); assert.equal(owned('oak_slab'), 0);
      assert.equal(calculateMaterials(project.blueprint).craftedItems[0].quantity, type === 'double' ? 2 : 1);
    }
    return { states: 3, exactConsumption: true };
  });
  await check('native paired doors verify both halves facing and hinge with one item', async () => {
    for (const facing of ['north', 'east', 'south', 'west']) for (const hinge of ['left', 'right']) {
      await reset({ oak_door: 1 });
      const blocks = ['lower', 'upper'].map((half, y) => ({ x: 0, y, z: 0, name: 'oak_door', properties: { facing, hinge, half, open: 'false', powered: 'false' } }));
      const project = projectFor(blocks); await build(project);
      for (const block of blocks) assert.ok(matchesPlacement(bot.blockAt(at(0, block.y)), block));
      assert.equal(owned('oak_door'), 0); assert.equal(calculateMaterials(project.blueprint).craftedItems[0].quantity, 1);
    }
    return { directions: 4, hinges: 2, halves: 16 };
  });
  await check('native logs follow requested x y z axes', async () => {
    for (const axis of ['x', 'y', 'z']) {
      await reset({ oak_log: 1 });
      if (axis !== 'y') { const support = at(axis === 'x' ? 1 : 0, 0, axis === 'z' ? 1 : 0); command(`setblock ${support.x} ${support.y} ${support.z} minecraft:stone`); await until(() => bot.blockAt(support)?.name === 'stone', 'axis support'); }
      const block = { x: 0, y: 0, z: 0, name: 'oak_log', properties: { axis } }; await build(projectFor([block]));
      assert.ok(matchesPlacement(bot.blockAt(at()), block));
    }
    return { axes: 3 };
  });
  await check('native fence and pane connections verified after neighbours arrive', async () => {
    for (const name of ['oak_fence', 'glass_pane']) {
      await reset({ [name]: 2 });
      const blocks = [0, 1].map(x => ({ x, y: 0, z: 0, name, properties: { north: 'false', south: 'false', west: String(x === 1), east: String(x === 0), waterlogged: 'false' } }));
      await build(projectFor(blocks)); for (const block of blocks) assert.ok(matchesPlacement(bot.blockAt(at(block.x)), block));
    }
    return { neighbourUpdatesVerified: true };
  });
  await check('native double slab pause preserves half and resumes without duplicate consumption', async () => {
    await reset({ oak_slab: 2 });
    const project = projectFor([{ x: 0, y: 0, z: 0, name: 'oak_slab', properties: { type: 'double', waterlogged: 'false' } }]);
    let paused;
    const interrupt = (oldBlock, newBlock) => {
      if (newBlock?.position.equals(at()) && newBlock.name === 'oak_slab' && newBlock.getProperties().type === 'bottom') {
        bot.removeListener('blockUpdate', interrupt); paused = runtime.control('pause');
      }
    };
    bot.on('blockUpdate', interrupt);
    try { await assert.rejects(build(project)); await paused; await runtime.waitForIdle(); assert.equal(project.checkpoint.status, 'paused'); await runtime.control('resume'); await build(project); }
    finally { bot.removeListener('blockUpdate', interrupt); }
    assert.equal(bot.blockAt(at()).getProperties().type, 'double'); assert.equal(owned('oak_slab'), 0);
    return { resumed: true, itemsConsumed: 2 };
  });
  await check('native build restocks approved chest and verifies server inventory', async () => {
    await reset({});
    command('setblock 0 -59 3 minecraft:chest'); command('item replace block 0 -59 3 container.0 with minecraft:oak_planks 8');
    await until(() => bot.blockAt(new Vec3(0, -59, 3))?.name === 'chest', 'supply chest');
    store.put('supplyChests', { id: randomUUID(), name: 'Build supplies', position: { x: 0, y: -59, z: 3 }, realmId: 1, dimension: bot.game.dimension, approved: true, allowedItems: ['oak_planks'] });
    const project = projectFor([0, 1].map(x => ({ x, y: 0, z: 0, name: 'oak_planks' })));
    store.put('projects', project);
    const response = await api.inject({ method: 'POST', url: `/api/projects/${project.id}/build`, payload: { origin } });
    assert.equal(response.statusCode, 200, response.body); await runtime.pending;
    assert.equal(store.get('projects').find(value => value.id === project.id).status, 'complete');
    assert.equal(owned('oak_planks'), 0);
    const stock = store.get('supplyChests').find(value => value.name === 'Build supplies');
    assert.equal(stock.inventory.find(value => value.name === 'oak_planks').count, 6);
    return { placed: 2, chestRemaining: 6, inventoryConfirmed: !bot.companionInventoryUnverified };
  });
  await check('native build crafts stairs from owned logs then places exact shape', async () => {
    await reset({ oak_log: 2 });
    command('setblock 0 -59 3 minecraft:crafting_table'); await until(() => bot.blockAt(new Vec3(0, -59, 3))?.name === 'crafting_table', 'crafting table');
    for (const chest of store.get('supplyChests')) store.put('supplyChests', { ...chest, approved: false });
    const project = projectFor([{ x: 0, y: 0, z: 0, name: 'oak_stairs', properties: { facing: 'west', half: 'bottom', shape: 'straight' } }]);
    store.put('projects', project);
    const response = await api.inject({ method: 'POST', url: `/api/projects/${project.id}/build`, payload: { origin } });
    assert.equal(response.statusCode, 200, response.body); await runtime.pending;
    assert.equal(store.get('projects').find(value => value.id === project.id).status, 'complete');
    assert.equal(owned('oak_stairs'), 3); assert.equal(owned('oak_planks'), 2);
    return { placed: 1, surplusStairs: 3, surplusPlanks: 2 };
  });
  await check('native complete small house builds shell roof window and door with checkpoint resume', async () => {
    const blocks = [];
    for (let x = 0; x < 3; x++) for (let z = 0; z < 3; z++) {
      blocks.push({ x, y: 0, z, name: 'oak_planks' });
      if (x === 0 || x === 2 || z === 0 || z === 2) for (const y of [1, 2]) {
        if (x === 1 && z === 0) continue;
        const corner = x !== 1 && z !== 1;
        blocks.push({ x, y, z, name: corner ? 'oak_log' : (x === 1 && z === 2 && y === 2) ? 'glass' : 'oak_planks', ...(corner ? { properties: { axis: 'y' } } : {}) });
      }
      blocks.push({ x, y: 3, z, name: x === 1 ? 'oak_planks' : 'oak_stairs', ...(x !== 1 ? { properties: { facing: x === 0 ? 'east' : 'west', half: 'bottom' } } : {}) });
    }
    for (const [y, half] of [[1, 'lower'], [2, 'upper']]) blocks.push({ x: 1, y, z: 0, name: 'oak_door', properties: { facing: 'south', half, hinge: 'left', open: 'false', powered: 'false' } });
    const project = projectFor(blocks), items = Object.fromEntries(calculateMaterials(project.blueprint).craftedItems.map(row => [row.name, row.quantity]));
    await reset(items);
    await assert.rejects(build(project, value => { store.put('projects', value); if (value.checkpoint.verified.length === 12) runtime.jobController.abort(new Error('House interruption')); }), /House interruption/);
    const persisted = structuredClone(store.get('projects').find(value => value.id === project.id));
    const result = await build(persisted);
    assert.equal(result.status, 'complete');
    for (const block of blocks) assert.ok(matchesPlacement(bot.blockAt(at(block.x, block.y, block.z)), block));
    for (const name of Object.keys(items)) assert.equal(owned(name), 0, name);
    return { placements: blocks.length, complete: true, resumed: true, exactItemConsumption: true };
  });
}
