import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { locateCodex } from './codex-cli.js';

export const MODEL_CATALOG_TTL_MS = 5 * 60_000;
const MAX_CATALOG_PAGES = 5;
const MAX_CATALOG_BYTES = 1_000_000;
const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,99}$/;
// Discovery is metadata only: no threads, turns, prompts, or credential reads.
export const CATALOG_ARGUMENTS = ['app-server', '--listen', 'stdio://', '--disable', 'shell_tool', '--disable', 'apps', '--disable', 'hooks', '--disable', 'multi_agent', '-c', 'features.code_mode.enabled=false', '-c', 'web_search="disabled"', '-c', 'mcp_servers={}', '-c', 'plugins={}'];

export function normalizeModelCatalog(entries) {
  if (!Array.isArray(entries)) throw new Error('Codex returned an invalid model catalog.');
  const seen = new Set();
  const models = [];
  for (const entry of entries) {
    if (!entry || entry.hidden || typeof entry.model !== 'string' || !MODEL_ID.test(entry.model) || seen.has(entry.model)) continue;
    seen.add(entry.model);
    models.push({ id: entry.model, displayName: String(entry.displayName || entry.model).slice(0, 120), description: typeof entry.description === 'string' ? entry.description.slice(0, 500) : '', isDefault: entry.isDefault === true });
  }
  if (!models.length) throw new Error('Codex did not report any visible models. Sign in and refresh the model list.');
  return { models, defaultModel: models.find(model => model.isDefault)?.id || null, observedAt: new Date().toISOString(), source: 'codex-app-server', accessVerified: false };
}

export function queryModelCatalog({ command, args = [], cwd, signal, timeoutMs = 15_000 }) {
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted();
    const child = spawn(command, args, { cwd, windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
    const lines = createInterface({ input: child.stdout });
    let failure, result, size = 0, pages = 0;
    const entries = [], cursors = new Set();
    const fail = error => { failure ||= error; child.kill(); };
    const send = message => { if (!failure && !result) child.stdin.write(`${JSON.stringify(message)}\n`); };
    const abort = () => fail(signal.reason || new DOMException('Model discovery cancelled.', 'AbortError'));
    const timer = setTimeout(() => fail(new Error('Codex model discovery timed out. Check Codex sign-in and refresh.')), timeoutMs);
    signal?.addEventListener('abort', abort, { once: true });
    child.stdin.on('error', () => {}); child.stderr.resume();
    child.stdout.on('data', chunk => { size += chunk.length; if (size > MAX_CATALOG_BYTES) fail(new Error('Codex model catalog exceeded its size limit.')); });
    child.on('error', () => fail(new Error('Could not start Codex model discovery. Check the local Codex installation.')));
    lines.on('line', line => {
      if (failure || result) return;
      try {
        const message = JSON.parse(line);
        if (message.id !== 1 && message.id !== 2) return;
        if (message.error) throw new Error('Codex could not list models. Check Codex sign-in and refresh.');
        if (message.id === 1) {
          send({ method: 'initialized' });
          send({ id: 2, method: 'model/list', params: { limit: 100, includeHidden: false } });
        } else {
          if (!Array.isArray(message.result?.data)) throw new Error('Codex returned an invalid model catalog.');
          entries.push(...message.result.data); pages++;
          const cursor = message.result.nextCursor;
          if (cursor) {
            if (typeof cursor !== 'string' || cursor.length > 2000 || cursors.has(cursor) || pages >= MAX_CATALOG_PAGES) throw new Error('Codex model catalog pagination exceeded its limit.');
            cursors.add(cursor); send({ id: 2, method: 'model/list', params: { limit: 100, includeHidden: false, cursor } });
          } else { result = normalizeModelCatalog(entries); child.kill(); }
        }
      } catch (error) { fail(error instanceof SyntaxError ? new Error('Codex model discovery returned unreadable data.') : error); }
    });
    child.on('close', () => {
      clearTimeout(timer); signal?.removeEventListener('abort', abort); lines.close();
      failure ? reject(failure) : result ? resolve(result) : reject(new Error('Codex model discovery ended before returning a model list.'));
    });
    send({ id: 1, method: 'initialize', params: { clientInfo: { name: 'minecraft_companion', title: 'Minecraft Companion', version: '0.1.0' } } });
  });
}

export function createModelCatalog({ discover, clock = Date.now } = {}) {
  let cached = null, expires = 0, pending = null, controller = null;
  const read = discover || (async signal => {
    const directory = await mkdtemp(join(tmpdir(), 'companion-model-catalog-'));
    try { const [command, prefix] = await locateCodex(); return await queryModelCatalog({ command, args: [...prefix, ...CATALOG_ARGUMENTS], cwd: directory, signal }); }
    finally { await rm(directory, { recursive: true, force: true }); }
  });
  return {
    async get({ refresh = false } = {}) {
      if (pending) return pending;
      if (!refresh && cached && clock() < expires) return cached;
      controller = new AbortController();
      pending = Promise.resolve().then(() => read(controller.signal)).then(value => { cached = value; expires = clock() + MODEL_CATALOG_TTL_MS; return value; });
      try { return await pending; } finally { pending = null; controller = null; }
    },
    async close() { controller?.abort(); await pending?.catch(() => {}); },
  };
}

export async function resolveRequestModel(model, catalog, signal) {
  if (model) return model;
  if (!catalog) return null;
  let abort;
  try {
    signal?.throwIfAborted();
    const cancelled = new Promise((_, reject) => {
      abort = () => reject(signal.reason || new DOMException('Cancelled', 'AbortError'));
      signal?.addEventListener('abort', abort, { once: true });
    });
    return (await Promise.race([catalog.get(), cancelled])).defaultModel;
  } catch (error) { signal?.throwIfAborted(); return null; }
  finally { signal?.removeEventListener('abort', abort); }
}
