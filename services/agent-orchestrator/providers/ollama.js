const ENDPOINT = 'http://127.0.0.1:11434';
const MAX_RESPONSE_BYTES = 4_000_000;

async function request(path, { signal, body, fetcher = fetch, timeout = 180_000 } = {}) {
  signal?.throwIfAborted();
  const response = await fetcher(`${ENDPOINT}${path}`, {
    method: body ? 'POST' : 'GET', redirect: 'error',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(timeout)]),
  });
  if (!response.ok) { await response.body?.cancel(); throw new Error(`Local Ollama returned HTTP ${response.status}. Check that the selected model is installed.`); }
  const chunks = []; let bytes = 0;
  for await (const chunk of response.body) {
    bytes += chunk.length;
    if (bytes > MAX_RESPONSE_BYTES) throw new Error('Ollama response exceeds the size limit.');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export async function ollamaCatalog(signal, fetcher) {
  const result = await request('/api/tags', { signal, fetcher, timeout: 5000 });
  // Cloud-tagged models are intentionally excluded from the free local route.
  const models = (result.models || []).filter(model => !/cloud/i.test(model.name))
    .map(model => ({ id: model.name, displayName: model.name, description: 'Installed locally · model license applies', isDefault: false }));
  return { models, defaultModel: null, observedAt: new Date().toISOString(), source: 'ollama-local', accessVerified: false,
    status: { available: true, authenticated: null, error: null, version: 'Local Ollama · no account required' } };
}

export async function executeOllama(prompt, { signal, model, schema, fetcher } = {}) {
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,199}$/.test(model) || /cloud/i.test(model)) throw new Error('Select an installed local Ollama model. Cloud models are not supported by this provider.');
  const result = await request('/api/generate', { signal, fetcher, body: {
    model, prompt, format: schema || 'json', stream: false, think: false, keep_alive: '5m', options: { temperature: 0.2, num_predict: 4096 },
  } });
  signal?.throwIfAborted();
  let data;
  try { data = JSON.parse(result.response); } catch { throw new Error('Local model returned invalid JSON. No actions were executed. Try a more capable model.'); }
  const count = value => Number.isSafeInteger(value) && value >= 0;
  const usage = count(result.prompt_eval_count) && count(result.eval_count)
    ? { input_tokens: result.prompt_eval_count, output_tokens: result.eval_count, cached_input_tokens: count(result.prompt_eval_cached_count) ? result.prompt_eval_cached_count : 0 } : null;
  // Never return the provider's private thinking field. Common action validation
  // still runs in codexRequest; model output is not executable code.
  return { data, usage, model: result.model || model };
}
