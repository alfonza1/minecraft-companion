import { requireSafeWork, valuableCargo, storeSurplus, explorationSteps } from './survival.js';
import { navigateWithRecovery } from './navigation.js';

const SOURCE_BLOCKS = { scaffolding: ['bamboo'], string: ['cobweb'], glass: ['sand'], diamond: ['diamond_ore', 'deepslate_diamond_ore'], iron_ingot: ['iron_ore', 'deepslate_iron_ore'], coal: ['coal_ore', 'deepslate_coal_ore'], cocoa_beans: ['cocoa'] };
export async function findResource(service, { item, radius = 48, steps = 6 }, signal) {
  const bot = requireSafeWork(service, signal, { roam: true });
  const names = SOURCE_BLOCKS[item] ?? [item.endsWith('_planks')?item.replace('_planks','_log'):item];
  const matching = names.map(name => bot.registry.blocksByName[name]?.id).filter(Number.isInteger);
  if (!matching.length) throw new Error(`I don't have a safe block-source search for ${item.replaceAll('_', ' ')}. That may need trading, mob drops or another production step.`);
  if (bot.game.dimension !== 'overworld') throw new Error('Resource scouting currently stays on the Overworld surface.');
  if (valuableCargo(bot)) { await storeSurplus(service, signal); if (valuableCargo(bot)) throw new Error('My valuables still need approved storage before scouting.'); }
  const anchor = bot.entity.position.clone(), visited = [anchor.floored().toString()];
  let found;
  const safe = () => {
    requireSafeWork(service, signal, { roam: true });
    if (bot.time?.timeOfDay > 13000 && bot.time.timeOfDay < 23000) throw new Error('I’ll need daylight for a safe resource search.');
  };
  for (let step = 0; step <= steps; step++) {
    safe();
    const positions = bot.findBlocks({ matching, point: anchor, maxDistance: radius, count: 16 });
    found = positions.map(position => bot.blockAt(position)).find(block => block && bot.canSeeBlock(block));
    if (found || step === steps) break;
    const next = explorationSteps(bot, anchor, radius, visited)[0]; if (!next) break;
    await navigateWithRecovery(bot, next, 1, signal); visited.push(next.toString());
  }
  if (found) {
    const { x, y, z } = found.position;
    service.store.put('resourceLocations', { id: `${service.store.settings().realmId}:${bot.game.dimension}:${found.name}:${x},${y},${z}`, item, block: found.name, position: { x, y, z }, realmId: service.store.settings().realmId, dimension: bot.game.dimension, provenance: 'observed', at: new Date().toISOString() });
  }
  safe(); await navigateWithRecovery(bot, anchor, 1, signal); service.publish();
  return { success: Boolean(found), requested: item, source: found?.name, position: found ? { x: found.position.x, y: found.position.y, z: found.position.z } : null, visited: visited.length - 1,
    summary: found ? `Found ${found.name.replaceAll('_', ' ')} at ${found.position}. I saved the location and came back. I haven't harvested it or verified ownership.` : `I checked ${visited.length - 1} safe surface waypoints within ${radius} blocks and came back. I didn't see ${names.join(' or ').replaceAll('_', ' ')}; that doesn't mean there isn't any farther away. Give me a nearby known location or handle this supply yourself.` };
}
