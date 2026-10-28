import { spawn } from 'node:child_process';
import { MODEL_PROVIDERS } from '../../../packages/shared-types/providers.js';
import { claudeCatalog, executeClaude, locateClaude, claudeEnvironment } from './claude.js';
import { openCodeCatalog, executeOpenCode } from './opencode.js';
import { resolveRequestModel } from '../models.js';

export function createProviderRegistry({ modelCatalog, publish = () => {}, discoverClaude = claudeCatalog, discoverOpenCode = openCodeCatalog, claudeRequest = executeClaude, openCodeRequest = executeOpenCode } = {}) {
  const cache = new Map(), pending = new Map(), controllers = new Map(); let login = null;
  const discover = { claude: discoverClaude, opencode: discoverOpenCode };
  const status = provider => cache.get(provider)?.status || { available: null, authenticated: null, error: null, version: null };
  const get = async (provider, { refresh = false } = {}) => {
    if (!Object.hasOwn(MODEL_PROVIDERS, provider)) throw new Error('Unknown model provider.');
    if (provider === 'codex') return modelCatalog.get({ refresh });
    if (pending.has(provider)) return pending.get(provider);
    if (!refresh && cache.get(provider)?.expires > Date.now()) return cache.get(provider).catalog;
    const controller = new AbortController(); controllers.set(provider, controller);
    const job = Promise.resolve().then(() => discover[provider](controller.signal)).then(catalog => {
      const models = catalog.models.filter(model => /^[A-Za-z0-9][A-Za-z0-9_.:/+\[\]@-]{0,199}$/.test(model.id));
      const safe = { ...catalog, models }; cache.set(provider, { catalog: safe, status: catalog.status, expires: Date.now() + 300000 }); publish(); return safe;
    }).catch(error => { cache.set(provider, { status: { available: false, authenticated: null, version: null, error: `${MODEL_PROVIDERS[provider]} model discovery failed. Check its installation, then refresh.` }, expires: 0 }); publish(); throw new Error(status(provider).error); }).finally(() => { pending.delete(provider); controllers.delete(provider); });
    pending.set(provider, job); return job;
  };
  return { get, status,
    async execute(provider, prompt, options) {
      if (!['claude', 'opencode'].includes(provider)) throw new Error('Unsupported external model provider.');
      const model = await resolveRequestModel(options.model, { get: () => get(provider) }, options.signal);
      options.signal?.throwIfAborted();
      if (!model) throw new Error('Select a model in Settings.');
      options.onModel?.(model);
      return (provider === 'claude' ? claudeRequest : openCodeRequest)(prompt, { ...options, model });
    },
    async startClaudeLogin() {
      if (login) return { started: true };
      const executable = await locateClaude();
      if (login) return { started: true };
      const child = spawn(executable, ['auth', 'login'], { shell: false, windowsHide: true, env: claudeEnvironment(), stdio: 'ignore' });
      login = { child, closed: new Promise(resolve => { child.once('error', resolve); child.once('close', resolve); }) };
      const current = login;
      current.closed.finally(() => { if (login === current) login = null; cache.delete('claude'); publish(); });
      return { started: true };
    },
    async close() { for (const controller of controllers.values()) controller.abort(); login?.child.kill(); await Promise.allSettled([...pending.values(), ...(login ? [login.closed] : [])]); },
  };
}
