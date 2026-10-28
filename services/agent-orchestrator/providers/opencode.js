import { access, mkdtemp, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

export async function locateOpenCode() {
  const executable = process.env.COMPANION_OPENCODE_BIN || join(process.env.APPDATA || '', 'npm/node_modules/@opencode/cli/bin/opencode.exe');
  try { await access(executable); return executable; } catch { return 'opencode'; }
}

async function boundedJson(response) {
  if (!response.ok) throw new Error(`OpenCode request failed (HTTP ${response.status}). Check the selected model and connection in OpenCode.`);
  const chunks = []; let bytes = 0;
  for await (const chunk of response.body) { bytes += chunk.length; if (bytes > 4000000) throw new Error('OpenCode response exceeds the size limit.'); chunks.push(chunk); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

// A private, password-protected loopback worker owns each stateless request.
// Killing this native process cancels upstream work; no shared agent is started.
export async function withOpenCode(work, { signal, command, prefix = [], timeoutMs = 180000 } = {}) {
  signal?.throwIfAborted();
  const directory = await mkdtemp(join(tmpdir(), 'companion-opencode-'));
  const lease = createServer(); await new Promise((resolve, reject) => { lease.once('error', reject); lease.listen(0, '127.0.0.1', resolve); });
  const port = lease.address().port; await new Promise(resolve => lease.close(resolve));
  const password = randomUUID(), controller = new AbortController();
  const abort = () => controller.abort(signal?.reason); signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => controller.abort(new Error('OpenCode request timed out.')), timeoutMs);
  const child = spawn(command || await locateOpenCode(), [...prefix, 'serve', '--hostname', '127.0.0.1', '--port', String(port)], { cwd: directory, shell: false, windowsHide: true, env: { ...process.env, OPENCODE_SERVER_PASSWORD: password, OPENCODE_SERVER_USERNAME: 'opencode' }, stdio: ['ignore', 'pipe', 'pipe'] });
  const closed = new Promise(resolve => child.once('close', resolve)); child.stdout.resume(); child.stderr.resume();
  child.on('error', () => controller.abort(new Error('OpenCode could not start. Check the local installation.')));
  const stop = () => child.kill(); controller.signal.addEventListener('abort', stop, { once: true });
  const request = (path, body) => fetch(`http://127.0.0.1:${port}${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { Authorization: `Basic ${Buffer.from(`opencode:${password}`).toString('base64')}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: controller.signal }).then(boundedJson);
  try {
    let ready = false;
    for (let attempt = 0; attempt < 80 && !ready; attempt++) {
      controller.signal.throwIfAborted(); if (child.exitCode !== null || child.signalCode) throw new Error('OpenCode worker stopped before becoming ready.');
      try { await request('/api/info'); ready = true; } catch (error) { controller.signal.throwIfAborted(); if (error instanceof TypeError) await new Promise(resolve => setTimeout(resolve, 100)); else throw error; }
    }
    if (!ready) throw new Error('OpenCode worker did not become ready.');
    return await work(request);
  } catch (error) { signal?.throwIfAborted(); if (controller.signal.aborted) throw controller.signal.reason; throw error; }
  finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); child.kill(); await closed; await rm(directory, { recursive: true, force: true }); }
}

export async function openCodeCatalog(signal) {
  return withOpenCode(async request => {
    const [list, automatic] = await Promise.all([request('/api/model'), request('/api/model/default')]);
    const defaultModel = automatic.data ? `${automatic.data.providerID}/${automatic.data.id}` : null;
    const models = list.data.filter(model => model.enabled !== false && (!model.type || model.type === 'chat')).map(model => ({ id: `${model.providerID}/${model.id}`, displayName: `${model.name || model.id} · ${model.providerID}`, description: '', isDefault: `${model.providerID}/${model.id}` === defaultModel }));
    return { models, defaultModel, observedAt: new Date().toISOString(), source: 'opencode-v2', accessVerified: false, status: { available: true, authenticated: null, error: null, version: 'OpenCode v2 API · provider access checked on request' } };
  }, { signal, timeoutMs: 20000 });
}

export function parseModelRef(model) {
  const slash = model.indexOf('/');
  if (slash <= 0 || slash === model.length - 1) throw new Error('Choose an OpenCode provider/model.');
  return { providerID: model.slice(0, slash), id: model.slice(slash + 1) };
}

export async function executeOpenCode(prompt, { signal, model, schema } = {}) {
  const modelRef = parseModelRef(model);
  return withOpenCode(async request => {
    const result = await request('/api/experimental/generate/text', { model: modelRef, prompt: `${prompt}\nReturn only a JSON object matching this schema. No markdown or commentary.\n${JSON.stringify(schema)}` });
    const text = result.data.text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    let data; try { data = JSON.parse(text); } catch { throw new Error('OpenCode returned invalid JSON. No gameplay actions were run. Try another model or a simpler request.'); }
    return { data, usage: null, model };
  }, { signal });
}
