import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../services/memory/store.js';
import { createApp } from '../services/api/index.js';

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'companion-api-'));
  const app = await createApp({ store: new Store(directory), skipExtensions: true });
  await app.ready(); t.after(async () => { await app.close(); await rm(directory, { recursive: true, force: true }); });
  return app;
}
test('real API returns disconnected observations and no invented inventory or usage', async t => {
  const app = await fixture(t);
  const state = (await app.inject('/api/state')).json();
  assert.equal(state.state, 'DISCONNECTED'); assert.equal(state.world, null); assert.deepEqual(state.projects, []); assert.equal(state.usage.requests, 0);
  assert.equal(JSON.stringify(state).includes('accessToken'), false);
  const health = (await app.inject('/api/health')).json();
  if (health.supportedVersions.includes('26.3')) assert.equal(health.limitations.some(text => text.includes('requires the optional protocol bridge')), false);
});

test('observer API retains localhost and pause boundaries without model requests', async t => {
  const app = await fixture(t);
  assert.equal((await app.inject('/api/extensions')).json()[0].id, 'inventory-summary');
  const run = { method: 'POST', url: '/api/extensions/inventory-summary/run', payload: {} };
  assert.equal((await app.inject(run)).statusCode, 409);
  assert.equal((await app.inject({ ...run, headers: { host: 'attacker.example', origin: 'https://attacker.example' } })).statusCode, 403);
  app.companion.runtime.state = 'ACTIVE';
  assert.deepEqual((await app.inject(run)).json(), { observed: false, items: [] });
  assert.equal((await app.inject({ ...run, payload: { search: 7 } })).statusCode, 400);
  app.companion.runtime.state = 'PAUSED';
  assert.equal((await app.inject(run)).statusCode, 409);
  assert.equal((await app.inject('/api/state')).json().usage.requests, 0);
});
test('API enforces localhost host and browser origin for HTTP and WebSocket upgrade paths', async t => {
  const app = await fixture(t);
  for (const url of ['/api/state', '/api/events']) {
    const evil = await app.inject({ url, headers: { host: 'attacker.example', origin: 'http://attacker.example' } }); assert.equal(evil.statusCode, 403);
    const cross = await app.inject({ url, headers: { host: '127.0.0.1:4365', origin: 'https://evil.example' } }); assert.equal(cross.statusCode, 403);
  }
  const form = await app.inject({ method: 'POST', url: '/api/control', headers: { 'content-type': 'text/plain' }, payload: '{"command":"start"}' });
  assert.equal(form.statusCode, 415);
});
test('API validates settings, persists memory, protects paused controls and serves local Minecraft textures', async t => {
  const app = await fixture(t);
  const bad = await app.inject({ method: 'POST', url: '/api/settings', payload: { password: 'not-accepted' } }); assert.equal(bad.statusCode, 400);
  const invalidPace = await app.inject({ method: 'POST', url: '/api/settings', payload: { movementSpeed: 'teleport' } }); assert.equal(invalidPace.statusCode, 400);
  const saved = await app.inject({ method: 'POST', url: '/api/settings', payload: { playerName: 'PlayerOne', voice: { speed: 1.1 } } }); assert.equal(saved.statusCode, 200);
  assert.equal(saved.json().voice.speed, 1.1);
  const memory = await app.inject({ method: 'POST', url: '/api/memories', payload: { label: 'Base', value: '100, 64, -12' } }); assert.equal(memory.statusCode, 200);
  assert.equal(memory.json().provenance, 'user-reported');
  const remove = await app.inject({ method: 'POST', url: '/api/memories/delete', payload: { id: memory.json().id } }); assert.equal(remove.statusCode, 200);
  const resume = await app.inject({ method: 'POST', url: '/api/control', payload: { command: 'resume' } }); assert.equal(resume.statusCode, 409);
  const asset = await app.inject('/api/assets/item/oak_log'); assert.equal(asset.statusCode, 200); assert.equal(asset.headers['content-type'], 'image/png');
});

test('26.3 item imagery uses a named visual-only fallback without changing game state', async t => {
  const app = await fixture(t), runtime = app.companion.runtime;
  runtime.connection.version = '26.3';
  const before = structuredClone({ connection: runtime.connection, world: runtime.world, state: runtime.state });
  for (const name of ['oak_log', 'iron_pickaxe', 'cobblestone']) {
    const response = await app.inject(`/api/assets/item/${name}`);
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.headers['content-type'], 'image/png');
    assert.equal(response.headers['x-asset-catalog'], '26.1');
    assert.equal(response.headers['x-asset-fallback'], 'true');
    assert.equal(response.rawPayload.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  }
  assert.equal((await app.inject('/api/assets/block/oak_log')).statusCode, 200);
  for (const path of ['item/new_item_without_a_texture', 'item/../../package.json', 'item/oak%2Flog', 'item/constructor', 'item/__proto__', 'item/OAK_LOG', 'unknown/oak_log']) {
    const response = await app.inject(`/api/assets/${path}`);
    assert.equal(response.statusCode, 404, path);
    assert.notEqual(response.headers['content-type'], 'image/png');
  }
  assert.deepEqual({ connection: runtime.connection, world: runtime.world, state: runtime.state }, before);
  assert.equal(runtime.state, 'DISCONNECTED');
  runtime.connection.version = '26.1';
  const nativeCatalog = await app.inject('/api/assets/item/oak_log');
  assert.equal(nativeCatalog.statusCode, 200);
  assert.equal(nativeCatalog.headers['x-asset-fallback'], 'false');
});

test('workspace and companion routes retain host and origin protection', async t => {
  const app = await fixture(t);
  for (const url of ['/api/games', '/api/companion/export']) {
    assert.equal((await app.inject({url, headers:{host:'localhost',origin:'https://evil.example'}})).statusCode, 403);
  }
  for (const [url,payload] of [
    ['/api/companion/profile',{name:'Unwanted change'}],
    ['/api/companion/mode',{mode:'autonomous'}],
    ['/api/workspace/game',{gameId:'minecraft-survival'}],
    ['/api/workspace/assistance/test',{action:'player',revision:0}],
  ]) {
    assert.equal((await app.inject({method:'POST',url,payload,headers:{host:'localhost',origin:'https://evil.example'}})).statusCode,403);
  }
  assert.equal((await app.inject('/api/companion/profile')).json().name,'Waypoint');
  assert.equal((await app.inject('/api/state')).json().usage.requests,0);
});
