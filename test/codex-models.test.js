import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { normalizeModelCatalog, queryModelCatalog, createModelCatalog, resolveRequestModel, CATALOG_ARGUMENTS } from '../services/agent-orchestrator/models.js';
import { createOrchestrator } from '../services/agent-orchestrator/index.js';
import { createApp } from '../services/api/index.js';
import { Store } from '../services/memory/store.js';

const entries = [{ model: 'fixture-fast', displayName: 'Fixture Fast', isDefault: true }, { model: 'fixture-deep', displayName: 'Fixture Deep', isDefault: false }];
const catalog = () => normalizeModelCatalog(entries);

test('model catalog keeps reported defaults, filters unsafe/hidden IDs and never invents account access', () => {
  const value = normalizeModelCatalog([...entries, null, { model: 'hidden', hidden: true }, { model: 'fixture-fast' }, { model: '--help' }, { model: '--model;command' }]);
  assert.equal(value.models.length, 2); assert.equal(value.defaultModel, 'fixture-fast'); assert.equal(value.accessVerified, false);
  assert.equal(normalizeModelCatalog([{ model: 'fixture-fast' }]).defaultModel, null);
  assert.throws(() => normalizeModelCatalog([]), /did not report/);
  assert.ok(CATALOG_ARGUMENTS.includes('stdio://')); assert.equal(CATALOG_ARGUMENTS.includes('turn/start'), false);
});

test('actual discovery subprocess initializes, paginates and exits without starting any model turn', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'companion-model-rpc-')), script = join(directory, 'fake.cjs');
  try {
    await writeFile(script, `const fs=require('node:fs'),rl=require('node:readline').createInterface({input:process.stdin});fs.writeFileSync('pid.txt',String(process.pid));let initialized=false;
rl.on('line',line=>{const m=JSON.parse(line);if(m.method==='initialize')process.stdout.write(JSON.stringify({id:m.id,result:{}})+'\\n');else if(m.method==='initialized')initialized=true;else if(m.method==='model/list'&&initialized)process.stdout.write(JSON.stringify({id:m.id,result:{data:[{model:m.params.cursor?'fixture-deep':'fixture-fast',isDefault:!m.params.cursor}],nextCursor:m.params.cursor?null:'next'}})+'\\n');else process.exit(3);});`);
    const value = await queryModelCatalog({ command: process.execPath, args: [script], cwd: directory });
    assert.deepEqual(value.models.map(model => model.id), ['fixture-fast', 'fixture-deep']); assert.equal(value.defaultModel, 'fixture-fast');
    const pid = Number(await readFile(join(directory, 'pid.txt'), 'utf8')); assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('discovery errors, repeated cursors, timeout and abort close actual child processes without exposing diagnostics', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'companion-model-errors-')), script = join(directory, 'fake.cjs');
  try {
    for (const mode of ['error', 'cursor', 'timeout', 'abort']) {
      await writeFile(script, `const fs=require('node:fs'),rl=require('node:readline').createInterface({input:process.stdin});fs.writeFileSync('pid.txt',String(process.pid));rl.on('line',line=>{const m=JSON.parse(line);if(m.method==='initialize')process.stdout.write(JSON.stringify({id:1,result:{}})+'\\n');else if(m.method==='model/list'){if('${mode}'==='error')process.stdout.write(JSON.stringify({id:2,error:{message:'synthetic-provider-secret'}})+'\\n');if('${mode}'==='cursor')process.stdout.write(JSON.stringify({id:2,result:{data:[],nextCursor:'same'}})+'\\n');}});`);
      const controller = new AbortController();
      const pending = queryModelCatalog({ command: process.execPath, args: [script], cwd: directory, signal: controller.signal, timeoutMs: mode === 'timeout' ? 150 : 5000 });
      if (mode === 'abort') setTimeout(() => controller.abort(), 150);
      await assert.rejects(pending, error => !error.message.includes('synthetic-provider-secret'));
      const pid = Number(await readFile(join(directory, 'pid.txt'), 'utf8')); assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('catalog refresh coalesces concurrent readers and cached reads make no extra discovery calls', async () => {
  let calls = 0, release;
  const service = createModelCatalog({ discover: async () => { calls++; await new Promise(resolve => { release = resolve; }); return catalog(); } });
  const first = service.get(), second = service.get(); await new Promise(resolve => setImmediate(resolve)); release();
  assert.deepEqual(await first, await second); await service.get(); assert.equal(calls, 1);
  const refreshed = service.get({ refresh: true }); await new Promise(resolve => setImmediate(resolve)); release(); await refreshed; assert.equal(calls, 2); await service.close();
});

test('automatic requests resolve the reported default and cancellation does not wait for metadata', async () => {
  assert.equal(await resolveRequestModel('fixture-deep', { get() { throw Error('Explicit models must not need discovery.'); } }), 'fixture-deep');
  assert.equal(await resolveRequestModel('', { get: async () => catalog() }), 'fixture-fast');
  const controller = new AbortController(), pending = resolveRequestModel('', { get: () => new Promise(() => {}) }, controller.signal);
  controller.abort(); await assert.rejects(pending, { name: 'AbortError' });
});

test('model selection persists through the real API while paused and catalog discovery spends zero model requests', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'companion-model-api-')), store = new Store(directory); let discoveries = 0;
  const modelCatalog = createModelCatalog({ discover: async () => { discoveries++; return catalog(); } });
  const app = await createApp({ store, modelCatalog, skipExtensions: true });
  const post = (url, payload) => app.inject({ method: 'POST', url, payload, headers: { host: '127.0.0.1:4365' } });
  try {
    await post('/api/control', { command: 'plan' }); await post('/api/control', { command: 'pause' });
    assert.equal((await post('/api/settings', { model: 'fixture-deep' })).statusCode, 200);
    const response = await app.inject({ url: '/api/codex/models', headers: { host: '127.0.0.1:4365' } }); assert.equal(response.json().defaultModel, 'fixture-fast');
    assert.equal((await post('/api/settings', { model: 'bad;command' })).statusCode, 400);
    const state = (await app.inject({ url: '/api/state', headers: { host: '127.0.0.1:4365' } })).json();
    assert.equal(state.state, 'PAUSED'); assert.equal(state.settings.model, 'fixture-deep'); assert.equal(state.usage.requests, 0); assert.equal(discoveries, 1);
    assert.equal((await post('/api/codex/models/refresh', {})).statusCode, 200); assert.equal(discoveries, 2);
  } finally { await app.close(); }
  const reopened = new Store(directory); assert.equal(reopened.settings().model, 'fixture-deep'); reopened.close(); await rm(directory, { recursive: true, force: true });
});

test('an in-flight model keeps its original selection and completed model identity is persisted', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'companion-model-state-')), store = new Store(directory); store.updateSettings({ model: 'fixture-fast' });
  const runtime = Object.assign(new EventEmitter(), { isActive: () => true, snapshot: () => ({ world: null }) }); let finish;
  const orchestrator = createOrchestrator({ runtime, store, publish() {}, request: async (_prompt, options) => { options.onModel(options.model); await new Promise(resolve => { finish = resolve; }); return { model: options.model, plan: { reply: 'A short answer.', intent: 'general', actions: [] } }; } });
  try {
    const pending = orchestrator.respond('Tell me about Java.'); await new Promise(resolve => setImmediate(resolve));
    store.updateSettings({ model: 'fixture-deep' }); assert.equal(orchestrator.modelState.active.model, 'fixture-fast');
    finish(); await pending; assert.equal(orchestrator.modelState.active, null); assert.equal(orchestrator.modelState.last.model, 'fixture-fast'); assert.equal(store.get('modelRuns')[0].model, 'fixture-fast');
    const next = orchestrator.respond('Tell me about Python.'); await new Promise(resolve => setImmediate(resolve)); assert.equal(orchestrator.modelState.active.model, 'fixture-deep'); finish(); await next;
    assert.equal(orchestrator.modelState.last.model, 'fixture-deep');
  } finally { await orchestrator.close(); store.close(); await rm(directory, { recursive: true, force: true }); }
});
