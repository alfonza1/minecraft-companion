import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPreviewCache, PREVIEW_TEXT } from '../services/voice/preview-cache.js';

function wav() {
  const value = Buffer.alloc(48); value.write('RIFF'); value.writeUInt32LE(40, 4); value.write('WAVE', 8); value.write('fmt ', 12); value.writeUInt32LE(16, 16); value.writeUInt16LE(1, 20); value.writeUInt16LE(1, 22); value.writeUInt32LE(24000, 24); value.writeUInt32LE(48000, 28); value.writeUInt16LE(2, 32); value.writeUInt16LE(16, 34); value.write('data', 36); value.writeUInt32LE(4, 40); value.writeInt16LE(500, 44); return value;
}
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'companion-preview-cache-'));
  t.after(() => rm(directory, { recursive: true, force: true })); return directory;
}
const identify = async voice => ({ voice: voice === 'auto' ? 'kokoro:af_heart' : voice, signature: 'fixture-model-v1' });
const until = async condition => { for (let i = 0; i < 100; i++) { if (condition()) return; await new Promise(resolve => setTimeout(resolve, 5)); } throw Error('Fixture renderer did not start.'); };

test('fixed sample is synthesized once and reused across aliases and service restarts', async t => {
  const directory = await fixture(t); let calls = 0;
  const render = async (text, voice) => { calls++; assert.equal(text, PREVIEW_TEXT); assert.equal(voice, 'kokoro:af_heart'); return wav(); };
  const first = createPreviewCache({ directory, identify, render });
  assert.equal((await first.get('auto')).cached, false);
  assert.equal((await first.get('kokoro:af_heart')).cached, true);
  const restarted = createPreviewCache({ directory, identify, render });
  assert.deepEqual((await restarted.get('auto')).audio, wav()); assert.equal(calls, 1);
});

test('concurrent previews share one generation and an independently cancelled reader cannot cancel another', async t => {
  const directory = await fixture(t); let calls = 0, finish;
  const cache = createPreviewCache({ directory, identify, render: async () => { calls++; await new Promise(resolve => { finish = resolve; }); return wav(); } });
  const controller = new AbortController(); const a = cache.get('auto', controller.signal), b = cache.get('auto');
  await until(() => calls === 1); await new Promise(resolve => setTimeout(resolve, 20));
  controller.abort(); await assert.rejects(a, { name: 'AbortError' }); finish();
  assert.deepEqual((await b).audio, wav()); assert.equal(calls, 1);
});

test('model updates and corrupt cache entries regenerate samples instead of reusing stale audio', async t => {
  const directory = await fixture(t); let version = 1, calls = 0;
  const cache = createPreviewCache({ directory, identify: async voice => ({ voice, version }), render: async () => { calls++; return wav(); } });
  await cache.get('heart'); const [file] = await readdir(directory); await writeFile(join(directory, file), 'not audio');
  assert.equal((await cache.get('heart')).cached, false); assert.equal(calls, 2);
  version = 2; assert.equal((await cache.get('heart')).cached, false); assert.equal(calls, 3);
  assert.ok((await readdir(directory)).every(name => name.endsWith('.wav')));
});

test('last-reader cancellation waits for renderer cleanup and never persists partial audio', async t => {
  const directory = await fixture(t); let started = false, cleaned = false;
  const cache = createPreviewCache({ directory, identify, render: (_text, _voice, signal) => new Promise((resolve, reject) => { started = true; signal.addEventListener('abort', () => setTimeout(() => { cleaned = true; reject(signal.reason); }, 20), { once: true }); }) });
  const controller = new AbortController(); const pending = cache.get('auto', controller.signal);
  await until(() => started); controller.abort(); await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(cleaned, true); assert.deepEqual(await readdir(directory), []);
});

test('invalid renderer output and already-cancelled requests cannot create cached samples', async t => {
  const directory = await fixture(t); let calls = 0;
  const cache = createPreviewCache({ directory, identify, render: async () => { calls++; return Buffer.from('not a WAV'); } });
  const controller = new AbortController(); controller.abort();
  await assert.rejects(cache.get('auto', controller.signal), { name: 'AbortError' }); assert.equal(calls, 0);
  await assert.rejects(cache.get('auto'), /valid WAV/); assert.deepEqual(await readdir(directory), []);
});
