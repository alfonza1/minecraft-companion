import pathfinder from 'mineflayer-pathfinder';
import { setTimeout as delay } from 'node:timers/promises';
import { EMPTY, fullCube } from './placement.js';
import { MAX_NAVIGATION_ATTEMPTS } from '../skill-executor/navigation.js';
const { goals } = pathfinder;
export const BUILD_PLACEMENT_TIMEOUT_MS = 10_000;
export async function digConstructionBlock(bot, block, signal) {
  await abortableWait(async scoped => {
    await bot.lookAt(block.position.offset(0.5, 0.5, 0.5), true);
    await bot.waitForTicks(2);
    scoped.throwIfAborted();
    if (bot.blockAt(block.position)?.stateId !== block.stateId || occupied(bot, block.position, 3)) throw new Error('Mining target changed or supports an entity; construction stopped safely.');
    // Mineflayer predicts air locally when its mining timer expires. Require an
    // actual server packet before declaring removal or advancing a checkpoint.
    let confirmed = false;
    const isAir = stateId => EMPTY.has(bot.registry.blocksByStateId[stateId]?.name);
    const changed = packet => { if (block.position.equals(packet.location) && isAir(packet.type)) confirmed = true; };
    const changedMany = packet => {
      const chunk = packet.chunkCoordinates;
      if (!chunk || !bot.supportFeature('usesMultiblockSingleLong')) return;
      for (const record of packet.records) if (block.position.x === chunk.x * 16 + ((record >> 8) & 15) && block.position.y === chunk.y * 16 + (record & 15) && block.position.z === chunk.z * 16 + ((record >> 4) & 15) && isAir(record >> 12)) confirmed = true;
    };
    bot._client.on('block_change', changed); bot._client.on('multi_block_change', changedMany);
    const stop = () => bot.stopDigging();
    scoped.addEventListener('abort', stop, { once: true });
    try {
      await bot.dig(block, 'ignore');
      while (!confirmed) await delay(25, undefined, { signal: scoped });
      scoped.throwIfAborted();
    } finally {
      scoped.removeEventListener('abort', stop);
      bot._client.removeListener('block_change', changed); bot._client.removeListener('multi_block_change', changedMany);
    }
  }, signal, bot);
  signal.throwIfAborted();
}
export function occupied(bot, position, height = 1) {
  return [bot.entity, ...Object.values(bot.entities ?? {})].some(entity => entity?.position && !['item', 'experience_orb'].includes(entity.name) &&
    Math.abs(entity.position.x - position.x - 0.5) < 0.8 && Math.abs(entity.position.z - position.z - 0.5) < 0.8 &&
    entity.position.y < position.y + height && entity.position.y + (entity.height ?? 1.8) > position.y);
}
export function canReachPlacement(bot, position) {
  return bot.entity.position.offset(0, bot.entity.eyeHeight ?? 1.62, 0).distanceTo(position.offset(0.5, 0.5, 0.5)) <= 4.5;
}

export async function approach(bot, position, signal, height, allowedFeet = () => true) {
  // Reuse a safe working position instead of running A* for every adjacent block.
  if (allowedFeet(bot.entity.position.floored()) && canReachPlacement(bot, position) && !occupied(bot, position, height)) return;
  const candidates = [];
  for (let y = -4; y <= 1; y++) for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) {
    const feet = position.offset(x, y, z);
    if (!allowedFeet(feet)) continue;
    if (Math.abs(x) + Math.abs(z) < 2 || feet.offset(0.5, bot.entity.eyeHeight ?? 1.62, 0.5).distanceTo(position.offset(0.5, 0.5, 0.5)) > 3.75) continue;
    if (!fullCube(bot.blockAt(feet.offset(0, -1, 0))) || !EMPTY.has(bot.blockAt(feet)?.name) || !EMPTY.has(bot.blockAt(feet.offset(0, 1, 0))?.name)) continue;
    candidates.push(feet);
  }
  candidates.sort((a, b) => a.distanceTo(bot.entity.position) - b.distanceTo(bot.entity.position));
  let lastError;
  for (let attempt = 0; candidates.length && attempt < MAX_NAVIGATION_ATTEMPTS; attempt++) {
    try {
      const goal = new goals.GoalCompositeAny(candidates.slice(0, 64).map(feet => new goals.GoalBlock(feet.x, feet.y, feet.z)));
      await abortableWait(() => bot.pathfinder.goto(goal), signal, bot);
      if (allowedFeet(bot.entity.position.floored()) && canReachPlacement(bot, position) && !occupied(bot, position, height)) return;
    } catch (error) { signal.throwIfAborted(); lastError = error.message; }
    bot.pathfinder.stop(); bot.pathfinder.setGoal(null); bot.clearControlStates?.();
    if (attempt + 1 < MAX_NAVIGATION_ATTEMPTS) await delay(150, undefined, { signal });
  }
  throw new Error(`Cannot reach a safe working position for ${position} from ${bot.entity.position.floored()}. ${lastError ?? `${candidates.length} observed standing positions tried.`} Add a walkway or scaffolding and resume.`);
}

export function abortableWait(operation, signal, bot) {
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
