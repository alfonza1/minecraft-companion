import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

// CacheFactory is prismarine-auth's supported extension point. Never fall back
// to plaintext if Windows cannot protect a token.
export async function dpapi(input, operation) {
  if (process.platform !== 'win32') throw new Error('Secure token persistence currently requires Windows DPAPI.');
  const method = operation === 'protect' ? 'Protect' : 'Unprotect';
  const script = `Add-Type -AssemblyName System.Security; $bytes=[Convert]::FromBase64String([Console]::In.ReadToEnd()); $result=[System.Security.Cryptography.ProtectedData]::${method}($bytes,$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($result))`;
  const command = Buffer.from(script, 'utf16le').toString('base64');
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', command], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '';
    const timeout = setTimeout(() => { child.kill(); reject(new Error('Windows token protection timed out.')); }, 15_000);
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.resume();
    child.on('error', reject);
    child.on('close', code => {
      clearTimeout(timeout);
      if (code !== 0) reject(new Error('Windows could not protect or unlock the Minecraft token cache.'));
      else resolve(Buffer.from(output.trim(), 'base64'));
    });
    child.stdin.on('error', () => {});
    child.stdin.end(Buffer.from(input).toString('base64'));
  });
}

export function secureCacheFactory(directory, codec = dpapi) {
  const caches = new Map();
  return ({ cacheName }) => {
    if (!/^[a-z]+$/.test(cacheName)) throw new Error('Invalid authentication cache name.');
    if (caches.has(cacheName)) return caches.get(cacheName);
    const path = join(directory, `${cacheName}.dpapi`);
    let cached;
    let queue = Promise.resolve();
    const api = {
      async getCached() {
        if (cached !== undefined) return cached;
        try { cached = JSON.parse((await codec(await readFile(path), 'unprotect')).toString('utf8')); }
        catch (error) { if (error.code !== 'ENOENT') throw error; cached = {}; }
        return cached;
      },
      async setCached(value) {
        cached = value;
        const data = JSON.stringify(value);
        const work = queue.catch(() => {}).then(async () => {
          await mkdir(directory, { recursive: true, mode: 0o700 });
          const temporary = `${path}.${randomUUID()}.tmp`;
          await writeFile(temporary, await codec(Buffer.from(data), 'protect'), { mode: 0o600 });
          await rename(temporary, path);
        });
        queue = work;
        await work;
      },
      async setCachedPartial(value) { await api.setCached({ ...await api.getCached(), ...value }); },
      async reset() { await api.setCached({}); return {}; },
    };
    caches.set(cacheName, api);
    return api;
  };
}
