import { EventEmitter } from 'node:events';
import { fork } from 'node:child_process';
import { join } from 'node:path';
import mineflayer from 'mineflayer';
import mcProtocol from 'minecraft-protocol';
import minecraftData from 'minecraft-data';
import { secureCacheFactory } from './secure-cache.js';
import { BRIDGE_PROTOCOLS, BRIDGE_CLIENT_VERSION, getBridgeStatus, startBridge } from '../protocol-bridge/index.js';
import { createBridgeClient } from '../protocol-bridge/client.js';

export const supportedVersions = mineflayer.testedVersions.filter(version => mcProtocol.supportedVersions.includes(version));
export const supportedVersionForProtocol = protocol => [...supportedVersions].reverse().find(version => minecraftData.versionsByMinecraftVersion.pc[version]?.version === protocol) ?? null;

export function assertSupportedVersion(version, protocol) {
  const supported = supportedVersions.includes(version);
  if (!supported) throw new Error(`Realm uses Minecraft ${version || 'an unknown version'} (protocol ${protocol ?? 'unknown'}). Installed Mineflayer supports ${supportedVersions.join(', ')}. No supported Realm connection is available until protocol support is updated.`);
  return version;
}

export function inspectServer(host, port) {
  return new Promise((resolve, reject) => mcProtocol.ping({ host, port, closeTimeout: 8_000 }, (error, result) => error ? reject(error) : resolve(result)));
}

export function deviceCodePrompt(message) {
  const uri = new URL(message.verificationUri || 'https://www.microsoft.com/link');
  if (uri.protocol !== 'https:' || !['www.microsoft.com', 'microsoft.com', 'login.microsoftonline.com'].includes(uri.hostname) || uri.username || uri.password) throw new Error('Invalid Microsoft authentication URL.');
  if (typeof message.userCode !== 'string' || !/^[A-Za-z0-9-]{4,32}$/.test(message.userCode)) throw new Error('Invalid Microsoft device code.');
  const seconds = Number(message.expiresIn ?? 900);
  if (!Number.isFinite(seconds) || seconds < 1 || seconds > 3600) throw new Error('Invalid Microsoft device code expiry.');
  return { verificationUri: uri.href, userCode: message.userCode, expiresAt: new Date(Date.now() + seconds * 1000).toISOString() };
}

export class RealmConnector extends EventEmitter {
  constructor(directory) {
    super();
    this.directory = join(directory, 'auth');
    this.auth = { status: 'disconnected', username: null, device: null };
    this.realms = [];
    this.worker = null; this.preparations = new Set();
    this.sessions = new Set(); this.pendingConnections = new Set(); this.connections = new Set(); this.compatibility = null;
  }
  connectAccount() {
    if (this.worker) return;
    this.realms = []; this.compatibility = null;
    this.auth = { ...this.auth, status: 'authenticating', device: null, error: null, issue: null };
    this.emit('change');
    const worker = fork(new URL('./auth-worker.js', import.meta.url), [], { windowsHide: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
    this.worker = worker;
    let ready = false;
    const timeout = setTimeout(() => { this.cancelAuth(); this.auth.status = 'error'; this.emit('change'); }, 15 * 60_000);
    worker.on('message', message => {
      if (this.worker !== worker) return;
      if (message.type === 'ready') { ready = true; return; }
      if (message.type === 'device') {
        try { this.auth.device = deviceCodePrompt(message); }
        catch { this.auth.status = 'error'; this.auth.device = null; this.emit('diagnostic', 'Microsoft returned an invalid device prompt. Reconnect the account.'); void this.cancelAuth().catch(() => {}); }
      }
      if (message.type === 'profile') this.auth = { status: 'connected', username: message.username, device: null };
      if (message.type === 'realms') this.realms = message.realms;
      if (message.type === 'failure') {
        this.auth = { ...this.auth, status: message.code === 'JAVA_PROFILE_REQUIRED' ? 'profile-required' : 'error', device: null, error: message.error, issue: message.code || null };
        this.emit('diagnostic', message.error);
      }
      this.emit('change');
    });
    worker.on('error', () => { this.auth.status = 'error'; this.emit('change'); });
    worker.on('exit', () => {
      clearTimeout(timeout);
      if (this.worker === worker) {
        this.worker = null;
        if (this.auth.status === 'authenticating') {
          this.auth.status = 'error'; this.auth.device = null;
          this.emit('diagnostic', ready ? 'Microsoft sign-in ended before completion. Connect the account again.' : 'The Minecraft account worker could not start. Run Bootstrap.ps1 to repair its dependencies.'); this.emit('change');
        }
      }
    });
    worker.send({ type: 'connect', directory: this.directory });
  }
  async cancelAuth() {
    for (const controller of this.pendingConnections) controller.abort();
    await Promise.all([...this.preparations].map(worker => new Promise(resolve => { worker.once('exit', resolve); worker.kill(); })));
    const worker = this.worker;
    if (!worker) return;
    this.worker = null;
    await new Promise(resolve => { worker.once('exit', resolve); worker.kill(); });
    this.auth.device = null;
    if (this.auth.status === 'authenticating') this.auth.status = 'disconnected';
    this.emit('change');
  }
  requireRealm(realmId) {
    if (this.auth.status !== 'connected') throw new Error('Connect the licensed Minecraft account first.');
    if (!this.realms.some(realm => realm.id === realmId)) throw new Error('Select a Realm available to the connected account.');
  }
  resolveRealm(realmId, session = false) {
    this.requireRealm(realmId);
    return new Promise((resolve, reject) => {
      const worker = fork(new URL('./auth-worker.js', import.meta.url), [], { windowsHide: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
      this.preparations.add(worker);
      let sequence = 0; const joins = new Map();
      const timeout = setTimeout(() => worker.kill(), 45_000);
      const close = async () => {
        this.preparations.delete(worker); this.sessions.delete(worker);
        if (worker.exitCode !== null || worker.signalCode !== null) return;
        await new Promise(done => { worker.once('exit', done); worker.kill(); });
      };
      const joinServer = (serverIdHash, signal) => new Promise((done, failed) => {
        if (signal.aborted || !worker.connected) return failed(new Error('Minecraft session cancelled.'));
        const id = ++sequence;
        const abort = () => finish(new Error('Minecraft session cancelled.'));
        const timer = setTimeout(() => finish(new Error('Minecraft session authorization timed out.')), 9000);
        const finish = error => { clearTimeout(timer); signal.removeEventListener('abort', abort); joins.delete(id); error ? failed(error) : done(); };
        joins.set(id, finish); signal.addEventListener('abort', abort, { once: true });
        worker.send({ type: 'join', id, serverIdHash }, error => { if (error) finish(new Error('Minecraft session worker unavailable.')); });
      });
      worker.on('message', message => {
        if (message.type === 'joined') joins.get(message.id)?.(message.ok ? null : new Error('Minecraft session authorization failed. Reconnect the account.'));
        if (message.type === 'resolved') {
          clearTimeout(timeout);
          if (session) this.sessions.add(worker);
          else this.preparations.delete(worker);
          resolve({ ...message, close, joinServer, worker });
        }
        if (message.type === 'failure') reject(new Error(message.error));
      });
      worker.on('error', () => reject(new Error('Could not start secure Realm connection worker.')));
      worker.on('exit', () => { clearTimeout(timeout); this.preparations.delete(worker); this.sessions.delete(worker); for (const finish of joins.values()) finish(new Error('Minecraft session worker stopped.')); reject(new Error('Realm connection preparation cancelled or timed out.')); });
      worker.send({ type: session ? 'session' : 'resolve', directory: this.directory, realmId });
    });
  }
  recordCompatibility(realmId, status) {
    const native = supportedVersionForProtocol(status.protocol);
    const translated = BRIDGE_PROTOCOLS.get(status.protocol);
    const bridge = getBridgeStatus();
    this.compatibility = { realmId, status: native ? 'native' : translated && bridge.installed ? 'bridge' : 'unsupported',
      serverVersion: native || translated || status.version, serverProtocol: status.protocol, clientVersion: native || (translated ? BRIDGE_CLIENT_VERSION : null), checkedAt: new Date().toISOString(),
      message: native ? 'Native protocol supported.' : translated && bridge.installed ? `Uses the local protocol bridge${bridge.verified ? ' validated against a local 26.3 server' : '; local gameplay verification is pending'}. Exact building and assigned gathering are disabled for this projected client view. Real Realm login remains to be tested.` : 'No installed connection supports this Realm protocol. Run Bootstrap.ps1 or wait for native protocol support.' };
    this.emit('change'); return this.compatibility;
  }
  async probeRealm(realmId) {
    this.requireRealm(realmId);
    try { const status = await this.resolveRealm(realmId); return this.recordCompatibility(realmId, status); }
    catch (error) { this.compatibility = { realmId, status: 'unavailable', message: error.message, checkedAt: new Date().toISOString() }; this.emit('change'); throw error; }
  }
  async createBot(realmId) {
    const controller = new AbortController(); this.pendingConnections.add(controller);
    let session, bridge;
    try {
      session = await this.resolveRealm(realmId, true);
      controller.signal.throwIfAborted();
      const compatibility = this.recordCompatibility(realmId, session);
      const detected = supportedVersionForProtocol(session.protocol);
      if (!detected) {
        if (compatibility.status !== 'bridge') assertSupportedVersion(session.version, session.protocol);
        bridge = await startBridge({ ...session.address, serverVersion: compatibility.serverVersion, profile: session.profile, certificates: session.certificates, joinServer: session.joinServer, signal: controller.signal });
        controller.signal.throwIfAborted();
        const bot = createBridgeClient(bridge, compatibility.serverVersion);
        let cleanup;
        const close = () => cleanup ||= (async () => {
          try { await bridge.close(); } finally { await session.close(); this.connections.delete(close); }
        })();
        this.connections.add(close); this.preparations.delete(session.worker);
        bot.once('end', () => { void close().catch(() => {}); });
        bridge.onExit(() => { if (!bot._client.ended) bot.end('Protocol bridge stopped.'); });
        return bot;
      }
      await session.close();
      controller.signal.throwIfAborted();
      return this.createNativeBot(realmId, detected);
    } catch (error) { await bridge?.close(); await session?.close(); throw error; }
    finally { this.pendingConnections.delete(controller); }
  }
  createNativeBot(realmId, detected) {
    return mineflayer.createBot({
      username: 'companion-account', auth: 'microsoft', profilesFolder: secureCacheFactory(this.directory),
      realms: { realmId }, version: detected, hideErrors: true, logErrors: false,
      onMsaCode: () => { this.auth.status = 'expired'; this.emit('diagnostic', 'Session expired. Use Connect Minecraft Account to sign in again.'); this.emit('change'); throw new Error('Session expired. Sign in again.'); },
    });
  }
  async closeConnection() { await Promise.allSettled([...this.connections].map(close => close())); }
  async close() { await this.cancelAuth(); await this.closeConnection(); }
}
