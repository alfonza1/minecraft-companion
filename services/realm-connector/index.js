import { EventEmitter } from 'node:events';
import { fork } from 'node:child_process';
import { join } from 'node:path';
import mineflayer from 'mineflayer';
import mcProtocol from 'minecraft-protocol';
import minecraftData from 'minecraft-data';
import { secureCacheFactory } from './secure-cache.js';

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
  }
  connectAccount() {
    if (this.worker) return;
    this.auth = { ...this.auth, status: 'authenticating', device: null };
    this.emit('change');
    const worker = fork(new URL('./auth-worker.js', import.meta.url), [], { windowsHide: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
    this.worker = worker;
    const timeout = setTimeout(() => { this.cancelAuth(); this.auth.status = 'error'; this.emit('change'); }, 15 * 60_000);
    worker.on('message', message => {
      if (this.worker !== worker) return;
      if (message.type === 'device') {
        try { this.auth.device = deviceCodePrompt(message); }
        catch { this.auth.status = 'error'; this.auth.device = null; this.emit('diagnostic', 'Microsoft returned an invalid device prompt. Reconnect the account.'); void this.cancelAuth().catch(() => {}); }
      }
      if (message.type === 'profile') this.auth = { status: 'connected', username: message.username, device: null };
      if (message.type === 'realms') this.realms = message.realms;
      if (message.type === 'failure') { this.auth.status = 'error'; this.auth.device = null; this.emit('diagnostic', message.error); }
      this.emit('change');
    });
    worker.on('error', () => { this.auth.status = 'error'; this.emit('change'); });
    worker.on('exit', () => { clearTimeout(timeout); if (this.worker === worker) this.worker = null; });
    worker.send({ type: 'connect', directory: this.directory });
  }
  async cancelAuth() {
    await Promise.all([...this.preparations].map(worker => new Promise(resolve => { worker.once('exit', resolve); worker.kill(); })));
    const worker = this.worker;
    if (!worker) return;
    this.worker = null;
    await new Promise(resolve => { worker.once('exit', resolve); worker.kill(); });
    this.auth.device = null;
    if (this.auth.status === 'authenticating') this.auth.status = 'disconnected';
    this.emit('change');
  }
  async createBot(realmId) {
    if (this.auth.status !== 'connected') throw new Error('Connect the licensed Minecraft account first.');
    if (!this.realms.some(realm => realm.id === realmId)) throw new Error('Select a Realm available to the connected account.');
    const status = await new Promise((resolve, reject) => {
      const worker = fork(new URL('./auth-worker.js', import.meta.url), [], { windowsHide: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
      this.preparations.add(worker);
      const timeout = setTimeout(() => worker.kill(), 45_000);
      worker.on('message', message => {
        if (message.type === 'resolved') resolve(message);
        if (message.type === 'failure') reject(new Error(message.error));
      });
      worker.on('error', () => reject(new Error('Could not start secure Realm connection worker.')));
      worker.on('exit', () => { clearTimeout(timeout); this.preparations.delete(worker); reject(new Error('Realm connection preparation cancelled or timed out.')); });
      worker.send({ type: 'resolve', directory: this.directory, realmId });
    });
    const protocol = status.protocol;
    const detected = supportedVersionForProtocol(protocol);
    assertSupportedVersion(detected || status.version, protocol);
    return mineflayer.createBot({
      username: 'companion-account', auth: 'microsoft', profilesFolder: secureCacheFactory(this.directory),
      realms: { realmId }, version: detected, hideErrors: true, logErrors: false,
      onMsaCode: () => { this.auth.status = 'expired'; this.emit('diagnostic', 'Session expired. Use Connect Minecraft Account to sign in again.'); this.emit('change'); throw new Error('Session expired. Sign in again.'); },
    });
  }
  close() { return this.cancelAuth(); }
}
