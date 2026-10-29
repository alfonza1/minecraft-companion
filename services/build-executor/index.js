import { Vec3 } from 'vec3';
import pathfinder from 'mineflayer-pathfinder';
import { blueprintHash } from '../build-planner/blueprint.js';
import { EMPTY, fullCube, placementSupport, matchesPlacement, resumableSlab, placementKind, constructionCompatibility, placeAdaptedBlock } from './placement.js';
import { blockItem } from '../build-planner/blueprint.js';
import { dataFor } from '../../packages/minecraft-data/index.js';
import { confirmInventory } from '../skill-executor/items.js';
export { placementSupport, matchesPlacement, constructionCompatibility } from './placement.js';

const { goals } = pathfinder;
export const BUILD_PLACEMENT_TIMEOUT_MS = 10_000;

export function validateOrigin(origin) {
  if (!origin || ['x', 'y', 'z'].some((a) => !Number.isSafeInteger(origin[a]))) throw new Error('Build origin requires integer x, y and z coordinates.');
  if (Math.abs(origin.x) > 29_999_800 || Math.abs(origin.z) > 29_999_800 || origin.y < -64 || origin.y > 319) throw new Error('Build origin is outside supported Java world bounds.');
  return { x: origin.x, y: origin.y, z: origin.z };
}

function occupied(bot, position, height = 1) {
  return [bot.entity, ...Object.values(bot.entities ?? {})].some(entity => entity?.position &&
    Math.abs(entity.position.x - position.x - 0.5) < 0.8 && Math.abs(entity.position.z - position.z - 0.5) < 0.8 &&
    entity.position.y < position.y + height && entity.position.y + (entity.height ?? 1.8) > position.y);
}

async function approach(bot, position, signal, height) {
  // Reuse a safe working position instead of running A* for every adjacent block.
  if (bot.entity.position.distanceTo(position) <= 4 && !occupied(bot, position, height)) return;
  const candidates = [];
  for (let y = -2; y <= 1; y++) for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) {
    const feet = position.offset(x, y, z);
    if (Math.abs(x) + Math.abs(z) < 2 || feet.offset(0.5, 0, 0.5).distanceTo(position) > 4) continue;
    if (!fullCube(bot.blockAt(feet.offset(0, -1, 0))) || !EMPTY.has(bot.blockAt(feet)?.name) || !EMPTY.has(bot.blockAt(feet.offset(0, 1, 0))?.name)) continue;
    candidates.push(feet);
  }
  candidates.sort((a, b) => a.distanceTo(bot.entity.position) - b.distanceTo(bot.entity.position));
  for (const feet of candidates.slice(0, 3)) {
    try {
      await abortableWait(() => bot.pathfinder.goto(new goals.GoalBlock(feet.x, feet.y, feet.z)), signal, bot);
      if (bot.entity.position.distanceTo(position) <= 4 && !occupied(bot, position, height)) return;
    } catch (error) { signal.throwIfAborted(); }
  }
  throw new Error('Cannot reach a safe working position. Add a walkway or scaffolding and resume.');
}

function abortableWait(operation, signal, bot) {
  signal.throwIfAborted();
  const scoped = new AbortController();
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      signal.removeEventListener('abort', aborted);
      error ? reject(error) : resolve(result);
    };
    const stop = error => { scoped.abort(error); bot.pathfinder?.stop(); bot.pathfinder?.setGoal(null); finish(error); };
    const aborted = () => stop(signal.reason ?? new Error('Build cancelled.'));
    const timeout = setTimeout(() => stop(new Error('Placement/navigation timed out; checkpoint preserved.')), BUILD_PLACEMENT_TIMEOUT_MS);
    signal.addEventListener('abort', aborted, { once: true });
    Promise.resolve().then(() => { scoped.signal.throwIfAborted(); return operation(scoped.signal); }).then((result) => finish(null, result), (error) => finish(error));
  });
}

export async function executeBuild({ project, origin, bot, signal, save, publish = () => {}, realmId, ensureMaterials }) {
  validateOrigin(origin);
  if(project.checkpoint?.realmId!==undefined&&project.checkpoint.realmId!==realmId)throw new Error('This build checkpoint belongs to another Realm.');
  if (!project.blueprint || project.approvedRevision !== project.revision || project.approvedHash !== blueprintHash(project.blueprint)) throw new Error('Approve the current blueprint revision before construction.');
  if (!bot?.entity || !bot.inventory || !bot.pathfinder) throw new Error('Companion must be connected and spawned.');
  if (bot.version !== project.blueprint.version) throw new Error(`Blueprint version ${project.blueprint.version} differs from live bot ${bot.version}.`);
  const compatibility = constructionCompatibility(project.blueprint);
  if (!compatibility.supported) throw new Error(`${compatibility.limitation} Unsupported: ${compatibility.unsupported.join(', ')}.`);
  if (origin.y + project.blueprint.dimensions.y > (bot.game?.dimension === 'the_nether' ? 128 : 320)) throw new Error('Build exceeds the dimension height limit.');
  const dimension = String(bot.game?.dimension ?? 'unknown');
  if (project.checkpoint?.origin && (JSON.stringify(origin) !== JSON.stringify(project.checkpoint.origin) || project.checkpoint.dimension !== dimension)) throw new Error('Existing checkpoint belongs to another site/dimension. Create a new revision before moving it.');
  const base = new Vec3(origin.x, origin.y, origin.z);
  const placements = project.blueprint.blocks;
  // Fail before changing the world if visible terrain conflicts. Air omitted
  // from a schematic never grants permission to clear an existing structure.
  for (const expected of placements) {
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
  try {
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
          if (bot.entity.position.distanceTo(position) > 4.5) throw new Error('Cannot reach placement without scaffolding.');
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
    checkpoint.verified = placements.flatMap((expected, index) => matchesPlacement(bot.blockAt(base.offset(expected.x, expected.y, expected.z)), expected) ? [index] : []);
    if (checkpoint.verified.length !== placements.length) throw new Error('Final verification found unloaded or changed blocks. Resume to revalidate.');
    update('complete');
    return { verified: checkpoint.verified.length, total: placements.length, status: 'complete' };
  } catch (error) {
    update(signal.aborted ? 'paused' : 'blocked', error.message);
    throw error;
  } finally {
    bot.pathfinder?.stop();
    bot.pathfinder?.setGoal(null);
    bot.clearControlStates?.();
  }
}
