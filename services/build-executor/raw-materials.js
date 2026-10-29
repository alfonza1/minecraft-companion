import { setTimeout as delay } from 'node:timers/promises';
import { Vec3 } from 'vec3';
import pathfinder from 'mineflayer-pathfinder';
import { navigateWithRecovery } from '../skill-executor/navigation.js';
import { uniqueTreeLogs } from '../skill-executor/tree-targets.js';
import { equipFastestTool, waitForMiningFooting } from '../../src/mining.js';
import { confirmInventory } from '../skill-executor/items.js';
import { CONSTRUCTION_LIMITS, vector } from './construction-plan.js';
import { digConstructionBlock, abortableWait } from './site.js';
import { requestMaterial } from '../resource-ledger/material-requests.js';
import { companionPerformance } from '../companion-runtime/performance.js';

export const RAW_BUILD_SOURCES = Object.freeze({ oak_log: ['oak_log'], spruce_log: ['spruce_log'], birch_log: ['birch_log'], cobblestone: ['stone', 'cobblestone'], dirt: ['dirt'], sand: ['sand'] });
const SOIL = new Set(['grass_block', 'dirt', 'coarse_dirt', 'podzol', 'rooted_dirt', 'mycelium']);
const HOSTILES = /^(zombie|skeleton|creeper|spider|drowned|husk|stray|witch|pillager|phantom|warden|blaze|hoglin|piglin_brute)$/;
const stock = (bot, name) => bot.inventory.items().filter(item => item.name === name).reduce((sum, item) => sum + item.count, 0);

export function requireSafeConstructionTrip(bot, signal) {
  signal.throwIfAborted();
  if (bot.health < 12 || bot.food < 8 || bot.entity.isInLava || bot.entity.isInWater || bot.game.dimension !== 'overworld') throw new Error('Construction gathering needs safe Overworld footing, at least six hearts and four hunger icons. Check food and threats before resuming.');
  if (bot.time?.timeOfDay > 13000 && bot.time.timeOfDay < 23000) throw new Error('Construction gathering waits for daylight. The checkpoint is saved.');
  if (Object.values(bot.entities ?? {}).some(entity => entity.isValid !== false && HOSTILES.test(entity.name) && entity.position.distanceTo(bot.entity.position) < 12)) throw new Error('Hostiles are too close for a construction supply trip.');
}

export function protectedResourcePosition(store, project, position) {
  const scope = project.construction;
  return store.get('projects').some(other => {
    const site = other.construction ?? other.checkpoint;
    if (!site || site.realmId !== scope.realmId || site.dimension !== scope.dimension || !other.blueprint) return false;
    const { origin } = site, dimensions = other.blueprint.dimensions;
    return position.x >= origin.x - 4 && position.x <= origin.x + dimensions.x + 4 && position.z >= origin.z - 4 && position.z <= origin.z + dimensions.z + 4;
  }) || store.get('locations').some(place => /^(home|base)$/i.test(place.name) && place.realmId === scope.realmId && place.dimension === scope.dimension && vector(place.position).distanceTo(position) < 16);
}

function miningArea(store, project) {
  return store.get('workAreas').find(area => area.id === 'mining' && area.realmId === project.construction.realmId && area.dimension === project.construction.dimension);
}
function inArea(position, area) {
  return area && ['x', 'y', 'z'].every(axis => Math.abs(position[axis] - area.position[axis]) <= area.radius);
}

export function rawTargets(bot, store, project, name, count) {
  if (!RAW_BUILD_SOURCES[name]) return [];
  const origin = vector(project.construction.origin), wood = name.endsWith('_log');
  const area = wood ? null : miningArea(store, project);
  if (!wood && !area) throw new Error('Approve a mining area once in Companion → Safe mining area. Construction will only mine common materials inside that Realm/dimension boundary.');
  const matching = RAW_BUILD_SOURCES[name].map(value => bot.registry.blocksByName[value]?.id).filter(Number.isInteger);
  const sites = { projects: store.get('projects'), locations: store.get('locations') };
  const observedSites = { get: collection => sites[collection] };
  // Filter before the library truncates results: buried stone around the base
  // must not crowd the approved surface source out of the candidate limit.
  const eligible = block => !protectedResourcePosition(observedSites, project, block.position) && (wood || (inArea(block.position, area) && block.position.y >= bot.entity.position.y - 0.1));
  const positions = bot.findBlocks({ point: origin, matching, useExtraInfo: eligible, maxDistance: CONSTRUCTION_LIMITS.resourceRadius, count: 512 });
  const blocks = positions.filter(p => !protectedResourcePosition(store, project, p) && (wood || inArea(p, area)))
    .map(p => bot.blockAt(p)).filter(Boolean).sort((a, b) => a.position.distanceTo(bot.entity.position) - b.position.distanceTo(bot.entity.position));
  if (!wood) return blocks.filter(block => block.position.y >= bot.entity.position.y - 0.1).slice(0, count);
  for (const root of blocks) {
    if (!SOIL.has(bot.blockAt(root.position.offset(0, -1, 0))?.name)) continue;
    const leaves = bot.findBlocks({ point: root.position, matching: bot.registry.blocksByName[name.replace('_log', '_leaves')]?.id, maxDistance: 8, count: 64 });
    if (!leaves.some(p => p.y > root.position.y)) continue;
    const logs = uniqueTreeLogs(bot, root, count);
    if (logs.every(block => !protectedResourcePosition(store, project, block.position))) return logs;
  }
  return [];
}

export function createRawGatherer({ project, bot, store, save, teammate }) {
  const allowance = (name, temporary) => {
    if (temporary || project.construction.policy.takeOverShares) return CONSTRUCTION_LIMITS.gatherBatch;
    const latest = store.get('projects').find(value => value.id === project.id) ?? project;
    const assignment = latest.assignments?.find(value => value.material === name);
    if (!assignment) return 0;
    return Math.max(0, Math.min(assignment.aiRequired, assignment.total - (assignment.userProgress ?? 0)) - (project.construction.startingAssignedStock?.[name] ?? 0) - (project.construction.mined[name] ?? 0));
  };
  return async (name, needed, signal, { temporary = false } = {}) => {
    if (!project.construction?.policy.gatherMaterials || !RAW_BUILD_SOURCES[name]) return 0;
    requireSafeConstructionTrip(bot, signal);
    if (store.settings().realmId !== project.construction.realmId || bot.game.dimension !== project.construction.dimension) throw new Error('Construction resource scope changed. Prepare a plan for the current Realm/dimension.');
    const ledger = project.construction;
    ledger.supportMined ??= {}; ledger.supportGathered ??= {};
    if (ledger.rawIntent) {
      const intent = ledger.rawIntent, observed = bot.blockAt(vector(intent.position));
      if (!observed) throw new Error('An interrupted mining target is unloaded. Reobserve the source before resuming supplies.');
      if (observed.name !== intent.sourceName) {
        const key = intent.temporary ? 'supportMined' : 'mined';
        ledger[key][intent.name] = (ledger[key][intent.name] ?? 0) + 1;
      }
      ledger.rawIntent = null; save(project);
    }
    const count = Math.min(needed, allowance(name, temporary), CONSTRUCTION_LIMITS.gatherBatch);
    if (count <= 0) throw requestMaterial({ store, project, teammate, item:name, count:needed, available:stock(bot,name), reason:'This is covered by your assigned share. Report a deposit or change the split if you want me to gather it.' });
    if (bot.inventory.emptySlotCount() < 2) throw new Error('Construction supply trip needs two free inventory slots. Put away unrelated cargo and resume.');
    const worksite = vector(project.construction.origin);
    // Descend using the saved access ramp before searching/mining ground-level
    // resources. Never dig the platform under the bot to get down.
    if (bot.entity.position.y > worksite.y + 1) await navigateWithRecovery(bot, worksite.offset(-3, 0, -2), 1, signal);
    const before = stock(bot, name), targets = rawTargets(bot, store, project, name, count);
    if (!targets.length) throw requestMaterial({ store, project, teammate, item:name, count:needed, available:stock(bot,name), reason:'I cannot see a safe source within 64 blocks of this worksite. I saved the construction checkpoint.' });
    const family = name.endsWith('_log') ? 'axe' : name === 'cobblestone' ? 'pickaxe' : 'shovel';
    // The chest service enforces the user's per-item permissions and excludes
    // rare, named, enchanted and nearly broken replacement tools.
    if (teammate) await teammate.withdraw([{ name:`iron_${family}`, count:1 }],signal);
    project.construction.phase = `gathering ${name}`; save(project);
    const sources = [];
    try {
      for (const target of targets) {
        requireSafeConstructionTrip(bot, signal);
        if (allowance(name, temporary) <= 0) break;
        if (protectedResourcePosition(store, project, target.position) || (!name.endsWith('_log') && !inArea(target.position, miningArea(store, project)))) throw new Error('Resource permission changed during the supply trip.');
        if (!bot.canDigBlock(target)) await navigateWithRecovery(bot, target.position, 3, signal);
        requireSafeConstructionTrip(bot, signal);
        const actual = bot.blockAt(target.position);
        if (actual?.name !== target.name || actual.position.y < Math.floor(bot.entity.position.y)) continue;
        await waitForMiningFooting(bot, signal); await equipFastestTool(bot, actual, signal, { minimumDurability:16 });
        const held = bot.heldItem, durability = bot.registry.itemsByName[held?.name]?.maxDurability;
        if (durability && durability - (held.durabilityUsed ?? 0) < 16) throw new Error('My tool is nearly worn out. Restock a replacement before resuming construction.');
        if (name.endsWith('_log') && !held?.name.endsWith('_axe')) throw new Error('Automatic construction gathering needs an axe for trees.');
        if (name === 'cobblestone' && held?.enchants?.some(enchantment => enchantment.name === 'silk_touch')) throw new Error('A non-Silk-Touch pickaxe is needed for construction cobblestone.');
        const movements = bot.pathfinder.movements, old = movements.canDig;
        // Query safety synchronously; navigation never receives permission to
        // excavate unrelated route blocks or the user's structures.
        let safe;
        try { movements.canDig = true; safe = movements.safeToBreak(actual); }
        finally { movements.canDig = old; }
        if (!safe) throw new Error(`Unsafe liquid, falling block or entity near ${actual.name}; supply trip stopped.`);
        signal.throwIfAborted();
        if (store.settings().realmId !== ledger.realmId || bot.game.dimension !== ledger.dimension || allowance(name, temporary) <= 0 || protectedResourcePosition(store, project, actual.position) || (!name.endsWith('_log') && !inArea(actual.position, miningArea(store, project)))) throw new Error('Construction resource permission changed before digging.');
        project.construction.rawIntent = { name, sourceName: actual.name, temporary, position: { x: actual.position.x, y: actual.position.y, z: actual.position.z }, before: stock(bot, name) }; save(project);
        await companionPerformance.measure('mining', () => digConstructionBlock(bot, actual, signal));
        if (bot.blockAt(actual.position)?.name === actual.name) throw new Error('The server did not confirm resource removal.');
        sources.push(actual.position);
        const minedKey = temporary ? 'supportMined' : 'mined';
        ledger[minedKey][name] = (ledger[minedKey][name] ?? 0) + 1;
        project.construction.rawIntent = null; save(project); signal.throwIfAborted();
      }
      await delay(150, undefined, { signal });
      for (const entity of Object.values(bot.entities ?? {}).filter(entity => entity.name === 'item' && sources.some(p => p.distanceTo(entity.position) < 3))) {
        requireSafeConstructionTrip(bot, signal);
        if (entity.isValid === false) continue;
        try {
          // Drops move and merge while falling. Follow the live entity, as the
          // tested tree skill does, instead of chasing a stale fractional cell.
          await abortableWait(() => bot.pathfinder.goto(new pathfinder.goals.GoalFollow(entity, 0)), signal, bot);
        } catch (error) {
          signal.throwIfAborted();
          if (entity.isValid !== false && bot.entities[entity.id]) {
            try { await navigateWithRecovery(bot, entity.position.floored(), 1, signal); }
            catch (retryError) {
              signal.throwIfAborted();
              if (!/path|reach|timeout|timed out|stuck/i.test(retryError.message)) throw retryError;
              // A stranded common-material drop must not discard confirmed
              // pickups elsewhere in this batch. Zero gain still stops below.
            }
          }
        } finally { bot.pathfinder.setGoal(null); }
        for (let tick = 0; tick < 8 && entity.isValid !== false; tick++) await delay(50, undefined, { signal });
      }
      await delay(200, undefined, { signal }); await confirmInventory(bot);
    } finally {
      const gained = Math.max(0, stock(bot, name) - before);
      const gatheredKey = temporary ? 'supportGathered' : 'gathered';
      ledger[gatheredKey][name] = (ledger[gatheredKey][name] ?? 0) + gained; save(project);
    }
    signal.throwIfAborted();
    const gained = Math.max(0, stock(bot, name) - before);
    if (!gained) throw new Error(`No ${name} pickup was confirmed. Construction gathering stopped instead of repeatedly mining.`);
    return gained;
  };
}
