import test from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { Schematic } from 'prismarine-schematic';
import nbt from 'prismarine-nbt';
import { Vec3 } from 'vec3';
import { dataFor } from '../packages/minecraft-data/index.js';
import { parseSchematic, validateMedia, youtubeId, youtubeReference } from '../services/reference-ingestion/index.js';
import { calculateMaterials } from '../services/build-planner/materials.js';

const version = '1.21.11';
async function schematicBytes() {
  const data = dataFor(version);
  const schematic = new Schematic(version, new Vec3(2, 1, 1), new Vec3(0, 0, 0), [data.blocksByName.oak_planks.defaultState], [0, 0]);
  return schematic.write();
}

test('real Sponge schematic parser returns exact stored blueprint and bill of materials', async () => {
  const blueprint = await parseSchematic(await schematicBytes(), version);
  assert.equal(blueprint.provenance, 'schematic');
  assert.equal(blueprint.blocks.length, 2);
  assert.deepEqual(blueprint.dimensions, { x: 2, y: 1, z: 1 });
  assert.equal(calculateMaterials(blueprint).placed[0].quantity, 2);
});

test('malformed NBT, decompression bombs, palette substitution and truncated arrays are rejected', async () => {
  await assert.rejects(parseSchematic(Buffer.from('not a schematic'), version), /rejected/);
  await assert.rejects(parseSchematic(gzipSync(Buffer.alloc(17 * 1024 * 1024)), version), /rejected/);
  const { parsed } = await nbt.parse(await schematicBytes());
  parsed.value.Palette = { type: 'compound', value: { 'minecraft:not_a_real_block': { type: 'int', value: 0 } } };
  await assert.rejects(parseSchematic(nbt.writeUncompressed(parsed), version), /unknown\/modded/);
  const good = (await nbt.parse(await schematicBytes())).parsed;
  good.value.BlockData.value = [0];
  await assert.rejects(parseSchematic(nbt.writeUncompressed(good), version), /does not match/);
});

test('schematic block version mismatch is explicit rather than silently converted', async () => {
  const { parsed } = await nbt.parse(await schematicBytes());
  parsed.value.DataVersion.value = 1;
  await assert.rejects(parseSchematic(nbt.writeUncompressed(parsed), version), /DataVersion/);
});

test('untrusted uploads reject active content, MIME mismatches and oversized images', () => {
  assert.throws(() => validateMedia(Buffer.from('<svg onload="evil">'), 'image/svg+xml'), /Allowed/);
  assert.throws(() => validateMedia(Buffer.from('not png'), 'image/png'), /signature/);
  assert.throws(() => validateMedia(Buffer.alloc(9 * 1024 * 1024), 'image/png'), /8 MiB/);
  assert.equal(validateMedia(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), 'image/png'), '.png');
});

test('YouTube reference accepts public URL only and fetches bounded oEmbed metadata, never the video', async () => {
  assert.equal(youtubeId('https://youtu.be/dQw4w9WgXcQ?t=12'), 'dQw4w9WgXcQ');
  for (const url of ['http://youtube.com/watch?v=dQw4w9WgXcQ', 'https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ', 'https://127.0.0.1/watch?v=dQw4w9WgXcQ', 'https://user:secret@youtube.com/watch?v=dQw4w9WgXcQ']) assert.throws(() => youtubeId(url));
  let fetched;
  const reference = await youtubeReference('https://youtu.be/dQw4w9WgXcQ', async (url) => { fetched = url; return new Response(JSON.stringify({ title: 'Mansion tutorial', author_name: 'Builder' })); });
  assert.match(fetched, /^https:\/\/www.youtube.com\/oembed\?/);
  assert.equal(reference.title, 'Mansion tutorial');
  assert.equal(reference.analysis.status, 'metadata-only');
  assert.equal(reference.analysis.confidence, 'unknown');
});
