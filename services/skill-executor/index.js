import { collect } from '../../src/tools/play.js';
import { hasValidatedNativeMaterial } from '../../packages/minecraft-data/index.js';
import { inventoryCounts } from '../../src/actions.js';
import { uniqueTreeLogs } from './tree-targets.js';

const NATURAL_SOIL = new Set(['grass_block', 'dirt', 'coarse_dirt', 'podzol', 'rooted_dirt', 'mycelium']);
export function requireNaturalTree(bot, species) {
  const logs = bot.findBlocks({ maxDistance: 32, count: 128, matching: block => block.name.endsWith('_log') && (!species || block.name === `${species.replace(/_log$/, '')}_log`) }).map(position => bot.blockAt(position)).filter(Boolean);
  const tree = logs.find(block => {
    const below = bot.blockAt(block.position.offset(0, -1, 0));
    return below?.boundingBox === 'block' && !below.name.endsWith('_log') && !below.name.endsWith('_leaves');
  }) ?? logs[0];
  if (!tree) throw new Error('No tree is visible within 32 blocks.');
  if (!hasValidatedNativeMaterial(bot.version, tree.name)) throw new Error(`Gathering ${tree.name} still needs a validated native 26.3 adapter. Existing wood types remain supported.`);
  if (!NATURAL_SOIL.has(bot.blockAt(tree.position.offset(0, -1, 0))?.name)) throw new Error('Nearest logs are not rooted in natural soil. Move to a forest; player structures are protected.');
  const leaves = bot.findBlocks({ maxDistance: 32, count: 512, matching: block => block.name === tree.name.replace(/_log$/, '_leaves') });
  if (!leaves.some(position => position.distanceTo(tree.position) <= 8 && position.y > tree.position.y)) throw new Error('Nearest logs have no observed matching leaf canopy. They may be part of a structure.');
  return tree;
}

export function selectMiningTargets(bot, blockName, count, zone) {
  if (!zone) throw new Error('Approve a mining area in Companion settings before gathering blocks. This prevents mining your base by accident.');
  if (!hasValidatedNativeMaterial(bot.version, blockName)) throw new Error(`Gathering ${blockName} still needs validated 26.3 block metadata. Existing block types remain supported.`);
  const type = bot.registry.blocksByName[blockName];
  if (!type || type.hardness < 0 || ['air', 'cave_air', 'void_air', 'water', 'lava', 'tnt'].includes(blockName)) throw new Error('Choose a safe mineable block type.');
  const feet = bot.entity.position.floored();
  return bot.findBlocks({ matching: type.id, maxDistance: 32, count: 256 })
    .filter(position => Math.abs(position.x - zone.x) <= zone.radius && Math.abs(position.z - zone.z) <= zone.radius && Math.abs(position.y - zone.y) <= zone.radius)
    .filter(position => position.y >= feet.y && !(position.x === feet.x && position.z === feet.z && position.y <= feet.y))
    .sort((a, b) => a.distanceTo(bot.entity.position) - b.distanceTo(bot.entity.position))
    .slice(0, count).map(position => bot.blockAt(position)).filter(Boolean);
}

export function gatherApprovedBlocks(bot, actions, args, zone) {
  const targets = selectMiningTargets(bot, args.block, args.count, zone);
  return actions.run('gather_blocks', signal => collect(bot, targets, signal));
}

export function chopNaturalTrees(bot, actions, { count, species }) {
  return actions.run('chop_tree', async signal => {
    const gained = {};
    let mined = 0, trees = 0, blocked = null;
    while (mined < count) {
      signal.throwIfAborted();
      let root;
      try { root = requireNaturalTree(bot, species); }
      catch (error) { if (!mined) throw error; blocked = error.message; break; }
      const stackSize = bot.registry.itemsByName[root.name].stackSize;
      const capacity = bot.inventory.emptySlotCount() * stackSize + bot.inventory.items()
        .filter(item => item.name === root.name).reduce((sum, item) => sum + stackSize - item.count, 0);
      if (!capacity) { blocked = 'My inventory is full. Hand off or deposit some items first.'; break; }
      const result = await collect(bot, uniqueTreeLogs(bot, root, Math.min(count - mined, capacity)), signal);
      for (const [name, quantity] of Object.entries(result.gained)) gained[name] = (gained[name] ?? 0) + quantity;
      mined += result.mined; trees++;
      if (!result.mined || !result.success) { blocked = result.summary; break; }
    }
    const inventory = inventoryCounts(bot);
    const collected = Object.entries(gained).filter(([name]) => name.endsWith('_log')).reduce((sum, [, quantity]) => sum + quantity, 0);
    return { success: collected >= count, partial: collected > 0 && collected < count, mined, collected, requested: count, trees, gained, inventory, blocked,
      summary: `Collected ${Object.entries(gained).map(([name, quantity]) => `${quantity} ${name}`).join(', ') || 'no drops'} from ${trees} trees.${blocked ? ` ${blocked}` : ''}` };
  });
}
