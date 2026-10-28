import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Vec3 } from 'vec3';
import registryFactory from 'prismarine-registry';
import { Store } from '../services/memory/store.js';
import { CompanionRuntime } from '../services/companion-runtime/index.js';
import { observeWorld } from '../services/world-state/index.js';
import { secureCacheFactory, dpapi } from '../services/realm-connector/secure-cache.js';
import { assertSupportedVersion, supportedVersions, supportedVersionForProtocol, RealmConnector, deviceCodePrompt } from '../services/realm-connector/index.js';
import nativeProtocol from '../services/native-26.3/preload.cjs';

function fixture() {
  const collections = new Map();
  const store = { directory: tmpdir(), settings: () => ({ realmId: 1, combat: 'retreat' }), get: key => collections.get(key) || [], put(key, record) { const values = this.get(key); const next = values.filter(value => value.id !== record.id); next.push(record); collections.set(key, next); } };
  const runtime = new CompanionRuntime({ store, connector: { cancelAuth: async () => {}, close: async () => {} } });
  const bot = new EventEmitter();
  bot.minenessReady = true; bot.entity = { position: new Vec3(1, 65, 3) };
  bot.inventory = { items: () => [{ slot: 9, name: 'oak_log', count: 5, type: 42 }], slots: [] };
  bot.game = { dimension: 'overworld' }; bot.health = 17; bot.food = 18; bot.registry = {}; bot.players = {}; bot.entities = {};
  bot.quit = () => queueMicrotask(() => bot.emit('end'));
  runtime.bot = bot; runtime.state = 'ACTIVE';
  const counters = { stop: 0, resume: 0, inference: 0 };
  runtime.actions = { stop: () => counters.stop++, resume: () => counters.resume++, state: () => ({ action: null }) };
  runtime.modelCancel = async () => { counters.inference++; };
  return { runtime, store, bot, counters };
}

test('translated connections reject resource execution before any world or inventory mutation', async () => {
  const { runtime, bot } = fixture();
  bot.companionTransport = { projected: true };
  try {
    for (const name of ['gather_blocks', 'chop_tree', 'craft_item']) await assert.rejects(runtime.execute(name, {}), /native Minecraft identities/);
    assert.equal(runtime.currentTask, null);
  } finally { await runtime.close(); }
});
test('unconfirmed inventory cannot authorize subsequent resource actions', async () => {
  const { runtime, bot } = fixture();
  bot.companionInventoryUnverified = true;
  try {
    assert.equal(observeWorld(bot).inventoryExact, false);
    for (const name of ['gather_blocks', 'chop_tree', 'craft_item']) await assert.rejects(runtime.execute(name, {}), /server inventory confirmation/);
    assert.equal(runtime.currentTask, null);
    bot.companionInventoryUnverified = false;
    assert.equal(observeWorld(bot).inventoryExact, true);
  } finally { await runtime.close(); }
});

async function connectingFixture() {
  const value = fixture();
  const { runtime, bot } = value;
  runtime.bot = null; runtime.state = 'DISCONNECTED';
  bot.registry = registryFactory('1.16.5'); bot.version = '1.16.5'; bot.username = 'Fixture';
  bot.physics = {}; bot.loadPlugin = () => {}; bot.collectBlock = {};
  bot.pathfinder = { goto: async () => {}, stop() {}, setGoal() {}, setMovements() {} };
  bot.inventory = Object.assign(new EventEmitter(), bot.inventory);
  runtime.botFactory = async () => bot;
  await runtime.control('start'); await new Promise(resolve => setImmediate(resolve));
  return value;
}

test('a Realm kick stops retries and exposes only a stable diagnosis', async () => {
  const { runtime, bot } = await connectingFixture();
  try {
    bot.emit('spawn');
    bot.emit('kicked', { text: "private provider response: Failed to decode packet 'serverbound/minecraft:chat_session_update'" });
    bot.emit('end');
    assert.equal(runtime.state, 'ERROR'); assert.equal(runtime.connection.status, 'error');
    assert.equal(runtime.reconnectTimer, null);
    assert.equal(runtime.connection.errorCode, 'PLAYER_CERTIFICATE_REJECTED');
    assert.equal(runtime.connection.error.includes('private provider response'), false);
  } finally { await runtime.close(); }
});

test('a brief reconnect spawn does not reset the bounded retry budget', async () => {
  const { runtime, bot } = await connectingFixture();
  try {
    runtime.connection.reconnectAttempt = 4;
    bot.emit('spawn');
    assert.equal(runtime.connection.reconnectAttempt, 4);
    assert.ok(runtime.stabilityTimer);
  } finally { await runtime.close(); }
});

test('death and subsequent spawn preserve pause and do not reactivate inference/reflexes', async () => {
  const { runtime, bot } = await connectingFixture();
  try {
    bot.emit('spawn'); assert.equal(runtime.state, 'ACTIVE');
    bot.emit('death'); assert.equal(runtime.state, 'PAUSED');
    bot.emit('spawn'); assert.equal(runtime.state, 'PAUSED'); assert.equal(runtime.isActive(), false);
    await runtime.control('resume'); assert.equal(runtime.state, 'ACTIVE');
    bot.emit('spawn'); assert.equal(runtime.state, 'PAUSED', 'Dimension changes must not silently resume work.');
  } finally { await runtime.close(); }
});

test('pause before first spawn remains paused when login finally succeeds', async () => {
  const { runtime, bot } = await connectingFixture();
  try { await runtime.control('pause'); bot.emit('spawn'); assert.equal(runtime.state, 'PAUSED'); }
  finally { await runtime.close(); }
});

test('cancelled connection preparation can be started again after its stale rejection', async () => {
  const { runtime } = fixture();
  runtime.bot = null; runtime.state = 'DISCONNECTED';
  let rejectPreparation;
  runtime.botFactory = () => new Promise((resolve, reject) => { rejectPreparation = reject; });
  try {
    await runtime.control('start'); assert.equal(runtime.connection.status, 'connecting');
    await runtime.control('pause'); assert.equal(runtime.connection.status, 'offline');
    rejectPreparation(new Error('Cancelled')); await new Promise(resolve => setImmediate(resolve));
    assert.equal(runtime.state, 'DISCONNECTED');
    runtime.botFactory = async () => { throw new Error('Known unavailable Realm'); };
    await runtime.control('start'); await new Promise(resolve => setImmediate(resolve));
    assert.equal(runtime.connection.error, 'Known unavailable Realm');
  } finally { await runtime.close(); }
});

test('authentication error without socket end tears down the initial connection', async () => {
  const { runtime, bot } = await connectingFixture();
  try {
    bot.emit('error', new Error('Authentication revoked'));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(runtime.bot, null); assert.equal(runtime.state, 'ERROR'); assert.equal(runtime.connection.status, 'error');
  } finally { await runtime.close(); }
});

test('pause gates new jobs before cancellation, preserves task progress and explicit resume', async () => {
  const { runtime, store, counters } = fixture();
  try {
    let started = false;
    const job = runtime.runJob('gather', signal => new Promise((resolve, reject) => {
      started = true; signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    }));
    await Promise.resolve(); assert.equal(started, true);
    const rejected = assert.rejects(job, /paused|stopped/);
    await runtime.control('pause'); await rejected;
    assert.equal(runtime.state, 'PAUSED'); assert.equal(counters.inference, 1);
    await assert.rejects(runtime.runJob('new-work', () => {}), /active/);
    assert.equal(store.get('tasks')[0].status, 'interrupted');
    await runtime.control('resume'); assert.equal(runtime.state, 'ACTIVE');
    await runtime.runJob('new-work', () => ({ success: true }));
    assert.equal(store.get('tasks')[1].status, 'completed');
  } finally { await runtime.close(); }
});

test('single-body ownership rejects overlapping jobs and resume until actual cancellation settles', async () => {
  const { runtime } = fixture();
  let release;
  try {
    const pending = runtime.runJob('blocked-library', () => new Promise(resolve => { release = resolve; }));
    await Promise.resolve();
    await assert.rejects(runtime.runJob('overlap', () => {}), /already/);
    await runtime.control('pause');
    await assert.rejects(runtime.control('resume'), /still stopping/);
    const rejected = assert.rejects(pending);
    release(); await rejected;
    await runtime.control('resume'); assert.equal(runtime.state, 'ACTIVE');
  } finally { await runtime.close(); }
});

test('offline planning requires an explicit start and supports pause/resume without pretending a bot exists', async () => {
  const { runtime } = fixture();
  runtime.bot = null; runtime.state = 'DISCONNECTED';
  try {
    assert.equal(runtime.isActive(), false);
    await runtime.control('plan'); assert.equal(runtime.isActive(), true); assert.equal(runtime.snapshot().planning, true); assert.equal(runtime.snapshot().world, null);
    await assert.rejects(runtime.runJob('mine', () => {}), /connected/);
    await runtime.control('pause'); assert.equal(runtime.state, 'PAUSED'); assert.equal(runtime.isActive(), false);
    await runtime.control('resume'); assert.equal(runtime.isActive(), true);
    await runtime.control('stop'); assert.equal(runtime.planning, false); assert.equal(runtime.state, 'DISCONNECTED');
  } finally { await runtime.close(); }
});

test('late library operations keep body ownership after a cancelled builder race has returned', async () => {
  const { runtime, bot } = fixture();
  let finishEquip;
  bot.equip = () => new Promise(resolve => { finishEquip = resolve; });
  runtime.trackOperations(bot);
  try {
    const job = runtime.runJob('build', signal => Promise.race([
      bot.equip({}, 'hand'), new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })),
    ]));
    await new Promise(resolve => setImmediate(resolve));
    const rejected = assert.rejects(job);
    await runtime.control('pause'); await rejected;
    assert.equal(runtime.pending, null); assert.equal(runtime.hasOperations(), true);
    await assert.rejects(runtime.control('resume'), /still stopping/);
    finishEquip(); await new Promise(resolve => setImmediate(resolve));
    await runtime.control('resume'); assert.equal(runtime.state, 'ACTIVE');
  } finally { await runtime.close(); }
});

test('emergency stop cancels queued connection recovery and disconnects the actual bot', async () => {
  const { runtime, bot } = fixture();
  let quit = 0; bot.quit = () => { quit++; queueMicrotask(() => bot.emit('end')); };
  try {
    await runtime.control('emergency');
    assert.equal(quit, 1); assert.equal(runtime.state, 'DISCONNECTED'); assert.equal(runtime.bot, null);
    assert.equal(runtime.world, null);
    await assert.rejects(runtime.control('resume'), /connected/);
  } finally { await runtime.close(); }
});

test('world inventory uses event-derived slots and never supplies another player inventory', () => {
  const { runtime, bot } = fixture();
  const world = observeWorld(bot);
  assert.equal(world.inventory[0].count, 5); assert.equal(world.provenance, 'observed');
  assert.deepEqual(world.position, { x: 1, y: 65, z: 3 });
  assert.equal(world.playerInventory, undefined);
  bot.minenessReady = false; assert.equal(observeWorld(bot), null);
  runtime.closed = true; clearInterval(runtime.reflexTimer);
});

test('no reflex or model cancellation request is issued while paused', async () => {
  const { runtime, bot, counters } = fixture();
  try {
    runtime.state = 'PAUSED';
    bot.nearestEntity = () => { throw new Error('Paused runtime must not inspect threats.'); };
    for (let i = 0; i < 5; i++) await runtime.reflex();
    assert.equal(counters.inference, 0);
  } finally { await runtime.close(); }
});

test('supported protocol whitelist rejects unknown releases and mismatched protocol numbers', () => {
  assert.equal(assertSupportedVersion('1.21.11', 774), '1.21.11');
  assert.throws(() => assertSupportedVersion('26.3', 999), /No supported Realm connection/);
  assert.throws(() => assertSupportedVersion('99.9', 999), /No supported Realm connection/);
  assert.equal(supportedVersions.includes('26.3'), nativeProtocol.installed);
  assert.equal(supportedVersionForProtocol(754), '1.16.5');
  assert.equal(supportedVersionForProtocol(99999), null);
});

test('Realm account validation rejects uninvited or unselected account before network activity', async () => {
  const connector = new RealmConnector(tmpdir());
  await assert.rejects(connector.createBot(1), /licensed/);
  connector.auth.status = 'connected';
  await assert.rejects(connector.createBot(1), /available/);
});

test('device prompt accepts official Microsoft codes without exposing the provider token response', () => {
  const prompt = deviceCodePrompt({ verificationUri: 'https://www.microsoft.com/link', userCode: 'ABCD-EFGH', expiresIn: 900, accessToken: 'must-not-leak' });
  assert.equal(prompt.userCode, 'ABCD-EFGH'); assert.equal(prompt.accessToken, undefined);
  assert.throws(() => deviceCodePrompt({ verificationUri: 'https://attacker.example/login', userCode: 'ABCD' }), /authentication URL/);
  assert.throws(() => deviceCodePrompt({ verificationUri: 'not a URL', userCode: 'ABCD' }));
  assert.throws(() => deviceCodePrompt({ userCode: 'ABCD', expiresIn: 'invalid' }), /expiry/);
});

test('secure supported cache factory persists encrypted bytes and merges refreshed sessions', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'companion-cache-'));
  const codec = async input => Buffer.from(input).map(byte => byte ^ 0xa7);
  try {
    const cache = secureCacheFactory(directory, codec)({ cacheName: 'mca' });
    assert.deepEqual(await cache.getCached(), {});
    await cache.setCached({ token: 'test-secret' }); await cache.setCachedPartial({ expiry: 3 });
    assert.equal((await readFile(join(directory, 'mca.dpapi'))).includes(Buffer.from('test-secret')), false);
    const reloaded = secureCacheFactory(directory, codec)({ cacheName: 'mca' });
    assert.deepEqual(await reloaded.getCached(), { token: 'test-secret', expiry: 3 });
    assert.throws(() => secureCacheFactory(directory)({ cacheName: '../evil' }), /Invalid/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('actual Windows DPAPI protects secrets for the current account', { skip: process.platform !== 'win32' }, async () => {
  const secret = Buffer.from('synthetic-auth-fixture');
  const encrypted = await dpapi(secret, 'protect');
  assert.equal(encrypted.includes(secret), false);
  assert.deepEqual(await dpapi(encrypted, 'unprotect'), secret);
});

test('SQLite survives restart with tasks, settings and independent backup', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'companion-db-'));
  let store;
  try {
    store = new Store(directory); store.updateSettings({ voice: { speed: 1.2 } }); store.put('tasks', { id: 'one', status: 'interrupted', count: 7 });
    const backup = store.backup(); assert.ok((await readFile(backup)).length > 0); store.close();
    store = new Store(directory);
    assert.equal(store.settings().voice.volume, 0.8); assert.equal(store.settings().voice.speed, 1.2);
    assert.equal(store.get('tasks')[0].count, 7);
  } finally { store?.close(); await rm(directory, { recursive: true, force: true }); }
});
