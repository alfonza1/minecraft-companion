import { createHash } from 'node:crypto';
import { dataFor, validateBlockProperties } from '../../packages/minecraft-data/index.js';

export const BLUEPRINT_LIMITS = Object.freeze({ axis: 128, volume: 262_144, placements: 50_000 });
const AIR = new Set(['air', 'cave_air', 'void_air']);

export function validateBlueprint(input) {
  if (!input || typeof input !== 'object') throw new Error('Blueprint must be a JSON object.');
  const data = dataFor(input.version);
  const dimensions = {};
  for (const axis of ['x', 'y', 'z']) {
    const n = input.dimensions?.[axis];
    if (!Number.isInteger(n) || n < 1 || n > BLUEPRINT_LIMITS.axis) throw new Error(`Dimension ${axis} must be 1–${BLUEPRINT_LIMITS.axis}.`);
    dimensions[axis] = n;
  }
  if (dimensions.x * dimensions.y * dimensions.z > BLUEPRINT_LIMITS.volume) throw new Error('Blueprint volume exceeds the local safety limit.');
  if (!Array.isArray(input.blocks) || input.blocks.length > BLUEPRINT_LIMITS.placements) throw new Error(`Blueprint supports at most ${BLUEPRINT_LIMITS.placements} placements.`);
  if (!['schematic', 'reconstructed', 'estimated'].includes(input.provenance)) throw new Error('Blueprint provenance is required.');
  const uncertainties = input.uncertainties ?? [];
  if (!Array.isArray(uncertainties) || uncertainties.length > 100 || uncertainties.some((x) => typeof x !== 'string' || x.length > 1000)) throw new Error('Invalid blueprint uncertainties.');
  const occupied = new Set();
  const blocks = input.blocks.map((value) => {
    if (!value || typeof value !== 'object') throw new Error('Invalid block placement.');
    const block = {};
    for (const axis of ['x', 'y', 'z']) {
      if (!Number.isInteger(value[axis]) || value[axis] < 0 || value[axis] >= dimensions[axis]) throw new Error(`Block ${axis} is outside the blueprint.`);
      block[axis] = value[axis];
    }
    const key = `${block.x},${block.y},${block.z}`;
    if (occupied.has(key)) throw new Error(`Duplicate block coordinate ${key}.`);
    occupied.add(key);
    const name = typeof value.name === 'string' ? value.name.replace(/^minecraft:/, '') : '';
    const definition = data.blocksByName[name];
    if (!Object.hasOwn(data.blocksByName, name) || definition?.name !== name || AIR.has(name)) throw new Error(`Unknown or non-placeable blueprint block ${name.slice(0, 120)}. Air is implicit; clearing is never inferred.`);
    block.name = name;
    block.properties = validateBlockProperties(definition, value.properties);
    if (value.section !== undefined && (typeof value.section !== 'string' || value.section.length > 80)) throw new Error('Invalid building section name.');
    block.section = value.section || 'Structure';
    return block;
  });
  blocks.sort((a, b) => a.y - b.y || a.z - b.z || a.x - b.x);
  return { version: input.version, dimensions, blocks, provenance: input.provenance, uncertainties: [...uncertainties] };
}

export function blueprintHash(blueprint) {
  return createHash('sha256').update(JSON.stringify(blueprint)).digest('hex');
}

export function blockItem(block, data) {
  if (block.properties?.half === 'upper' || (block.name.endsWith('_bed') && block.properties?.part === 'head')) return { name: null, quantity: 0 };
  let name = block.name.replace(/^wall_torch$/, 'torch').replace(/^soul_wall_torch$/, 'soul_torch').replace(/^redstone_wall_torch$/, 'redstone_torch')
    .replace(/_wall_sign$/, '_sign').replace(/_wall_hanging_sign$/, '_hanging_sign');
  const item = data.itemsByName[name];
  if (!Object.hasOwn(data.itemsByName, name) || item?.name !== name) return null;
  return { name, quantity: block.name.endsWith('_slab') && block.properties?.type === 'double' ? 2 : 1 };
}
