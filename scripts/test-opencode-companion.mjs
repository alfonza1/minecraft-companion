import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../services/api/index.js';
import { Store } from '../services/memory/store.js';

if (!process.argv.includes('--live-opencode')) throw new Error('This check uses one real request on the existing OpenCode provider. Run with --live-opencode explicitly.');
const directory = await mkdtemp(join(tmpdir(), 'companion-live-provider-')), store = new Store(directory);
store.updateSettings({ provider: 'opencode', providerModels: { opencode: 'abliteration-ai/abliterated-model-large-v2' }, lowTokenMode: true });
const app = await createApp({ store });
const evidence = { at: new Date().toISOString(), passed: false, scope: 'One fixed non-private prompt through the real companion API/orchestrator/OpenCode/Abliteration model. Isolated SQLite, offline planning and no Realm or microphone. Uses existing provider billing; no account/service was created.' };
try {
  const post = (url, payload) => app.inject({ method: 'POST', url, payload, headers: { host: '127.0.0.1:4365' } });
  assert.equal((await post('/api/control', { command: 'plan' })).statusCode, 200);
  const reply = await post('/api/conversation', { text: 'This is an integration check. Say one short friendly hello. This is casual conversation; use no Minecraft actions.' });
  assert.equal(reply.statusCode, 200, reply.body); assert.ok(reply.json().text.length > 0);
  const state = app.companion.snapshot();
  assert.equal(state.usage.requests, 1); assert.equal(state.usage.unreportedRequests, 1); assert.equal(state.ai.modelState.last.provider, 'opencode');
  assert.equal(state.ai.modelState.last.model, 'abliteration-ai/abliterated-model-large-v2'); assert.equal(state.currentTask, null); assert.equal(state.world, null);
  assert.ok(store.get('conversation').some(message => message.role === 'companion' && message.text === reply.json().text));
  await post('/api/control', { command: 'pause' });
  assert.equal((await post('/api/conversation', { text: 'This should be blocked while paused.' })).statusCode, 409);
  assert.equal(app.companion.snapshot().usage.requests, 1);
  evidence.reply = reply.json().text; evidence.provider = state.ai.modelState.last; evidence.usageReported = false; evidence.pauseBlockedAnotherRequest = true; evidence.passed = true;
} finally {
  const output = join(process.cwd(), '.git/verification/model-providers'); await mkdir(output, { recursive: true });
  await writeFile(join(output, 'live-opencode.json'), JSON.stringify(evidence, null, 2));
  await app.close(); await rm(directory, { recursive: true, force: true });
}
console.log(JSON.stringify(evidence));
