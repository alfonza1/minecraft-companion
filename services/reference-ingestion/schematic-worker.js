import { parentPort, workerData } from 'node:worker_threads';
import { gunzipSync } from 'node:zlib';
import nbt from 'prismarine-nbt';
import { Schematic } from 'prismarine-schematic';
import { dataFor, validateBlockProperties } from '../../packages/minecraft-data/index.js';
import { BLUEPRINT_LIMITS, validateBlueprint } from '../build-planner/blueprint.js';

try {
  let buffer = Buffer.from(workerData.buffer);
  if (buffer[0] === 0x1f && buffer[1] === 0x8b) buffer = gunzipSync(buffer, { maxOutputLength: 16 * 1024 * 1024 });
  if (buffer.length > 16 * 1024 * 1024) throw new Error('Decompressed schematic exceeds 16 MiB.');
  let root = nbt.parseUncompressed(buffer, 'big');
  if (root.value.Schematic?.type === 'compound') root = root.value.Schematic;
  const simple = nbt.simplify(root);
  const dimensions = { x: simple.Width, y: simple.Height, z: simple.Length };
  const volume = dimensions.x * dimensions.y * dimensions.z;
  if (Object.values(dimensions).some((n) => !Number.isInteger(n) || n < 1 || n > BLUEPRINT_LIMITS.axis) || volume > BLUEPRINT_LIMITS.volume) throw new Error('Schematic dimensions exceed supported limits.');
  if (![1, 2, 3].includes(simple.Version)) throw new Error('Only Sponge schematics v1–v3 are supported. MCEdit and Litematica conversion is not silently approximated.');
  const data = dataFor(workerData.version);
  if (simple.DataVersion !== undefined && (!Number.isInteger(simple.DataVersion) || simple.DataVersion !== data.version.dataVersion)) throw new Error(`Schematic DataVersion ${simple.DataVersion} differs from Minecraft ${workerData.version}. Import into a matching version project.`);
  const palette = simple.Palette ?? simple.Blocks?.Palette;
  const blockData = simple.BlockData ?? simple.Blocks?.Data;
  if (!palette || typeof palette !== 'object' || !Array.isArray(blockData) || Object.keys(palette).length > BLUEPRINT_LIMITS.placements) throw new Error('Schematic palette or block data is invalid.');
  const paletteIds = new Set();
  for (const [text, id] of Object.entries(palette)) {
    if (!Number.isInteger(id) || id < 0 || id >= Object.keys(palette).length || paletteIds.has(id)) throw new Error('Palette IDs must be unique and contiguous.');
    paletteIds.add(id);
    const match = text.match(/^minecraft:([a-z0-9_]+)(?:\[([a-z0-9_=,]+)\])?$/);
    if (!match || !Object.hasOwn(data.blocksByName, match[1]) || data.blocksByName[match[1]].name !== match[1]) throw new Error('Schematic contains unknown/modded blocks; substitution is forbidden.');
    const properties = {};
    if (match[2]) for (const pair of match[2].split(',')) {
      const parts = pair.split('=');
      if (parts.length !== 2 || properties[parts[0]] !== undefined) throw new Error('Malformed schematic block state.');
      properties[parts[0]] = parts[1];
    }
    validateBlockProperties(data.blocksByName[match[1]], properties);
    if (data.blocksByName[match[1]].states.some((state) => properties[state.name] === undefined)) throw new Error('Stateful palette entries require all block properties; defaults must not be guessed.');
  }
  // Validate every VarInt before invoking the library, which otherwise accepts
  // truncated arrays or quietly substitutes missing palette entries with air.
  let offset = 0;
  let count = 0;
  while (offset < blockData.length) {
    let value = 0;
    let shift = 0;
    let byte;
    do {
      if (offset >= blockData.length || shift >= 35) throw new Error('Invalid schematic block VarInt.');
      byte = blockData[offset++] & 255;
      value += (byte & 127) * 2 ** shift;
      shift += 7;
    } while (byte & 128);
    if (!paletteIds.has(value)) throw new Error('Schematic references a missing palette entry.');
    count++;
    if (count > volume) throw new Error('Schematic has extra block data.');
  }
  if (count !== volume) throw new Error('Schematic block data does not match its dimensions.');
  if (simple.Version === 3) {
    // The installed stable prismarine-schematic API reads v1/v2. Normalize v3
    // container field names without converting block IDs or inventing states.
    root = { type: 'compound', name: 'Schematic', value: { ...root.value, Palette: root.value.Blocks.value.Palette, BlockData: root.value.Blocks.value.Data, Version: { type: 'int', value: 2 } } };
    delete root.value.Blocks;
    buffer = nbt.writeUncompressed(root);
  } else buffer = nbt.writeUncompressed(root);
  const schematic = await Schematic.read(buffer, workerData.version);
  const blocks = [];
  await schematic.forEach((block, position) => {
    if (['air', 'cave_air', 'void_air'].includes(block.name)) return;
    if (blocks.length >= BLUEPRINT_LIMITS.placements) throw new Error('Too many non-air placements.');
    blocks.push({ x: position.x - schematic.offset.x, y: position.y - schematic.offset.y, z: position.z - schematic.offset.z, name: block.name, properties: block.getProperties(), section: 'Imported structure' });
  });
  const blueprint = validateBlueprint({ version: workerData.version, dimensions, blocks, provenance: 'schematic', uncertainties: ['Exact placed-block counts for imported design. Air is omitted and never authorizes clearing. Block entities, container contents and entities are excluded.', ...(simple.DataVersion === undefined ? ['Source DataVersion is absent. Project target version was selected explicitly; block names and states were validated against that release.'] : [])] });
  parentPort.postMessage({ blueprint });
} catch (error) {
  parentPort.postMessage({ error: `Schematic rejected: ${error.message}` });
}
