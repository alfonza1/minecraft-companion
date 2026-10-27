import { collect } from '../../src/tools/play.js';

const NATURAL_SOIL = new Set(['grass_block', 'dirt', 'coarse_dirt', 'podzol', 'rooted_dirt', 'mycelium']);
export function requireNaturalTree(bot, species) {
  const logs = bot.findBlocks({ maxDistance: 32, count: 128, matching: block => block.name.endsWith('_log') && (!species || block.name === `${species.replace(/_log$/, '')}_log`) }).map(position => bot.blockAt(position)).filter(Boolean);
  const tree = logs.find(block => {
    const below = bot.blockAt(block.position.offset(0, -1, 0));
    return below?.boundingBox === 'block' && !below.name.endsWith('_log') && !below.name.endsWith('_leaves');
  }) ?? logs[0];
  if (!tree) throw new Error('No tree is visible within 32 blocks.');
  if (!NATURAL_SOIL.has(bot.blockAt(tree.position.offset(0, -1, 0))?.name)) throw new Error('Nearest logs are not rooted in natural soil. Move to a forest; player structures are protected.');
  const leaves = bot.findBlocks({ maxDistance: 32, count: 512, matching: block => block.name === tree.name.replace(/_log$/, '_leaves') });
  if (!leaves.some(position => position.distanceTo(tree.position) <= 8 && position.y > tree.position.y)) throw new Error('Nearest logs have no observed matching leaf canopy. They may be part of a structure.');
  return tree;
}

export function selectMiningTargets(bot, blockName, count, zone) {
  if (!zone) throw new Error('Approve a mining area in Companion settings before gathering blocks. This prevents mining your base by accident.');
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
