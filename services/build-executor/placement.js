import { Vec3 } from 'vec3';
import { setTimeout as delay } from 'node:timers/promises';
import { dataFor, hasValidatedNativeMaterial } from '../../packages/minecraft-data/index.js';

export const EMPTY = new Set(['air', 'cave_air', 'void_air']);
const INTERACTIVE = /(?:chest|furnace|crafting_table|enchanting_table|anvil|barrel|loom|cartography_table|stonecutter|smithing_table|note_block|jukebox|respawn_anchor|shulker_box|bee_nest|beehive)$/;
const AXIS_BLOCK = /(?:_log|_wood|_stem|_hyphae)$|^(?:hay_block|bone_block|quartz_pillar|purpur_pillar|basalt|polished_basalt)$/;
export const FACES = [new Vec3(0, 1, 0), new Vec3(1, 0, 0), new Vec3(-1, 0, 0), new Vec3(0, 0, 1), new Vec3(0, 0, -1), new Vec3(0, -1, 0)];
const YAW = { north: 0, east: Math.PI * 1.5, south: Math.PI, west: Math.PI / 2 };
const DIRECTIONS = { north: new Vec3(0, 0, -1), east: new Vec3(1, 0, 0), south: new Vec3(0, 0, 1), west: new Vec3(-1, 0, 0) };
const CONFIRM_TIMEOUT_MS = 2500;

export function fullCube(block) {
  return block?.boundingBox === 'block' && block.shapes?.some(shape => shape.every((value, i) => value === (i < 3 ? 0 : 1)));
}

export function placementKind(block, version) {
  const data = dataFor(version), definition = data.blocksByName[block.name], properties = block.properties ?? {};
  if (!definition || !hasValidatedNativeMaterial(version, block.name) || !data.itemsByName[block.name]) return null;
  if (['waterlogged', 'open', 'powered'].some(key => String(properties[key]) === 'true')) return null;
  if (block.name.endsWith('_stairs')) return 'stairs';
  if (block.name.endsWith('_slab')) return 'slab';
  if (block.name.endsWith('_door')) return 'door';
  if (AXIS_BLOCK.test(block.name) && definition.states?.some(state => state.name === 'axis')) return 'axis';
  if (block.name.endsWith('_fence') || block.name.endsWith('_glass_pane') || block.name === 'glass_pane' || block.name === 'iron_bars') return 'connected';
  const shape = data.blockCollisionShapes?.shapes?.[data.blockCollisionShapes?.blocks?.[block.name]];
  if (Array.isArray(shape) && shape.length === 1 && shape[0].every((n, i) => n === (i < 3 ? 0 : 1)) && definition.boundingBox === 'block' && !definition.states?.length && definition.material !== 'plant' && !INTERACTIVE.test(block.name) && !['sand', 'red_sand', 'gravel', 'dragon_egg', 'tnt'].includes(block.name) && !block.name.endsWith('_concrete_powder')) return 'cube';
  return null;
}

export function matchesPlacement(observed, expected, { final = true } = {}) {
  if (!observed || observed.name !== expected.name) return false;
  const properties = observed.getProperties?.() ?? {};
  if (String(properties.waterlogged) === 'true' || (expected.name.endsWith('_door') && ['open', 'powered'].some(key => String(properties[key]) === 'true'))) return false;
  return Object.entries(expected.properties ?? {}).every(([key, value]) => {
    // Neighbour-derived states settle as later blocks arrive, but are required
    // during the final world pass before any section is called complete.
    if (!final && ((expected.name.endsWith('_stairs') && key === 'shape') ||
      ((expected.name.endsWith('_fence') || expected.name.endsWith('glass_pane') || expected.name === 'iron_bars') && Object.hasOwn(DIRECTIONS, key)))) return true;
    return String(properties[key]) === String(value);
  });
}

export function resumableSlab(observed, expected) {
  return expected.name.endsWith('_slab') && expected.properties?.type === 'double' && observed?.name === expected.name &&
    ['bottom', 'top'].includes(observed.getProperties?.().type) && String(observed.getProperties?.().waterlogged) !== 'true';
}

export function constructionCompatibility(blueprint) {
  const byPosition = new Map(blueprint.blocks.map(block => [`${block.x},${block.y},${block.z}`, block]));
  const unsupported = [], issues = [];
  for (const block of blueprint.blocks) {
    const kind = placementKind(block, blueprint.version);
    if (!kind) unsupported.push(block.name);
    if (kind === 'door') {
      const half = block.properties?.half;
      const mate = byPosition.get(`${block.x},${block.y + (half === 'lower' ? 1 : -1)},${block.z}`);
      if (!['lower', 'upper'].includes(half) || !mate || mate.name !== block.name || mate.properties?.half !== (half === 'lower' ? 'upper' : 'lower') ||
        ['facing', 'hinge', 'open', 'powered'].some(key => String(mate.properties?.[key] ?? '') !== String(block.properties?.[key] ?? ''))) {
        unsupported.push(block.name); issues.push(`Door at ${block.x},${block.y},${block.z} needs matching lower and upper halves in the blueprint.`);
      }
    }
  }
  return { supported: unsupported.length === 0, unsupported: [...new Set(unsupported)], issues,
    limitation: 'Supports inert cubes, dry stairs/slabs, paired closed doors, oriented logs/pillars, fences and glass panes. A prepared automatic worksite can add temporary access and braces, gather common raw materials and craft supplies. Terrain clearing, unsupported decorations and destructive repairs remain disabled.' };
}

export function placementSupport(bot, position, expected = { name: 'stone' }) {
  const kind = placementKind(expected, bot.version), properties = expected.properties ?? {};
  const existing = bot.blockAt(position);
  if (resumableSlab(existing, expected)) return { reference: existing, face: new Vec3(0, existing.getProperties().type === 'top' ? -1 : 1, 0), merge: true };
  const top = (kind === 'stairs' && properties.half === 'top') || (kind === 'slab' && properties.type === 'top');
  for (const face of FACES) {
    if (kind === 'door' && face.y !== 1) continue;
    if ((kind === 'stairs' || kind === 'slab') && (top ? face.y === 1 : face.y === -1)) continue;
    if (kind === 'axis' && Math.abs(face[properties.axis || 'y']) !== 1) continue;
    const reference = bot.blockAt(position.minus(face));
    if (fullCube(reference) && !INTERACTIVE.test(reference.name)) return { reference, face };
  }
  return null;
}

export async function placeAdaptedBlock(bot, expected, position, support, signal, checkSpace = () => {}, onSent = () => {}) {
  signal.throwIfAborted();
  const kind = placementKind(expected, bot.version), properties = expected.properties ?? {};
  if (kind === 'cube' && typeof bot._genericPlace !== 'function') return bot.placeBlock(support.reference, support.face);
  if (typeof bot._genericPlace !== 'function') throw new Error('Installed client lacks the tested shaped-block placement adapter.');
  const face = support.face;
  const delta = new Vec3(0.5 + face.x * 0.5, 0.5 + face.y * 0.5, 0.5 + face.z * 0.5);
  if (!face.y) delta.y = (properties.half === 'top' || properties.type === 'top') ? 0.75 : 0.25;
  if (kind === 'door') {
    // Click on the desired hinge side. Neighbour blocks/doors can override it;
    // actual server state is checked, never silently accepted or dug back out.
    const facing = DIRECTIONS[properties.facing || 'north'];
    const right = new Vec3(-facing.z, 0, facing.x);
    const side = properties.hinge === 'right' ? 0.3 : -0.3;
    delta.x += right.x * side; delta.z += right.z * side;
  }
  if (kind === 'stairs' || kind === 'door') await bot.look(YAW[properties.facing || 'north'], 0, true);
  else await bot.lookAt(support.reference.position.plus(delta), true);
  // force=true updates the physics sender, not the server immediately. Wait
  // for its next tick so placement cannot use the previous heading.
  await bot.waitForTicks(2);
  signal.throwIfAborted();
  checkSpace();
  // Pinned Mineflayer's placeBlock waits for a type change, which cannot confirm
  // two slabs merging. Keep its packet encoder, own state confirmation here.
  await bot._genericPlace(support.reference, face, { delta, forceLook: 'ignore', swingArm: 'right' });
  onSent();
  const deadline = Date.now() + CONFIRM_TIMEOUT_MS;
  while (Date.now() < deadline) {
    signal.throwIfAborted();
    const observed = bot.blockAt(position);
    if (matchesPlacement(observed, expected, { final: false }) || (!support.merge && resumableSlab(observed, expected))) return;
    await delay(50, undefined, { signal });
  }
  const actual = bot.blockAt(position);
  throw new Error(`Server did not confirm the requested ${expected.name} state at ${position}. Observed ${actual?.name ?? 'unloaded'} ${JSON.stringify(actual?.getProperties?.() ?? {})}; requested ${JSON.stringify(properties)}. Placement is unverified; inspect before resuming.`);
}
