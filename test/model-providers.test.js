import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../services/memory/store.js';
import { createApp } from '../services/api/index.js';
import { createProviderRegistry } from '../services/agent-orchestrator/providers/index.js';
import { createOrchestrator, codexRequest, codexBlueprintRequest } from '../services/agent-orchestrator/index.js';
import { withOpenCode, parseModelRef } from '../services/agent-orchestrator/providers/opencode.js';
import { modelSelection } from '../packages/shared-types/providers.js';
import { setupIssues } from '../packages/shared-types/setup-issues.js';
import { claudeEnvironment } from '../services/agent-orchestrator/providers/claude.js';

const catalog = (id = 'provider/model') => ({ models: [{ id, displayName: 'Fixture model', isDefault: true }], defaultModel: id, observedAt: new Date().toISOString(), status: { available: true, authenticated: null, error: null }, accessVerified: false });

test('provider choices migrate existing Codex settings and keep each model independently through real API persistence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'companion-providers-')), store = new Store(directory);
  store.put('settings', { id: 'settings', model: 'existing-codex' });
  store.put('memories', { id: 'base', label: 'Base', value: '12,64,12' });
  store.put('tasks', { id: 'saved-task', status: 'saved' });
  const registry = createProviderRegistry({ discoverClaude: async () => catalog('sonnet'), discoverOpenCode: async () => catalog('fixture/local') });
  const app = await createApp({ store, skipExtensions: true, providerRegistry: registry });
  const post = payload => app.inject({ method: 'POST', url: '/api/settings', payload, headers: { host: '127.0.0.1:4365' } });
  try {
    assert.deepEqual(modelSelection(store.settings()), { provider: 'codex', model: 'existing-codex' });
    assert.equal((await post({ provider: 'claude', providerModels: { claude: 'sonnet' } })).statusCode, 200);
    assert.equal((await post({ provider: 'opencode', providerModels: { opencode: 'fixture/local' } })).statusCode, 200);
    assert.deepEqual(store.settings().providerModels, { claude: 'sonnet', opencode: 'fixture/local' });
    assert.equal((await post({separateConversationModel:true,conversationModels:{claude:'haiku',codex:'gpt-6-luna'}})).statusCode,200);
    assert.deepEqual(modelSelection(store.settings(),'conversation'),{provider:'opencode',model:'fixture/local'});
    assert.equal((await post({conversationModels:{opencode:'fixture/chat'}})).statusCode,200);
    assert.equal(modelSelection(store.settings(),'conversation').model,'fixture/chat');assert.equal(modelSelection(store.settings(),'work').model,'fixture/local');
    assert.equal(store.settings().conversationModels.claude,'haiku');
    assert.equal((await post({conversationModels:{codex:'--bad;command'}})).statusCode,400);
    assert.equal((await post({ provider: 'bad' })).statusCode, 400); assert.equal((await post({ providerModels: { claude: '--help;bad' } })).statusCode, 400);
    const response = await app.inject({ url: '/api/ai/opencode/models', headers: { host: '127.0.0.1:4365' } });
    assert.equal(response.statusCode, 200); assert.equal(response.json().defaultModel, 'fixture/local');
    assert.equal(app.companion.snapshot().usage.requests, 0);
    assert.equal(store.get('memories')[0].value, '12,64,12'); assert.equal(store.get('tasks')[0].status, 'saved');
  } finally { await app.close(); }
  const reopened = new Store(directory); assert.equal(reopened.settings().provider, 'opencode'); assert.equal(reopened.settings().model, 'existing-codex'); assert.equal(reopened.settings().providerModels.claude, 'sonnet');assert.equal(reopened.settings().conversationModels.claude,'haiku');assert.equal(reopened.settings().conversationModels.codex,'gpt-6-luna'); reopened.close(); await rm(directory, { recursive: true, force: true });
});

test('external catalogs coalesce, cache and filter unsafe IDs without claiming verified account access', async () => {
  let discoveries = 0, calls = 0;
  const registry = createProviderRegistry({ discoverOpenCode: async () => { discoveries++; return { ...catalog(), models: [...catalog().models, { id: '--bad', displayName: 'bad' }] }; }, openCodeRequest: async (prompt, options) => { calls++; return { model: options.model }; } });
  try {
    const [a, b] = await Promise.all([registry.get('opencode'), registry.get('opencode')]);
    assert.equal(discoveries, 1); assert.deepEqual(a, b); assert.equal(a.models.length, 1); assert.equal(a.accessVerified, false); assert.equal(calls, 0);
    await registry.get('opencode'); assert.equal(discoveries, 1);
    await registry.execute('opencode', 'Fixture prompt', {}); assert.equal(calls, 1);
    await registry.get('opencode', { refresh: true }); assert.equal(discoveries, 2);
    await assert.rejects(registry.get('constructor'), /Unknown/);
    assert.deepEqual(parseModelRef('openrouter/provider/model'), { providerID: 'openrouter', id: 'provider/model' });
  } finally { await registry.close(); }
});

test('Claude and OpenCode pass through the same validated conversation and blueprint boundaries', async () => {
  for (const provider of ['claude', 'opencode']) {
    let bad = false;
    const providerRegistry = { execute: async (_provider, _prompt, options) => {
      assert.equal(_provider, provider); assert.ok(options.schema.properties);
      return { model: 'fixture-model', usage: null, data: { reply: 'Hi.', intent: 'general', actions: bad ? [{ tool: 'bash', args: '{}' }] : [] } };
    } };
    const response = await codexRequest('Fixture chat', { provider, providerRegistry }); assert.equal(response.plan.reply, 'Hi.'); assert.deepEqual(response.plan.actions, []);
    bad = true; await assert.rejects(codexRequest('Fixture malicious output', { provider, providerRegistry }), /Non-action|Unsupported/);
    providerRegistry.execute = async () => ({ model: 'fixture-model', usage: null, data: { version: '1.21.5', dimensions: { x: 1, y: 1, z: 1 }, blocks: [{ x: 0, y: 0, z: 0, name: 'cobblestone', properties: '{}', section: 'foundation' }], uncertainties: [] } });
    const design = await codexBlueprintRequest({ description: 'One block fixture', version: '1.21.5' }, { provider, providerRegistry }); assert.equal(design.blueprint.blocks[0].name, 'cobblestone');
  }
});

test('switching provider during inference preserves the active selection, saved task and next-request context', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'companion-provider-turn-')), store = new Store(directory);
  store.updateSettings({ model: 'codex-fixture', providerModels: { opencode: 'fixture/local' } });
  let paused = false, finish; const requests = [];
  const runtime = Object.assign(new EventEmitter(), { snapshot: () => ({ world: null, currentTask: { name: 'gather wood' } }), isActive: () => !paused });
  const orchestrator = createOrchestrator({ store, runtime, publish() {}, request: async (prompt, options) => { requests.push({ prompt, options }); await new Promise(resolve => { finish = resolve; }); return { model: options.model, usage: options.provider === 'codex' ? { input_tokens: 11, output_tokens: 2 } : null, plan: { reply: 'Fixture reply.', intent: 'general', actions: [] } }; } });
  try {
    const first = orchestrator.respond('Tell me about Java.'); await new Promise(resolve => setImmediate(resolve));
    store.updateSettings({ provider: 'opencode' }); assert.equal(orchestrator.modelState.active.provider, 'codex'); assert.equal(requests[0].options.signal.aborted, false); finish(); await first;
    const next = orchestrator.respond('Now explain Python.'); await new Promise(resolve => setImmediate(resolve));
    assert.equal(orchestrator.modelState.active.provider, 'opencode'); assert.equal(requests[1].options.model, 'fixture/local'); assert.match(requests[1].prompt, /gather wood/); finish(); await next;
    assert.equal(orchestrator.modelState.last.provider, 'opencode'); assert.equal(orchestrator.usage.inputTokens, 11); assert.equal(orchestrator.usage.unreportedRequests, 1);
    paused = true; await assert.rejects(orchestrator.respond('Explain more.'), /Resume/); assert.equal(requests.length, 2);
  } finally { await orchestrator.close(); store.close(); await rm(directory, { recursive: true, force: true }); }
});

test('cancelled OpenCode inference closes the actual private native-worker boundary before returning', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'companion-provider-process-')), script = join(directory, 'fixture.cjs'), pidFile = join(directory, 'pid.txt');
  await writeFile(script, `const http=require('node:http'),fs=require('node:fs');fs.writeFileSync(${JSON.stringify(pidFile)},String(process.pid));const port=Number(process.argv[process.argv.indexOf('--port')+1]);http.createServer((req,res)=>{if(req.headers.authorization!=='Basic '+Buffer.from('opencode:'+process.env.OPENCODE_SERVER_PASSWORD).toString('base64')){res.writeHead(401).end();return;}if(req.url==='/api/info'){res.setHeader('Content-Type','application/json');res.end('{}');}}).listen(port,'127.0.0.1');`);
  const controller = new AbortController();
  try {
    const pending = withOpenCode(async request => { setTimeout(() => controller.abort(), 30); return request('/api/experimental/generate/text', { prompt: 'fixture' }); }, { signal: controller.signal, command: process.execPath, prefix: [script] });
    await assert.rejects(pending, { name: 'AbortError' });
    const pid = Number(await readFile(pidFile, 'utf8')); assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('setup issues follow the selected provider instead of requiring an unused Codex account', () => {
  const state = { planning: true, settings: { provider: 'opencode' }, auth: {}, connection: {}, voice: {}, codex: { available: false, authenticated: false }, ai: { available: true, authenticated: null } };
  assert.deepEqual(setupIssues(state), []);
  state.settings.provider = 'claude'; state.ai.authenticated = false; assert.equal(setupIssues(state)[0].id, 'model-provider');
});

test('Claude subscription adapter strips API-key and third-party billing fallbacks without altering the parent environment', () => {
  const base = { PATH: 'fixture-path', ANTHROPIC_API_KEY: 'fixture-key', ANTHROPIC_BASE_URL: 'https://example.invalid', CLAUDE_CODE_USE_BEDROCK: '1', CLAUDE_CODE_OAUTH_TOKEN: 'fixture-subscription' };
  const env = claudeEnvironment(base);
  assert.equal(env.ANTHROPIC_API_KEY, undefined); assert.equal(env.ANTHROPIC_BASE_URL, undefined); assert.equal(env.CLAUDE_CODE_USE_BEDROCK, undefined);
  assert.equal(env.CLAUDE_CODE_OAUTH_TOKEN, 'fixture-subscription'); assert.equal(env.PATH, 'fixture-path'); assert.equal(base.ANTHROPIC_API_KEY, 'fixture-key');
});

test('cancelling a request during model discovery cannot later start external inference', async () => {
  let calls = 0;
  const registry = createProviderRegistry({ discoverOpenCode: signal => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })), openCodeRequest: async () => { calls++; } });
  const controller = new AbortController();
  const request = registry.execute('opencode', 'Fixture', { signal: controller.signal });
  await new Promise(resolve => setImmediate(resolve)); controller.abort();
  await assert.rejects(request, { name: 'AbortError' }); assert.equal(calls, 0); await registry.close();
});
