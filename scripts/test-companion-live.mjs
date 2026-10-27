import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../services/api/index.js';
import { Store } from '../services/memory/store.js';

// Explicit opt-in smoke: real local speech and, with --codex, real subscription
// requests. No microphone, speaker playback, Realm or user app data is touched.
const directory = await mkdtemp(join(tmpdir(), 'companion-live-'));
const app = await createApp({ store: new Store(directory) });
const results = [];
try {
  const base = await app.listen({ host: '127.0.0.1', port: 0 });
  const request = async (path, body) => {
    const response = await fetch(`${base}/api${path}`, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`);
    return response.json();
  };
  await request('/control', { command: 'plan' });
  const voice = await request('/voice/status'); assert.equal(voice.available, true);
  const speech = await fetch(`${base}/api/voice/speak`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: 'Hello friend. Let us collect wood and build a house.', speed: 1 }) });
  assert.equal(speech.status, 200);
  const wav = Buffer.from(await speech.arrayBuffer()); assert.equal(wav.subarray(0, 4).toString(), 'RIFF');
  const form = new FormData(); form.append('audio', new Blob([wav], { type: 'audio/wav' }), 'speech.wav');
  const transcription = await fetch(`${base}/api/voice/transcribe`, { method: 'POST', body: form }); assert.equal(transcription.status, 200);
  const transcript = await transcription.json(); assert.match(transcript.text, /collect wood/i);
  results.push({ check: 'real local API Piper WAV -> Whisper transcription', passed: true, text: transcript.text, bytes: wav.length });
  if (process.argv.includes('--codex')) {
    const conversation = await request('/conversation', { text: 'In one relaxed sentence, what is a black hole?' });
    assert.ok(conversation.text.length > 5);
    const state = await request('/state'); assert.equal(state.world, null); assert.equal(state.tasks.length, 0); assert.ok(state.usage.inputTokens > 0);
    results.push({ check: 'real API Codex conversation and reported usage; no Minecraft tools', passed: true, reply: conversation.text, usage: state.usage });
    const project = await request('/projects', { name: 'Live architect smoke', version: '1.21.11' });
    const design = await request(`/projects/${project.id}/design`, { description: 'Design an original flat 2 by 2 square foundation using exactly four stone blocks, dimensions x2 y1 z2. No walls or decoration. All four blocks section foundation.' });
    assert.equal(design.blueprint.blocks.length, 4); assert.equal(design.blueprint.provenance, 'reconstructed');
    assert.equal(design.materials.placed.find(row => row.name === 'stone').quantity, 4);
    assert.equal(design.approvedRevision, null);
    results.push({ check: 'real API Codex design -> strict stored blueprint -> exact BOM -> unapproved revision', passed: true, placements: design.blueprint.blocks.length });
  }
  const beforePause = await request('/state');
  await request('/control', { command: 'pause' });
  const denied = await fetch(`${base}/api/conversation`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: 'This must not trigger inference.' }) });
  assert.ok(denied.status >= 400);
  const deniedVoice = await fetch(`${base}/api/voice/speak`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: 'This must not trigger speech.' }) });
  assert.equal(deniedVoice.status, 409);
  const afterPause = await request('/state'); assert.equal(afterPause.usage.requests, beforePause.usage.requests);
  results.push({ check: 'pause denies real conversation and speech routes with unchanged model requests', passed: true });
  await request('/control', { command: 'resume' }); await request('/control', { command: 'stop' });
  assert.equal((await request('/state')).state, 'DISCONNECTED');
  console.log(JSON.stringify({ suite: 'live localhost API smoke', at: new Date().toISOString(), results }, null, 2));
} finally {
  await app.close();
  const absolute = join(tmpdir(), directory.split(/[\\/]/).at(-1));
  if (absolute === directory && directory.split(/[\\/]/).at(-1).startsWith('companion-live-')) await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
