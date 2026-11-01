import test from 'node:test';
import assert from 'node:assert/strict';
import { executeOllama, ollamaCatalog } from '../services/agent-orchestrator/providers/ollama.js';
import { codexRequest } from '../services/agent-orchestrator/index.js';
import { createProviderRegistry } from '../services/agent-orchestrator/providers/index.js';
import { settingsSchema } from '../services/api/index.js';

test('local catalog filters cloud models and does not guess a model default', async () => {
  const result = await ollamaCatalog(undefined, async url => {
    assert.equal(url, 'http://127.0.0.1:11434/api/tags');
    return Response.json({ models: [{ name: 'qwen3:8b' }, { name: 'large:cloud' }] });
  });
  assert.deepEqual(result.models.map(model => model.id), ['qwen3:8b']);
  assert.equal(result.defaultModel, null);
  assert.equal(settingsSchema.parse({ provider: 'ollama', providerModels: { ollama: 'qwen3:8b' } }).provider, 'ollama');
});

test('Ollama passes structured schema, actual usage and no private reasoning', async () => {
  const result = await executeOllama('Synthetic test only', { model: 'test:local', schema: { type: 'object' }, fetcher: async (url, options) => {
    const body = JSON.parse(options.body);
    assert.equal(url, 'http://127.0.0.1:11434/api/generate');
    assert.equal(options.redirect, 'error'); assert.equal(body.stream, false); assert.equal(body.think, false);
    assert.deepEqual(body.format, { type: 'object' });
    return Response.json({ response: '{"reply":"Hello"}', thinking: 'PRIVATE', prompt_eval_count: 7, eval_count: 4 });
  } });
  assert.deepEqual(result.usage, { input_tokens: 7, output_tokens: 4, cached_input_tokens: 0 });
  assert.equal(JSON.stringify(result).includes('PRIVATE'), false);
});

test('local model output cannot bypass action validation or cancellation', async () => {
  const registry = createProviderRegistry({ discoverOllama: async () => ({ models: [{ id: 'test:local' }], status: {} }), ollamaRequest: async () => ({ data: { reply: '', intent: 'minecraft_action', actions: [{ tool: 'shell', args: '{}' }] } }) });
  await assert.rejects(codexRequest('test', { provider: 'ollama', model: 'test:local', providerRegistry: registry }), /Unsupported/);
  await assert.rejects(executeOllama('test', { model: 'test:cloud' }), /Cloud models/);
  await assert.rejects(executeOllama('test', { model: 'test:local', signal: AbortSignal.abort(), fetcher: () => assert.fail('must not request') }), /abort/i);
  await assert.rejects(executeOllama('test', { model: 'test:local', fetcher: async () => Response.json({ response: 'no JSON' }) }), /invalid JSON/);
  await registry.close();
});
