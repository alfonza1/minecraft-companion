import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../services/memory/store.js';
import { createApp } from '../services/api/index.js';
import { RealmConnector } from '../services/realm-connector/index.js';
import { startBridge, bridgeSourcesHash } from '../services/protocol-bridge/index.js';
import { observeWorld } from '../services/world-state/index.js';
import { authorizeSession } from '../services/realm-connector/session-join.js';
import { installMovementTickBoundary } from '../services/protocol-bridge/client.js';

test('setup checks actual readiness without starting inference, microphone or a Minecraft connection', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'companion-setup-'));
  let refreshed = 0;
  const app = await createApp({ store: new Store(directory), skipExtensions: true, readiness: {
    codex: () => ({ available: true, authenticated: false, version: 'fixture' }),
    voice: () => ({ available: false, status: 'setup-required' }),
    refresh: async () => { refreshed++; },
  } });
  t.after(async () => { await app.close(); await rm(directory, { recursive: true, force: true }); });
  const initial = (await app.inject('/api/setup')).json();
  assert.equal(initial.checkedAt, null); assert.equal(initial.auth.status, 'disconnected');
  assert.equal(initial.codex.authenticated, false); assert.equal(initial.voice.available, false);
  const checked = await app.inject({ method: 'POST', url: '/api/setup/check', payload: {} });
  assert.equal(checked.statusCode, 200); assert.ok(checked.json().checkedAt); assert.equal(refreshed, 1);
  const denied = await app.inject({ method: 'POST', url: '/api/realms/check', payload: { realmId: 1 } });
  assert.equal(denied.statusCode, 409); assert.match(denied.json().error, /licensed/);
  const invalid = await app.inject({ method: 'POST', url: '/api/realms/check', payload: { realmId: 0 } });
  assert.equal(invalid.statusCode, 400);
  const state = (await app.inject('/api/state')).json();
  assert.equal(state.state, 'DISCONNECTED'); assert.equal(state.world, null); assert.equal(state.usage.requests, 0);
  assert.equal(JSON.stringify(checked.json()).includes('accessToken'), false);
});

test('Realm compatibility distinguishes native, translated and unknown protocol identities', () => {
  const connector = new RealmConnector(tmpdir());
  const native = connector.recordCompatibility(1, { protocol: 754, version: '1.16.5' });
  assert.equal(native.status, 'native'); assert.equal(native.clientVersion, '1.16.5');
  const modern = connector.recordCompatibility(1, { protocol: 777, version: '26.3' });
  assert.equal(modern.serverVersion, '26.3'); assert.equal(modern.clientVersion, '26.1');
  assert.ok(['bridge', 'unsupported'].includes(modern.status));
  const unknown = connector.recordCompatibility(2, { protocol: 99999, version: 'future' });
  assert.equal(unknown.status, 'unsupported'); assert.equal(unknown.clientVersion, null);
});

test('pause during secure preparation cleanup cannot initiate a late native Microsoft login', async () => {
  const connector = new RealmConnector(tmpdir());
  let release, closing = false, created = 0;
  const cleanup = new Promise(resolve => { release = resolve; });
  connector.resolveRealm = async () => ({ protocol: 754, version: '1.16.5', close: async () => { closing = true; await cleanup; } });
  connector.createNativeBot = () => { created++; return {}; };
  const pending = connector.createBot(1);
  const denied = assert.rejects(pending, /abort/i);
  await new Promise(resolve => setImmediate(resolve)); assert.equal(closing, true);
  await connector.cancelAuth(); release(); await denied;
  assert.equal(created, 0); assert.equal(connector.pendingConnections.size, 0);
});

test('bridge rejects untrusted destinations and profiles before starting Java', async () => {
  assert.match(bridgeSourcesHash(), /^[a-f0-9]{64}$/);
  for (const host of ['evil:443', '127.0.0.1/path', '$(command)', '-bad host']) {
    await assert.rejects(startBridge({ host, port: 25565, serverVersion: '26.3' }), /destination/);
  }
  await assert.rejects(startBridge({ host: '127.0.0.1', port: 25565, serverVersion: '26.3', profile: { id: 'bad', name: 'test' } }), /profile/);
});

test('translated live inventory is explicitly projected rather than exact server identity', () => {
  const bot = { minenessReady: true, version: '26.1', companionTransport: { projected: true, serverVersion: '26.3' },
    entity: { id: 1, position: { x: 0, y: 64, z: 0 } }, inventory: { slots: [], items: () => [{ name: 'stone', count: 4 }] }, registry: {} };
  const world = observeWorld(bot);
  assert.equal(world.inventoryExact, false); assert.equal(world.provenance, 'observed-client-projection');
  assert.equal(world.serverVersion, '26.3'); assert.equal(world.clientVersion, '26.1'); assert.equal(world.inventory[0].count, 4);
});

test('secure session adapter uses only the fixed Mojang endpoint and never propagates provider secrets', async () => {
  const session = { token: 'test-secret-not-a-real-token', profile: { id: 'a'.repeat(32) } };
  let calls = 0;
  await authorizeSession(session, '-abcd', async (url, options) => {
    calls++; assert.equal(url, 'https://sessionserver.mojang.com/session/minecraft/join');
    assert.equal(options.redirect, 'error'); assert.equal(options.method, 'POST');
    assert.deepEqual(JSON.parse(options.body), { accessToken: session.token, selectedProfile: session.profile.id, serverId: '-abcd' });
    assert.ok(options.signal instanceof AbortSignal); return { ok: true };
  });
  assert.equal(calls, 1);
  await assert.rejects(authorizeSession(session, 'https://evil.example'), /Invalid/);
  await assert.rejects(authorizeSession(session, 'abcd', async () => { throw new Error(session.token); }), error => !error.message.includes(session.token) && /authorization failed/.test(error.message));
  await assert.rejects(authorizeSession(session, 'abcd', async () => ({ ok: false })), /authorization failed/);
});

test('26.3 transport closes every outgoing movement tick without changing coordinates or inventory traffic', () => {
  const packets = [];
  const client = { ended: false, write(name, packet) { packets.push({ name, packet }); return 'preserved'; } };
  installMovementTickBoundary(client);
  const position = { x: 1, y: 64, z: 3, flags: { onGround: true } };
  assert.equal(client.write('position', position), 'preserved');
  assert.deepEqual(packets, [{ name: 'position', packet: position }, { name: 'tick_end', packet: {} }]);
  client.write('window_click', { windowId: 0 }); assert.equal(packets.at(-1).name, 'window_click');
  for (const name of ['position_look', 'look', 'flying']) { client.write(name, position); assert.equal(packets.at(-1).name, 'tick_end'); }
  client.ended = true; client.write('position', position); assert.equal(packets.at(-1).name, 'position');
});
