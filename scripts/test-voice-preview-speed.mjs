import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { Store } from '../services/memory/store.js';
import { createApp } from '../services/api/index.js';
import { registerVoiceRoutes, checkVoice, voiceOptions } from '../services/voice/index.js';
import * as voiceModule from '../services/voice/index.js';

const directory = await mkdtemp(join(tmpdir(), 'companion-preview-speed-')), store = new Store(directory);
store.updateSettings({ voice: { ttsVoice: 'kokoro:af_bella', speed: 1.4 } });
const app = await createApp({ store, skipExtensions: true, voiceModule });
registerVoiceRoutes(app, { store, runtime: app.companion.runtime, publish: app.companion.publish });
await checkVoice(); await app.listen({ host: '127.0.0.1', port: 0 });
const browser = await chromium.launch({ headless: true });
const output = join(process.cwd(), '.git/verification/voice-preview-speed');
const evidence = { at: new Date().toISOString(), passed: false, samples: [], pageErrors: [], scope: 'Prepared real local neural WAV samples through isolated API/SQLite and built UI. Cached response and muted HTML playback measured. No microphone, physical sound, Realm or model request.' };
try {
  const voices = voiceOptions().filter(voice => voice.available && voice.provider !== 'auto');
  for (const voice of voices) {
    const start = performance.now();
    const response = await app.inject({ method: 'POST', url: '/api/voice/preview', payload: { voiceId: voice.id, speed: 1 }, headers: { host: '127.0.0.1:4365' } });
    const elapsedMs = Math.round(performance.now() - start);
    assert.equal(response.statusCode, 200, response.body.slice(0, 100)); assert.equal(response.headers['x-companion-preview-cache'], 'hit', 'Run node services/voice/prepare-previews.mjs before this performance check.');
    assert.equal(response.rawPayload.toString('ascii', 0, 4), 'RIFF'); assert.ok(elapsedMs < 1000, `Cached ${voice.id} took ${elapsedMs}ms`);
    evidence.samples.push({ voice: voice.id, elapsedMs, bytes: response.rawPayload.length });
  }
  const normal = await app.inject({ method: 'POST', url: '/api/voice/preview', payload: { voiceId: 'kokoro:af_bella', speed: 1 } });
  const faster = await app.inject({ method: 'POST', url: '/api/voice/preview', payload: { voiceId: 'kokoro:af_bella', speed: 1.4 } });
  assert.deepEqual(createHash('sha256').update(normal.rawPayload).digest(), createHash('sha256').update(faster.rawPayload).digest());
  assert.equal(faster.headers['x-companion-preview-speed'], '1.4');
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  page.on('pageerror', error => evidence.pageErrors.push(error.message));
  await page.addInitScript(() => {
    window.micRequests = 0;
    navigator.mediaDevices.getUserMedia = async () => { window.micRequests++; throw Error('Preview should not request a microphone.'); };
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = async function() { this.muted = true; await play.call(this); window.previewPlayback = { elapsedMs: Math.round(performance.now() - window.previewClickAt), rate: this.playbackRate, preservesPitch: this.preservesPitch }; };
  });
  await page.goto(`http://127.0.0.1:${app.server.address().port}`); await page.getByRole('navigation').getByRole('button', { name: 'Settings', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('[aria-label="Companion voice"]')?.disabled);
  await page.getByRole('button', { name: 'Preview voice', exact: true }).evaluate(button => { window.previewClickAt = performance.now(); button.click(); });
  await page.waitForFunction(() => Boolean(window.previewPlayback));
  evidence.playback = await page.evaluate(() => window.previewPlayback);
  assert.ok(evidence.playback.elapsedMs < 1000); assert.equal(evidence.playback.rate, 1.4); assert.equal(evidence.playback.preservesPitch, true); assert.equal(await page.evaluate(() => window.micRequests), 0);
  const stop = page.getByRole('button', { name: 'Stop voice preview', exact: true }); if (await stop.isVisible()) await stop.click();
  await app.companion.runtime.control('plan'); await app.companion.runtime.control('pause');
  assert.equal((await app.inject({ method: 'POST', url: '/api/voice/preview', payload: { voiceId: 'kokoro:af_bella' } })).statusCode, 409);
  assert.equal(app.companion.snapshot().usage.requests, 0); assert.deepEqual(evidence.pageErrors, []); evidence.passed = true;
} finally {
  await mkdir(output, { recursive: true }); await writeFile(join(output, 'results.json'), JSON.stringify(evidence, null, 2));
  await browser.close(); await app.close(); await rm(directory, { recursive: true, force: true });
}
console.log(JSON.stringify(evidence));
