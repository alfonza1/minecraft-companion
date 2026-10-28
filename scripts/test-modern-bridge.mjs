import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, writeFile, rm, mkdir, realpath } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import net from 'node:net';
import path from 'node:path';
import os from 'node:os';
import mineflayer from 'mineflayer';
import { CompanionRuntime } from '../services/companion-runtime/index.js';
import { Store } from '../services/memory/store.js';
import { startBridge, getBridgeStatus, bridgeDirectory, bridgeSourcesHash, bridgeRuntimeHash, BRIDGE_PROXY_SHA256 } from '../services/protocol-bridge/index.js';
import { createBridgeClient } from '../services/protocol-bridge/client.js';

const SERVER_SHA1 = '33680f5f2ac32864d6d7cf5e56a705fdb3e05f4c';
const cache = path.join(process.env.LOCALAPPDATA, 'MinecraftCompanion', 'test-runtime-modern');
const manifest = JSON.parse((await readFile(path.join(cache, 'runtime.json'), 'utf8')).replace(/^\uFEFF/, ''));
async function checkedCachePath(value) {
  if (typeof value !== 'string') throw new Error('Invalid modern test runtime manifest. Run Setup-ModernTest.ps1.');
  const resolved = await realpath(value), base = await realpath(cache);
  if (!resolved.toLowerCase().startsWith((base + path.sep).toLowerCase())) throw new Error('Modern runtime path escaped its dedicated test cache.');
  return resolved;
}
for (const field of ['java', 'serverJar', 'eulaReceipt']) manifest[field] = await checkedCachePath(manifest[field]);
async function digest(file, algorithm) { const hash = createHash(algorithm); for await (const chunk of createReadStream(file)) hash.update(chunk); return hash.digest('hex'); }
assert.equal(manifest.minecraftVersion, '26.3');
assert.equal(await digest(manifest.serverJar, 'sha1'), SERVER_SHA1, 'Official modern server SHA1');
assert.equal(await digest(manifest.java, 'sha256'), manifest.javaExecutableSha256, 'Private Java executable SHA256');
assert.equal(JSON.parse((await readFile(manifest.eulaReceipt, 'utf8')).replace(/^\uFEFF/, '')).accepted, true, 'Local Minecraft EULA receipt');
if (process.argv.includes('--check-runtime')) { console.log('Verified private Java 25, official Minecraft 26.3 server SHA1, dedicated paths and EULA receipt.'); process.exit(0); }
if (!getBridgeStatus().installed) throw new Error('Protocol bridge artifacts are missing or stale. Run scripts/Setup-ProtocolBridge.ps1 before starting the official server fixture.');

const directory = await mkdtemp(path.join(os.tmpdir(), 'companion-modern-'));
const evidence = { at: new Date().toISOString(), serverVersion: '26.3', serverSha1: SERVER_SHA1, clientVersion: '26.1', proxySha256: BRIDGE_PROXY_SHA256, sourcesHash: bridgeSourcesHash(), runtimeHash: bridgeRuntimeHash(), passed: false, scope: 'Official offline localhost-only survival protocol bridge fixture. No Microsoft authentication, Realm, building or modern item identity correctness is established.', results: [], movementPackets: [] };
const logs = [], bridges = [], bridgeClosures = [], startupDiagnostics = [];
let child, runtime, store, exitPromise, exitResult = null, failed = false, joinRequests = 0;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const controller = new AbortController();
const watchdog = setTimeout(() => { controller.abort(new Error('Modern bridge integration exceeded 240 seconds.')); child?.kill(); for (const bridge of bridges) void bridge.close(); }, 240_000);
function line(text) { logs.push(text); if (logs.length > 180) logs.shift(); }
async function until(predicate, label, timeout = 25_000) { const started = Date.now(); while (!predicate()) { controller.signal.throwIfAborted(); if (exitResult) throw new Error(`Server exited before ${label}.`); if (Date.now() - started > timeout) throw new Error(`${label} timed out.`); await sleep(50); } }
async function check(name, work) { const detail = await work(); evidence.results.push({ name, status: 'passed', detail }); console.log(`PASS ${name} ${JSON.stringify(detail ?? {})}`); }
function command(text) { if (!child || child.exitCode !== null) throw new Error('Modern test server is not running.'); child.stdin.write(text + '\n'); }
try {
  const probe = net.createServer(); probe.listen(0, '127.0.0.1'); await once(probe, 'listening'); const port = probe.address().port; await new Promise(resolve => probe.close(resolve));
  await writeFile(path.join(directory, 'eula.txt'), 'eula=true\n');
  await writeFile(path.join(directory, 'server.properties'), [
    'server-ip=127.0.0.1', `server-port=${port}`, 'online-mode=false', 'enforce-secure-profile=false', 'white-list=false', 'enforce-whitelist=false', 'gamemode=survival', 'force-gamemode=true', 'difficulty=peaceful', 'view-distance=2', 'simulation-distance=2', 'spawn-protection=0', 'max-players=2', 'max-world-size=256', 'generate-structures=false', 'level-type=minecraft:flat', 'generator-settings={"layers":[{"block":"minecraft:bedrock","height":1},{"block":"minecraft:stone","height":3},{"block":"minecraft:grass_block","height":1}],"biome":"minecraft:plains"}', 'enable-rcon=false', 'enable-query=false', 'enable-jmx-monitoring=false', 'allow-nether=false', 'network-compression-threshold=256', 'max-tick-time=-1', 'pause-when-empty-seconds=0', 'sync-chunk-writes=false', 'motd=Minecraft Companion isolated modern protocol test',
  ].join('\n') + '\n');
  console.log(`Starting private official Minecraft 26.3 fixture on 127.0.0.1:${port} with private Java25.`);
  child = spawn(manifest.java, ['-Xms256M', '-Xmx768M', '-XX:ActiveProcessorCount=2', '-jar', manifest.serverJar, 'nogui'], { cwd: directory, windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
  exitPromise = new Promise(resolve => child.once('exit', (code, signal) => { exitResult = { code, signal }; resolve(exitResult); }));
  child.stdout.on('data', data => { for (const entry of String(data).split(/\r?\n/)) { line(entry); if (/Done \(|ERROR|Exception|Starting minecraft server/.test(entry)) console.log(entry); } });
  child.stderr.on('data', data => line(String(data))); child.once('error', error => controller.abort(error));
  await until(() => logs.some(text => text.includes('Done (')), 'official modern server ready', 120_000);
  command('setworldspawn 0 -59 0'); command('time set day');
  store = new Store(path.join(directory, 'app-state')); store.updateSettings({ realmId: 1, autonomy: 'instructions' });
  runtime = new CompanionRuntime({ store, connector: { close: async () => {} }, createBot: async () => {
    let bridge;
    try { bridge = await startBridge({ host: '127.0.0.1', port, serverVersion: '26.3', profile: { id: '00112233445566778899aabbccddeeff', name: 'ModernFixture' }, certificates: null, joinServer: async () => { joinRequests++; throw new Error('Offline fixture must never authorize an online account.'); }, signal: controller.signal }); }
    catch (error) { if (error.bridgeDiagnostics) startupDiagnostics.push(error.bridgeDiagnostics); throw error; }
    bridges.push(bridge);
    const bot = createBridgeClient(bridge, '26.3');
    const originalWrite = bot._client.write.bind(bot._client);
    bot._client.write = (name, packet, ...args) => {
      if (['position', 'position_look', 'look', 'flying'].includes(name) && evidence.movementPackets.length < 30) {
        const record = { name, packet, entity: bot.entity ? { position: bot.entity.position, velocity: bot.entity.velocity, yaw: bot.entity.yaw, pitch: bot.entity.pitch, onGround: bot.entity.onGround } : null, control: bot.controlState, physicsEnabled: bot.physicsEnabled };
        evidence.movementPackets.push(JSON.parse(JSON.stringify(record, (_key, value) => typeof value === 'number' && !Number.isFinite(value) ? String(value) : value)));
      }
      return originalWrite(name, packet, ...args);
    };
    bot.on('error', error => { line(`Fixture client error: ${error.message}`); console.error(`Fixture client error: ${error.message}`); });
    bot.on('kicked', reason => { const message = `Fixture client kicked: ${JSON.stringify(reason)}`; line(message); console.error(message); });
    bot.on('end', reason => line(`Fixture client ended: ${reason}`));
    bot.companionTransport = { kind: 'bridge', serverVersion: '26.3', clientVersion: bridge.version, projected: true };
    bot.once('end', () => { bridgeClosures.push(bridge.close()); });
    return bot;
  } });
  await runtime.control('start');
  await until(() => { if (runtime.connection.status === 'error') throw new Error(runtime.connection.error || 'Bridge connection preparation failed.'); return runtime.connection.status === 'connected'; }, 'translated survival spawn', 40_000);
  let bot = runtime.bot;
  await until(() => bot.entity?.onGround, 'translated flat-world ground contact');
  await check('official 26.3 server translated survival connection', async () => { assert.equal(bot.version, '26.1'); assert.equal(bot.game.gameMode, 'survival'); return { serverVersion: '26.3', clientVersion: bot.version, gameMode: bot.game.gameMode, position: runtime.snapshot().world.position }; });
  await check('stable translated physics ticks', async () => { let ticks = 0; const tick = () => ticks++; bot.on('physicsTick', tick); try { await until(() => { if (runtime.bot !== bot || runtime.connection.status !== 'connected') throw new Error('Client disconnected before sixty stable physics ticks.'); return ticks >= 60; }, 'sixty actual physics ticks'); return { observedTicks: ticks }; } finally { bot.off('physicsTick', tick); } });
  await check('untrusted local alias is rejected without impersonating the connected player', async () => {
    const bridge = bridges[0];
    const untrusted = mineflayer.createBot({ host: bridge.host, port: bridge.port, username: 'UntrustedFixture', version: bridge.version, auth: 'offline', hideErrors: true, logErrors: false });
    let spawned = false, reason = '';
    untrusted.once('spawn', () => { spawned = true; }); untrusted.on('error', () => {});
    untrusted.once('kicked', message => { reason = JSON.stringify(message); });
    try {
      await Promise.race([once(untrusted, 'end'), sleep(10_000).then(() => { throw new Error('Unauthorized local client was not disconnected.'); })]);
      assert.equal(spawned, false); assert.match(reason, /rejected this local connection/i);
      assert.equal(runtime.bot, bot); assert.equal(runtime.connection.status, 'connected');
      return { spawned: false, rejected: true, legitimatePlayerStillConnected: true };
    } finally { untrusted.end(); }
  });
  command('give ModernFixture minecraft:oak_log 4');
  await check('actual modern server inventory packets reach world state', async () => {
    await until(() => runtime.snapshot().world?.inventory.some(item => item.name === 'oak_log' && item.count === 4), 'four seeded logs in observed inventory');
    const world = runtime.snapshot().world;
    assert.equal(world.inventoryExact, false); assert.equal(world.provenance, 'observed-client-projection');
    await assert.rejects(runtime.execute('craft_item', { item: 'oak_planks', count: 4 }), /native Minecraft identities|projected/i);
    await assert.rejects(runtime.execute('gather_blocks', { block: 'oak_log', count: 1 }), /native Minecraft identities|projected/i);
    return { inventory: world.inventory.map(item => ({ name: item.name, count: item.count })), inventoryExact: world.inventoryExact, provenance: world.provenance, projectedCraftingAndGatheringBlocked: true };
  });
  await check('actual survival pathfinding through translated protocol', async () => { const before = bot.entity.position.clone(); const result = await runtime.execute('goto', { x: before.x + 4, y: before.y, z: before.z, tolerance: 1 }); assert.ok(bot.entity.position.distanceTo(before) >= 2, JSON.stringify(result)); return { result, distanceMoved: bot.entity.position.distanceTo(before), before, after: bot.entity.position.clone() }; });
  await check('translated disconnect and safe reconnect', async () => { const previous = bot; previous._client.end('Disposable modern fixture transport loss'); await until(() => runtime.bot !== previous && runtime.connection.status === 'connected', 'new translated bot connection', 50_000); bot = runtime.bot; assert.equal(runtime.state, 'PAUSED'); assert.equal(bot.game.gameMode, 'survival'); assert.ok(bridges.length >= 2); await until(() => runtime.snapshot().world?.inventory.some(item => item.name === 'oak_log' && item.count === 4), 'persisted inventory after reconnect'); assert.equal(joinRequests, 0); return { state: runtime.state, bridgesStarted: bridges.length, observedLogs: 4, onlineJoinCallbacks: joinRequests }; });
} catch (error) { failed = true; evidence.results.push({ name: 'modern protocol integration', status: 'failed', error: error.stack }); console.error(error.stack); }
finally {
  try { await runtime?.close(); } catch (error) { failed = true; line(`Runtime cleanup: ${error.message}`); }
  for (const bridge of bridges) { try { await bridge.close(); } catch (error) { failed = true; line(`Bridge cleanup: ${error.message}`); } }
  await Promise.allSettled(bridgeClosures);
  if (child?.pid && !exitResult) {
    if (!child.killed) { try { command('stop'); await Promise.race([exitPromise, sleep(12_000)]); } catch (error) { line(error.message); } }
    if (!exitResult) { child.kill(); await Promise.race([exitPromise, sleep(10_000)]); }
    if (!exitResult) { failed = true; evidence.results.push({ name: 'owned server cleanup', status: 'failed', error: 'Java process did not confirm exit.' }); }
  }
  store?.close(); clearTimeout(watchdog);
  evidence.serverExited = child?.pid ? Boolean(exitResult) : true; evidence.serverExit = exitResult;
  evidence.runtime = runtime ? { state: runtime.state, connection: runtime.connection, logs: runtime.logs } : null;
  evidence.bridgeDiagnostics = [...startupDiagnostics, ...bridges.map(bridge => bridge.diagnostics())]; evidence.serverLogTail = logs.slice(-60);
  evidence.passed = !failed && evidence.results.length === 6 && evidence.serverExited;
  await mkdir(bridgeDirectory, { recursive: true }); await writeFile(path.join(bridgeDirectory, 'verification.json'), JSON.stringify(evidence, null, 2));
  await writeFile(path.join(import.meta.dirname, '..', '.git', 'modern-bridge-results.json'), JSON.stringify(evidence, null, 2));
  const target = path.resolve(directory), temporaryRoot = path.resolve(os.tmpdir()) + path.sep;
  if (target.startsWith(temporaryRoot) && path.basename(target).startsWith('companion-modern-')) await rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 });
}
console.log(JSON.stringify({ passed: evidence.passed, serverVersion: evidence.serverVersion, clientVersion: evidence.clientVersion, results: evidence.results, serverExited: evidence.serverExited, serverExit: evidence.serverExit }, null, 2));
process.exit(evidence.passed ? 0 : 1);
