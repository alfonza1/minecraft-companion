import { spawn } from 'node:child_process';
import { createServer as createHttpServer } from 'node:http';
import net from 'node:net';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

export const BRIDGE_VERSION = '3.4.14';
export const BRIDGE_CLIENT_VERSION = '26.1';
export const BRIDGE_PROXY_SHA256 = '2894bbfb2f4342f8fde887af6c689313efd5b0e46a8006775eea0e21e2948ab5';
export const BRIDGE_PROTOCOLS = new Map([[777, '26.3']]);
export const bridgeDirectory = join(process.env.LOCALAPPDATA || join(homedir(), '.local', 'share'), 'MinecraftCompanion', 'protocol-bridge');
const SOURCES = ['BridgeConfiguration.java', 'CompanionBridgeMain.java', 'CompanionBridgePlugin.java'];

export function bridgeSourcesHash() {
  const root = fileURLToPath(new URL('./java/companion/bridge/', import.meta.url));
  const hash = createHash('sha256');
  for (const name of SOURCES) hash.update(readFileSync(join(root, name)));
  hash.update(readFileSync(fileURLToPath(new URL('./java/viaproxy.yml', import.meta.url))));
  return hash.digest('hex');
}

export function bridgeRuntimeHash() {
  return createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).update(readFileSync(fileURLToPath(new URL('./client.js', import.meta.url)))).digest('hex');
}

function readManifest() {
  const file = join(bridgeDirectory, 'runtime.json');
  if (statSync(file).size > 64_000) throw new Error('Invalid bridge manifest.');
  const value = JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  for (const field of ['proxyJar', 'classpathJar', 'pluginJar']) {
    if (typeof value[field] !== 'string' || !resolve(value[field]).toLowerCase().startsWith((resolve(bridgeDirectory) + sep).toLowerCase())) throw new Error('Bridge artifact escaped its dedicated cache.');
  }
  if (value.proxyVersion !== BRIDGE_VERSION || value.sourcesHash !== bridgeSourcesHash()) throw new Error('Bridge needs rebuilding after its sources changed.');
  for (const field of ['java', 'proxyJar', 'classpathJar', 'pluginJar']) if (!existsSync(value[field])) throw new Error('Bridge artifact missing.');
  return value;
}

export function getBridgeStatus() {
  let installed = false, error = null, verified = false;
  try {
    const manifest = readManifest(); installed = true;
    const evidence = JSON.parse(readFileSync(join(bridgeDirectory, 'verification.json'), 'utf8'));
    verified = evidence.proxySha256 === BRIDGE_PROXY_SHA256 && evidence.sourcesHash === manifest.sourcesHash && evidence.runtimeHash === bridgeRuntimeHash() && evidence.serverVersion === '26.3' && evidence.passed === true;
  } catch (failure) { error = installed ? null : 'Protocol bridge is not installed or needs repair. Run Bootstrap.ps1.'; }
  return { installed, version: BRIDGE_VERSION, verified, clientVersion: BRIDGE_CLIENT_VERSION, serverVersions: [...BRIDGE_PROTOCOLS.values()], error,
    limitations: ['26.3 blocks and items are translated into a 26.1 client view; newer identities can be mapped.', 'Exact construction, raw-material accounting and assigned gathering are disabled on translated connections.', 'Real Realm authentication still requires your licensed account and invitation.'] };
}

async function digest(file) { return createHash('sha256').update(await readFile(file)).digest('hex'); }
async function verifiedManifest() {
  const manifest = readManifest();
  const cache = (await realpath(bridgeDirectory)).toLowerCase() + sep;
  for (const field of ['proxyJar', 'classpathJar', 'pluginJar']) if (!(await realpath(manifest[field])).toLowerCase().startsWith(cache)) throw new Error('Bridge cache link escaped its directory.');
  if (await digest(manifest.proxyJar) !== BRIDGE_PROXY_SHA256 || await digest(manifest.classpathJar) !== manifest.classpathSha256 || await digest(manifest.pluginJar) !== manifest.pluginSha256 || await digest(manifest.java) !== manifest.javaSha256) throw new Error('Bridge checksum validation failed. Run Bootstrap.ps1 to repair it.');
  return manifest;
}
function listen(server) { return new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => { server.off('error', reject); resolve(server.address().port); }); }); }
async function freePort() { const server = net.createServer(); const port = await listen(server); await new Promise(resolve => server.close(resolve)); return port; }

export async function startBridge({ host, port, serverVersion, profile, certificates = null, joinServer, signal }) {
  if (typeof host !== 'string' || !/^[a-zA-Z0-9.-]+$/.test(host) || !Number.isInteger(port) || port < 1 || port > 65535 || ![...BRIDGE_PROTOCOLS.values()].includes(serverVersion)) throw new Error('Unsupported bridge destination.');
  if (!/^[a-fA-F0-9]{32}$/.test(profile?.id || '') || !/^[A-Za-z0-9_]{1,16}$/.test(profile?.name || '')) throw new Error('A licensed Minecraft profile is required by the protocol bridge.');
  signal?.throwIfAborted();
  const manifest = await verifiedManifest();
  signal?.throwIfAborted();
  await mkdir(bridgeDirectory, { recursive: true });
  const runDirectory = await mkdtemp(join(bridgeDirectory, 'run-'));
  const capability = randomBytes(32).toString('hex');
  const allowedUsername = `CMP${randomBytes(6).toString('hex')}`;
  const controller = new AbortController();
  const logs = [];
  let child, exitPromise, closing, joinRequests = 0;
  const callback = createHttpServer(async (request, response) => {
    const actual = Buffer.from(request.headers.authorization || ''); const expected = Buffer.from(`Bearer ${capability}`);
    if (request.method !== 'POST' || request.url !== '/join' || actual.length !== expected.length || !timingSafeEqual(actual, expected)) { response.writeHead(403).end(); return; }
    try {
      if (++joinRequests > 3 || !joinServer) throw new Error('Session join unavailable.');
      let input = '';
      for await (const chunk of request) { input += chunk; if (input.length > 2048) throw new Error('Oversized session join request.'); }
      const { serverIdHash } = JSON.parse(input);
      if (typeof serverIdHash !== 'string' || !/^-?[0-9a-f]{1,40}$/.test(serverIdHash)) throw new Error('Invalid server join hash.');
      await joinServer(serverIdHash, controller.signal);
      response.writeHead(204).end();
    } catch { response.writeHead(502).end(); }
  });
  const bridge = {
    host: '127.0.0.1', port: null, username: allowedUsername, version: BRIDGE_CLIENT_VERSION,
    diagnostics: () => logs.join('').slice(-12_000),
    close() {
      if (closing) return closing;
      closing = (async () => {
        controller.abort(); signal?.removeEventListener('abort', abort);
        callback.closeAllConnections(); await new Promise(resolve => callback.close(() => resolve()));
        if (child && child.exitCode === null && child.signalCode === null) child.kill();
        await exitPromise;
        const target = resolve(runDirectory), base = resolve(bridgeDirectory) + sep;
        if (target.startsWith(base) && target.slice(base.length).startsWith('run-')) await rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      })();
      return closing;
    },
    onExit(handler) { exitPromise?.then(handler); },
  };
  const abort = () => { void bridge.close(); };
  try {
    const callbackPort = await listen(callback);
    const localPort = await freePort(); bridge.port = localPort;
    const { copyFile } = await import('node:fs/promises');
    await mkdir(join(runDirectory, 'plugins'));
    await copyFile(manifest.pluginJar, join(runDirectory, 'plugins', 'CompanionBridgePlugin.jar'));
    const args = ['-Xms64M', '-Xmx256M', '-XX:ActiveProcessorCount=2', '-Djava.awt.headless=true', '-Dviaproxy.enableViaBedrock=false', '-Dviaproxy.enableViaLegacy=false', '-Dviaproxy.enableViaRewind=false', '-Dviaproxy.enableViaAprilFools=false', '-DskipUpdateCheck', '-cp', `${manifest.classpathJar}${process.platform === 'win32' ? ';' : ':'}${manifest.proxyJar}`, 'companion.bridge.CompanionBridgeMain', 'cli', '--bind-address', `127.0.0.1:${localPort}`, '--target-address', `${host}:${port}`, '--target-version', serverVersion, '--proxy-online-mode', 'false', '--auth-method', 'NONE', '--chat-signing', 'true'];
    signal?.throwIfAborted();
    child = spawn(manifest.java, args, { cwd: runDirectory, env: { ...process.env, VP_RUN_DIR: runDirectory }, windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
    exitPromise = new Promise(resolve => child.once('close', (code, exitSignal) => { controller.abort(); resolve({ code, signal: exitSignal }); }));
    child.on('error', () => controller.abort());
    for (const output of [child.stdout, child.stderr]) output.on('data', data => { if (logs.join('').length < 64_000) logs.push(String(data)); });
    child.stdin.on('error', () => {});
    child.stdin.end(JSON.stringify({ callback: `http://127.0.0.1:${callbackPort}`, capability, profile, certificates, allowedUsername }) + '\n');
    signal?.addEventListener('abort', abort, { once: true });
    const started = Date.now();
    while (true) {
      signal?.throwIfAborted();
      if (controller.signal.aborted || Date.now() - started > 20_000) throw new Error('Protocol bridge did not start.');
      const ready = await new Promise(resolve => { const socket = net.connect(localPort, '127.0.0.1'); socket.once('connect', () => { socket.destroy(); resolve(true); }); socket.once('error', () => resolve(false)); socket.setTimeout(300, () => { socket.destroy(); resolve(false); }); });
      if (ready) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return bridge;
  } catch (error) { error.bridgeDiagnostics = bridge.diagnostics(); await bridge.close(); throw error; }
}
