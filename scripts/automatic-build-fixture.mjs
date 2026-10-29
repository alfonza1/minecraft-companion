import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Vec3 } from 'vec3';
import { validateBlueprint, blueprintHash } from '../services/build-planner/blueprint.js';
import { executeBuild, matchesPlacement } from '../services/build-executor/index.js';
import { createBuildSupplies } from '../services/build-executor/supplies.js';
import { prepareConstruction, outstandingScaffolds } from '../services/build-executor/construction-plan.js';

export async function automaticBuildChecks({ check: runCheck, command, until, runtime, store, teammate }) {
  const check = (name, work) => process.argv.includes('--house-only') && !name.includes('tall enclosed house') ? Promise.resolve() : runCheck(name, work);
  const bot = runtime.bot, origin = { x: 3, y: -59, z: 3 };
  const at = (x, y, z) => new Vec3(origin.x + x, origin.y + y, origin.z + z);
  const count = name => bot.inventory.items().filter(item => item.name === name).reduce((n, item) => n + item.count, 0);
  command('gamerule minecraft:advance_time false'); command('gamerule minecraft:spawn_mobs false'); command('time set day');
  async function reset(items) {
    bot.pathfinder.setGoal(null); bot.clearControlStates();
    command('kill @e[type=minecraft:item]'); command('tp NativeFixture -1 -59 -1'); command('fill -5 -59 -12 16 -43 16 minecraft:air'); command('clear NativeFixture');
    await until(() => !bot.inventory.items().length && bot.entity.position.distanceTo(new Vec3(-.5, -59, -.5)) < .2 && bot.blockAt(at(0, 0, 0))?.name === 'air', 'automatic build reset');
    for (const [name, amount] of Object.entries({ iron_axe: 1, iron_pickaxe: 1, iron_shovel: 1, bread: 16, ...items })) command(`give NativeFixture minecraft:${name} ${amount}`);
    await until(() => count('iron_shovel') === 1 && Object.entries(items).every(([name, amount]) => count(name) === amount), 'automatic build kit');
  }
  const projectFor = (blocks, dimensions) => {
    const blueprint = validateBlueprint({ version: '26.3', dimensions, provenance: 'reconstructed', blocks });
    return { id: randomUUID(), name: 'Automatic construction fixture', version: '26.3', revision: 1, approvedRevision: 1, blueprint, approvedHash: blueprintHash(blueprint), reservations: {}, assignments: [], status: 'approved' };
  };
  const prepare = project => {
    project.construction = prepareConstruction(project, origin, bot, 1, { scaffolding: true, gatherMaterials: true, takeOverShares: true, scaffoldMaterial: 'dirt' });
    store.put('projects', project);
  };
  const run = (project, save = value => store.put('projects', value)) => runtime.runJob('automatic-build', signal => executeBuild({ project, origin, bot, realmId: 1, signal, save, ensureMaterials: createBuildSupplies({ project, origin, bot, store, teammate, save }) }));

  await check('automatic elevated access builds and removes only owned scaffolds', async () => {
    const blocks = [];
    for (let y = 0; y <= 6; y++) blocks.push({ x: 0, y, z: 0, name: 'oak_planks' });
    for (let x = 1; x <= 2; x++) blocks.push({ x, y: 6, z: 0, name: 'oak_planks' });
    const project = projectFor(blocks, { x: 3, y: 7, z: 2 });
    await reset({ dirt: 64, oak_planks: blocks.length });
    prepare(project);
    assert.ok(project.construction.scaffolds.length > 20);
    const result = await run(project);
    assert.equal(result.status, 'complete');
    assert.equal(outstandingScaffolds(project).length, 0);
    for (const entry of project.construction.scaffolds) assert.equal(bot.blockAt(new Vec3(entry.position.x, entry.position.y, entry.position.z)).name, 'air');
    for (const block of blocks) assert.ok(matchesPlacement(bot.blockAt(at(block.x, block.y, block.z)), block));
    return { placements: blocks.length, scaffoldsPlacedAndRemoved: project.construction.scaffolds.filter(entry => entry.status === 'removed').length };
  });
  await check('construction gathers real tree logs crafts a workbench and stairs then returns to build', async () => {
    await reset({});
    for (const x of [17, 21, 25]) {
      for (let y = -59; y < -55; y++) command(`setblock ${x} ${y} 3 minecraft:oak_log`);
      command(`setblock ${x} -55 3 minecraft:oak_leaves[persistent=true]`);
    }
    await until(() => bot.blockAt(new Vec3(17, -59, 3))?.name === 'oak_log', 'raw forest source');
    const project = projectFor([{ x: 0, y: 0, z: 0, name: 'oak_stairs', properties: { facing: 'east', half: 'bottom' } }], { x: 2, y: 1, z: 2 });
    prepare(project);
    const result = await run(project);
    assert.equal(result.status, 'complete');
    assert.ok((project.construction.gathered.oak_log ?? 0) > 0);
    assert.equal(bot.blockAt(at(-3, 0, 1)).name, 'crafting_table');
    assert.ok(matchesPlacement(bot.blockAt(at(0, 0, 0)), project.blueprint.blocks[0]));
    return { gathered: project.construction.gathered, supportGathered: project.construction.supportGathered, workbenchCreated: true, stairsPlaced: 1 };
  });
  await check('construction mines approved raw stone and dirt and resumes scaffold checkpoint', async () => {
    await reset({ oak_planks: 7 });
    command('fill 24 -59 0 29 -58 5 minecraft:dirt'); command('fill 24 -59 7 29 -59 9 minecraft:stone');
    await until(() => bot.blockAt(new Vec3(24, -59, 0))?.name === 'dirt' && bot.blockAt(new Vec3(24, -59, 7))?.name === 'stone', 'approved raw supply area');
    store.put('workAreas', { id: 'mining', position: { x: 26, y: -59, z: 4 }, radius: 6, realmId: 1, dimension: bot.game.dimension });
    const blocks = Array.from({ length: 7 }, (_, y) => ({ x: 0, y, z: 0, name: y === 6 ? 'cobblestone' : 'oak_planks' }));
    const project = projectFor(blocks, { x: 2, y: 7, z: 2 }); prepare(project);
    let interrupted = false;
    await assert.rejects(run(project, value => {
      store.put('projects', value);
      if (!interrupted && outstandingScaffolds(value).filter(entry => entry.status === 'placed').length === 5) { interrupted = true; runtime.jobController.abort(new Error('Automatic scaffold checkpoint interruption')); }
    }), /interruption/);
    const restored = structuredClone(store.get('projects').find(value => value.id === project.id));
    assert.equal(restored.checkpoint.status, 'paused');
    const result = await run(restored);
    assert.equal(result.status, 'complete'); assert.equal(outstandingScaffolds(restored).length, 0);
    assert.ok(restored.construction.supportGathered.dirt > 0); assert.ok(restored.construction.gathered.cobblestone > 0);
    return { resumed: true, supportGathered: restored.construction.supportGathered, gathered: restored.construction.gathered, cleanupComplete: true };
  });
  await check('automatic scaffolding completes a tall enclosed house and leaves its door usable', async () => {
    const blocks = [];
    for (let y = 0; y <= 6; y++) for (let x = 0; x < 3; x++) for (let z = 0; z < 3; z++) {
      if (y > 0 && y < 6 && x === 1 && z === 1) continue;
      const door = x === 1 && z === 0 && [1, 2].includes(y);
      const window = y === 3 && ((x === 1 && z === 2) || (z === 1 && [0,2].includes(x)));
      blocks.push({ x, y, z, name: door ? 'oak_door' : window ? 'glass' : 'oak_planks', ...(door ? { properties: { half: y === 1 ? 'lower' : 'upper', facing: 'north', hinge: 'left' } } : {}) });
    }
    await reset({ dirt: 64, oak_planks: blocks.filter(b => b.name === 'oak_planks').length, glass: 3, oak_door: 1 });
    const project = projectFor(blocks, { x: 3, y: 7, z: 3 }); prepare(project);
    const result = await run(project);
    assert.equal(result.status, 'complete'); assert.equal(outstandingScaffolds(project).length, 0);
    for (const block of blocks) assert.ok(matchesPlacement(bot.blockAt(at(block.x, block.y, block.z)), block));
    return { verifiedPlacements: blocks.length, scaffoldsRemoved: project.construction.scaffolds.length, actualInventoryRestocking: false };
  });
}
