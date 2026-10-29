import { Vec3 } from 'vec3';
import { blueprintHash } from '../build-planner/blueprint.js';
import { EMPTY, fullCube, placementSupport, matchesPlacement, resumableSlab, placementKind, constructionCompatibility, placeAdaptedBlock } from './placement.js';
import { blockItem } from '../build-planner/blueprint.js';
import { dataFor } from '../../packages/minecraft-data/index.js';
import { confirmInventory } from '../skill-executor/items.js';
import { createScaffoldController } from './scaffolds.js';
import { assertConstructionScope } from './construction-plan.js';
export { placementSupport, matchesPlacement, constructionCompatibility } from './placement.js';

import { approach, occupied, abortableWait, canReachPlacement } from './site.js';
export { BUILD_PLACEMENT_TIMEOUT_MS } from './site.js';

export function validateOrigin(origin) {
  if (!origin || ['x', 'y', 'z'].some((a) => !Number.isSafeInteger(origin[a]))) throw new Error('Build origin requires integer x, y and z coordinates.');
  if (Math.abs(origin.x) > 29_999_800 || Math.abs(origin.z) > 29_999_800 || origin.y < -64 || origin.y > 319) throw new Error('Build origin is outside supported Java world bounds.');
  return { x: origin.x, y: origin.y, z: origin.z };
}


export async function executeBuild({ project, origin, bot, signal, save, publish = () => {}, realmId, ensureMaterials, cleanupOnly = false }) {
  validateOrigin(origin);
  if(project.checkpoint?.realmId!==undefined&&project.checkpoint.realmId!==realmId)throw new Error('This build checkpoint belongs to another Realm.');
  if (!project.blueprint || project.approvedRevision !== project.revision || project.approvedHash !== blueprintHash(project.blueprint)) throw new Error('Approve the current blueprint revision before construction.');
  if (!bot?.entity || !bot.inventory || !bot.pathfinder) throw new Error('Companion must be connected and spawned.');
  if (bot.version !== project.blueprint.version) throw new Error(`Blueprint version ${project.blueprint.version} differs from live bot ${bot.version}.`);
  const compatibility = constructionCompatibility(project.blueprint);
  if (!compatibility.supported) throw new Error(`${compatibility.limitation} Unsupported: ${compatibility.unsupported.join(', ')}.`);
  if (origin.y + project.blueprint.dimensions.y > (bot.game?.dimension === 'the_nether' ? 128 : 320)) throw new Error('Build exceeds the dimension height limit.');
  const dimension = String(bot.game?.dimension ?? 'unknown');
  assertConstructionScope(project, origin, bot, realmId);
  if (project.checkpoint?.origin && (JSON.stringify(origin) !== JSON.stringify(project.checkpoint.origin) || project.checkpoint.dimension !== dimension)) throw new Error('Existing checkpoint belongs to another site/dimension. Create a new revision before moving it.');
  const base = new Vec3(origin.x, origin.y, origin.z);
  const placements = project.blueprint.blocks;
  // Fail before changing the world if visible terrain conflicts. Air omitted
  // from a schematic never grants permission to clear an existing structure.
  for (const expected of cleanupOnly ? [] : placements) {
    const observed = bot.blockAt(base.offset(expected.x, expected.y, expected.z));
    if (!observed) throw new Error('Build area is not fully observed. Move close enough to load it, then retry.');
    if (!EMPTY.has(observed.name) && !matchesPlacement(observed, expected, { final: false }) && !resumableSlab(observed, expected)) throw new Error(`Existing ${observed.name} at ${observed.position} conflicts with the design. Clearing requires separate player approval and is not automatic.`);
  }
  const checkpoint = { origin, dimension, ...(realmId===undefined?{}:{realmId}), revision: project.revision, verified: [], status: 'building', updatedAt: new Date().toISOString() };
  const update = (status, reason) => {
    checkpoint.status = status;
    checkpoint.reason = reason ?? null;
    checkpoint.updatedAt = new Date().toISOString();
    project.checkpoint = structuredClone(checkpoint);
    project.status = status;
    save(project);
    publish();
  };
  update('building');
  const scaffolds = project.construction?.policy.scaffolding ? createScaffoldController({ project, bot, signal, save: () => update('building'), ensureMaterials }) : null;
  try {
    if (cleanupOnly) {
      if (!scaffolds) throw new Error('This project has no automatic scaffolds.');
      await scaffolds.cleanup(); update('paused', 'Temporary scaffolds removed. Construction can resume with the saved plan.');
      return { status: 'paused', scaffoldsRemoved: true };
    }
    const needsPlacement = placements.some(block => !matchesPlacement(bot.blockAt(base.offset(block.x, block.y, block.z)), block, { final: false }));
    if (scaffolds && needsPlacement) await scaffolds.build('access');
    let pending = placements.map((_, index) => index);
    while (pending.length) {
      let progress = false;
      const deferred = [];
      const shellPending = pending.some(index => !placements[index].name.endsWith('_door'));
      for (const index of pending) {
        signal.throwIfAborted();
        const expected = placements[index];
        const position = base.offset(expected.x, expected.y, expected.z);
        // Keep doorways open for access until the shell/roof is finished.
        if (expected.name.endsWith('_door') && shellPending) { deferred.push(index); continue; }
        let observed = bot.blockAt(position);
        if (!observed) throw new Error('Section unloaded; it cannot be marked verified.');
        if (!matchesPlacement(observed, expected, { final: false })) {
          if (!EMPTY.has(observed.name) && !resumableSlab(observed, expected)) throw new Error(`Block changed at ${position}; refusing to overwrite ${observed.name}.`);
          if (expected.properties?.half === 'upper') { deferred.push(index); continue; }
          if (!placementSupport(bot, position, expected) && scaffolds) await scaffolds.build('brace');
          if (!placementSupport(bot, position, expected)) { deferred.push(index); continue; }
          const requirement = blockItem(expected, dataFor(bot.version));
          const needed = resumableSlab(observed, expected) ? 1 : requirement.quantity;
          if (ensureMaterials) {
            checkpoint.phase = 'materials'; update('building');
            await ensureMaterials(expected, needed, signal);
            signal.throwIfAborted();
          }
          const usable = bot.inventory.items().filter(candidate => candidate.name === requirement.name && !candidate.customName && !candidate.enchants?.length);
          const owned = usable.reduce((sum, item) => sum + item.count, 0);
          if (owned < needed) throw new Error(`Need ${needed} ${requirement.name} in the bot inventory. Check approved supply chests or hand over materials, then resume.`);
          const item = usable[0];
          checkpoint.phase = 'placing'; update('building');
          const height = placementKind(expected, bot.version) === 'door' ? 2 : 1;
          await approach(bot, position, signal, height);
          signal.throwIfAborted();
          if (!canReachPlacement(bot, position)) throw new Error('Cannot reach placement without scaffolding.');
          if (occupied(bot, position, height)) throw new Error('An entity occupies the placement space. Move clear and resume.');
          let support = placementSupport(bot, position, expected);
          if (!support) throw new Error(`No safe full-cube support at ${position}. Scaffolding needs a separate tested plan.`);
          await abortableWait(() => bot.equip(item, 'hand'), signal, bot);
          signal.throwIfAborted();
          // Recheck after every awaited operation; a pause or another player may
          // have changed the target during navigation/equipping.
          observed = bot.blockAt(position);
          if (!observed || (!EMPTY.has(observed.name) && !resumableSlab(observed, expected))) throw new Error('Placement target changed during approach; revalidate before resuming.');
          support = placementSupport(bot, position, expected);
          if (!support || occupied(bot, position, height)) throw new Error('Placement support or occupied space changed during approach. Resume after inspection.');
          if (height === 2 && !EMPTY.has(bot.blockAt(position.offset(0, 1, 0))?.name)) throw new Error('Door upper space changed; refusing to replace it.');
          const checkSpace = () => {
            const current = bot.blockAt(position);
            if (!current || (!EMPTY.has(current.name) && !(support.merge && resumableSlab(current, expected)))) throw new Error('Placement target changed while aiming.');
            const reference = bot.blockAt(support.reference.position);
            if (reference?.name !== support.reference.name || reference?.stateId !== support.reference.stateId) throw new Error('Placement support changed while aiming.');
            if (occupied(bot, position, height) || (height === 2 && !EMPTY.has(bot.blockAt(position.offset(0, 1, 0))?.name))) throw new Error('Placement space changed while aiming.');
          };
          await abortableWait(scopedSignal => placeAdaptedBlock(bot, expected, position, support, scopedSignal, checkSpace), signal, bot);
          signal.throwIfAborted();
          // A block update can precede its inventory packet. Flush before the
          // next demand/reservation decision, particularly the last item in a stack.
          if (bot._syncWindow && bot.supportFeature?.('stateIdUsed')) await confirmInventory(bot);
          signal.throwIfAborted();
          observed = bot.blockAt(position);
          if (project.reservations?.[requirement.name]) project.reservations[requirement.name]--;
          if (resumableSlab(observed, expected)) { deferred.push(index); progress = true; update('building'); continue; }
          if (!matchesPlacement(observed, expected, { final: false })) throw new Error(`Server did not confirm ${expected.name} at ${position}. Section remains unverified.`);
        }
        if (matchesPlacement(bot.blockAt(position), expected)) checkpoint.verified.push(index);
        progress = true;
        update('building');
      }
      if (!progress) throw new Error(`No reachable placement support for ${placements[deferred[0]].name}. Add the required support or scaffolding and resume; existing structures are protected.`);
      pending = deferred;
    }
    // A prior verified placement might have been removed while we built later
    // rows. Completion is based on a fresh pass through observed world state.
    if (scaffolds) await scaffolds.cleanup();
    checkpoint.verified = placements.flatMap((expected, index) => matchesPlacement(bot.blockAt(base.offset(expected.x, expected.y, expected.z)), expected) ? [index] : []);
    if (checkpoint.verified.length !== placements.length) throw new Error('Final verification found unloaded or changed blocks. Resume to revalidate.');
    update('complete');
    return { verified: checkpoint.verified.length, total: placements.length, status: 'complete' };
  } catch (error) {
    update(signal.aborted ? 'paused' : 'blocked', error.message);
    throw error;
  } finally {
    scaffolds?.close();
    bot.pathfinder?.stop();
    bot.pathfinder?.setGoal(null);
    bot.clearControlStates?.();
  }
}
