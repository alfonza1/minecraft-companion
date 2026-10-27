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
  const saved = await app.inject({ method: 'POST', url: '/api/settings', payload: { playerName: 'PlayerOne', voice: { speed: 1.1 } } }); assert.equal(saved.statusCode, 200);
  assert.equal(saved.json().voice.speed, 1.1);
  const memory = await app.inject({ method: 'POST', url: '/api/memories', payload: { label: 'Base', value: '100, 64, -12' } }); assert.equal(memory.statusCode, 200);
  assert.equal(memory.json().provenance, 'user-reported');
  const remove = await app.inject({ method: 'POST', url: '/api/memories/delete', payload: { id: memory.json().id } }); assert.equal(remove.statusCode, 200);
  const resume = await app.inject({ method: 'POST', url: '/api/control', payload: { command: 'resume' } }); assert.equal(resume.statusCode, 409);
  const asset = await app.inject('/api/assets/item/oak_log'); assert.equal(asset.statusCode, 200); assert.equal(asset.headers['content-type'], 'image/png');
});
