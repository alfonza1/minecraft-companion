import { Vec3 } from 'vec3';
import pathfinder from 'mineflayer-pathfinder';
import { dataFor } from '../../packages/minecraft-data/index.js';
import { blueprintHash } from '../build-planner/blueprint.js';

const { goals } = pathfinder;
const FACES = [new Vec3(0, 1, 0), new Vec3(1, 0, 0), new Vec3(-1, 0, 0), new Vec3(0, 0, 1), new Vec3(0, 0, -1), new Vec3(0, -1, 0)];
const EMPTY = new Set(['air', 'cave_air', 'void_air']);
const INTERACTIVE = /(?:chest|furnace|crafting_table|enchanting_table|anvil|barrel|loom|cartography_table|stonecutter|smithing_table|note_block|jukebox|respawn_anchor|shulker_box|bee_nest|beehive)$/;
export const BUILD_PLACEMENT_TIMEOUT_MS = 10_000;

export function validateOrigin(origin) {
  if (!origin || ['x', 'y', 'z'].some((a) => !Number.isSafeInteger(origin[a]))) throw new Error('Build origin requires integer x, y and z coordinates.');
  if (Math.abs(origin.x) > 29_999_800 || Math.abs(origin.z) > 29_999_800 || origin.y < -64 || origin.y > 319) throw new Error('Build origin is outside supported Java world bounds.');
  return { x: origin.x, y: origin.y, z: origin.z };
}

export function placementSupport(bot, position) {
  for (const face of FACES) {
    const reference = bot.blockAt(position.minus(face));
    if (reference && reference.boundingBox === 'block' && !INTERACTIVE.test(reference.name) && reference.shapes?.some((s) => s.every((n, i) => n === (i < 3 ? 0 : 1)))) return { reference, face };
  }
  return null;
}

export function matchesPlacement(observed, expected) {
  if (!observed || observed.name !== expected.name) return false;
  const properties = observed.getProperties?.() ?? {};
  return Object.entries(expected.properties ?? {}).every(([key, value]) => String(properties[key]) === String(value));
}

export function constructionCompatibility(blueprint) {
  const data = dataFor(blueprint.version);
  const unsupported = [...new Set(blueprint.blocks.filter((block) => {
    const definition = data.blocksByName[block.name];
    const shapeId = data.blockCollisionShapes?.blocks?.[block.name];
    const shape = data.blockCollisionShapes?.shapes?.[shapeId];
    const cube = Array.isArray(shape) && shape.length === 1 && shape[0].every((n, i) => n === (i < 3 ? 0 : 1));
    return !data.itemsByName[block.name] || !cube || definition.boundingBox !== 'block' || definition.states?.length || definition.material === 'plant' || INTERACTIVE.test(block.name) || ['sand', 'red_sand', 'gravel', 'dragon_egg', 'tnt'].includes(block.name) || block.name.endsWith('_concrete_powder');
  }).map((b) => b.name))];
  return { supported: unsupported.length === 0, unsupported, limitation: 'Survival placement currently supports inert, full cubes. Oriented/multiblock/gravity/interactive blocks require a tested placement adapter. No excavation, scaffolding or inventory resupply is automatic.' };
}

function abortableWait(operation, signal, bot) {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      signal.removeEventListener('abort', aborted);
      error ? reject(error) : resolve(result);
    };
    const aborted = () => { bot.pathfinder?.stop(); bot.pathfinder?.setGoal(null); finish(signal.reason ?? new Error('Build cancelled.')); };
    const timeout = setTimeout(() => { bot.pathfinder?.stop(); bot.pathfinder?.setGoal(null); finish(new Error('Placement/navigation timed out; checkpoint preserved.')); }, BUILD_PLACEMENT_TIMEOUT_MS);
    signal.addEventListener('abort', aborted, { once: true });
    Promise.resolve().then(() => { signal.throwIfAborted(); return operation(); }).then((result) => finish(null, result), (error) => finish(error));
  });
}

export async function executeBuild({ project, origin, bot, signal, save, publish = () => {} }) {
  validateOrigin(origin);
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
    if (!EMPTY.has(observed.name) && !matchesPlacement(observed, expected)) throw new Error(`Existing ${observed.name} at ${observed.position} conflicts with the design. Clearing requires separate player approval and is not automatic.`);
  }
  const checkpoint = { origin, dimension, revision: project.revision, verified: [], status: 'building', updatedAt: new Date().toISOString() };
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
    for (let index = 0; index < placements.length; index++) {
      signal.throwIfAborted();
      const expected = placements[index];
      const position = base.offset(expected.x, expected.y, expected.z);
      let observed = bot.blockAt(position);
      if (!observed) throw new Error('Section unloaded; it cannot be marked verified.');
      if (!matchesPlacement(observed, expected)) {
        if (!EMPTY.has(observed.name)) throw new Error(`Block changed at ${position}; refusing to overwrite ${observed.name}.`);
        const item = bot.inventory.items().find((candidate) => candidate.name === expected.name);
        if (!item) throw new Error(`Need ${expected.name} in the bot inventory. Resupply and resume.`);
        await abortableWait(() => bot.pathfinder.goto(new goals.GoalNear(position.x, position.y, position.z, 3)), signal, bot);
        signal.throwIfAborted();
        if (bot.entity.position.distanceTo(position) > 4.5) throw new Error('Cannot reach placement without scaffolding.');
        const occupant = Object.values(bot.entities ?? {}).find((entity) => entity.position && entity.type === 'player' && Math.abs(entity.position.x - position.x - 0.5) < 0.8 && Math.abs(entity.position.z - position.z - 0.5) < 0.8 && entity.position.y < position.y + 1 && entity.position.y + (entity.height ?? 1.8) > position.y);
        const self = bot.entity.position;
        if (occupant || (Math.abs(self.x - position.x - 0.5) < 0.8 && Math.abs(self.z - position.z - 0.5) < 0.8 && self.y < position.y + 1 && self.y + 1.8 > position.y)) throw new Error('A player occupies the placement space. Move clear and resume.');
        const support = placementSupport(bot, position);
        if (!support) throw new Error(`No safe full-cube support at ${position}. Scaffolding needs a separate tested plan.`);
        await abortableWait(() => bot.equip(item, 'hand'), signal, bot);
        signal.throwIfAborted();
        // Recheck after every awaited operation; a pause or another player may
        // have changed the target during navigation/equipping.
        observed = bot.blockAt(position);
        if (!observed || !EMPTY.has(observed.name)) throw new Error('Placement target changed during approach; revalidate before resuming.');
        await abortableWait(() => { signal.throwIfAborted(); return bot.placeBlock(support.reference, support.face); }, signal, bot);
        signal.throwIfAborted();
        observed = bot.blockAt(position);
        if (!matchesPlacement(observed, expected)) throw new Error(`Server did not confirm ${expected.name} at ${position}. Section remains unverified.`);
        if (project.reservations?.[expected.name]) project.reservations[expected.name]--;
      }
      checkpoint.verified.push(index);
      update('building');
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
