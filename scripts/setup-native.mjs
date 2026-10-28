import { cp, mkdir, readFile, writeFile, rename, rm, realpath } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const lockBytes = await readFile(path.join(root, 'services/native-26.3/dependencies.lock.json'));
const lock = JSON.parse(lockBytes);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const lockHash = digest(JSON.stringify(lock));
const parent = path.join(root, 'node_modules', '.companion-native');
const target = path.join(parent, lock.version);
const staging = path.join(parent, `install-${randomUUID()}`);
const previous = path.join(parent, `previous-${randomUUID()}`);
const MAX_DOWNLOAD_BYTES = 25 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 30000;
const DOWNLOAD_BATCH_SIZE = 6;
function safeRelative(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_.\/-]+$/.test(value) || value.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('Invalid native dependency path.');
  return value;
}
async function removeOwned(directory) {
  const resolved = await realpath(directory);
  const boundary = await realpath(parent);
  if (!resolved.startsWith(boundary + path.sep)) throw new Error('Native cleanup path escaped its installation directory.');
  await rm(resolved, { recursive: true, force: true });
}
for (const [name, version] of Object.entries(lock.baseVersions)) {
  safeRelative(name);
  if (require(`${name}/package.json`).version !== version) throw new Error(`Expected ${name}@${version}. Run npm ci first.`);
}
async function installationIsCurrent() {
  try {
    if (JSON.parse(await readFile(path.join(target, 'ready.json'))).lockHash !== lockHash) return false;
    for (const file of lock.files) if (digest(await readFile(path.join(target, safeRelative(file.target)))) !== file.sha256) return false;
    return true;
  } catch { return false; }
}
if (await installationIsCurrent()) {
  console.log(`Native Minecraft ${lock.version} is current; ${lock.files.length} checksums verified.`);
  process.exit(0);
}
if (process.argv.includes('--check')) { console.error('Native 26.3 adapter needs installation. Run npm run setup:native.'); process.exit(1); }
try {
  const response = await fetch('http://127.0.0.1:4365/api/state', { signal: AbortSignal.timeout(1000) });
  if (response.ok) {
    const state = await response.json();
    if (state.state !== 'DISCONNECTED' || state.connection?.status === 'connecting') throw new Error('Stop Companion before updating its native protocol dependencies.');
  }
} catch (error) { if (error.message.startsWith('Stop Companion')) throw error; }
await mkdir(staging, { recursive: true });
try {
  for (const name of Object.keys(lock.baseVersions).filter(name => name !== 'minecraft-data')) {
    await cp(path.join(root, 'node_modules', name), path.join(staging, name), { recursive: true, dereference: false });
  }
  // Pinned files only; no package lifecycle scripts, moving branches or remote code
  // evaluation. Packages retain the released manifests and licenses from npm ci.
  for (let offset = 0; offset < lock.files.length; offset += DOWNLOAD_BATCH_SIZE) {
    const downloads = await Promise.allSettled(lock.files.slice(offset, offset + DOWNLOAD_BATCH_SIZE).map(async file => {
      safeRelative(file.source); safeRelative(file.target);
      const source = lock.repositories[file.package];
      if (!source || !/^[a-f0-9]{40}$/.test(source.commit) || !/^[A-Za-z0-9-]+$/.test(source.repo)) throw new Error('Invalid native dependency source.');
      const url = `https://raw.githubusercontent.com/DallasCarraher/${source.repo}/${source.commit}/${file.source}`;
      const response = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
      if (!response.ok) throw new Error(`Native dependency download failed (${response.status}): ${file.target}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length > MAX_DOWNLOAD_BYTES || digest(bytes) !== file.sha256) throw new Error(`Native dependency checksum mismatch: ${file.target}`);
      const destination = path.join(staging, file.target);
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, bytes);
    }));
    const failure = downloads.find(result => result.status === 'rejected');
    if (failure) throw failure.reason;
  }
  await writeFile(path.join(staging, 'ready.json'), JSON.stringify({ lockHash, installedAt: new Date().toISOString() }));
  const hadPrevious = existsSync(target);
  if (hadPrevious) await rename(target, previous);
  try { await rename(staging, target); }
  catch (error) { if (hadPrevious) await rename(previous, target); throw error; }
  if (hadPrevious) await removeOwned(previous);
  console.log(`Installed pinned native Minecraft ${lock.version} (protocol ${lock.protocol}); ${lock.files.length} checksums verified.`);
} finally { if (existsSync(staging)) await removeOwned(staging); }
