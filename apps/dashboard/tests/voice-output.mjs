import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { createApp } from '../../../services/api/index.js';
import { Store } from '../../../services/memory/store.js';
import { registerVoiceRoutes, checkVoice } from '../../../services/voice/index.js';
import * as voiceModule from '../../../services/voice/index.js';

const directory = await mkdtemp(join(tmpdir(), 'companion-output-ui-')), store = new Store(directory);
store.updateSettings({ voice: { outputDevice: 'speaker-from-another-browser-profile' } });
const app = await createApp({ store, skipExtensions: true, voiceModule });
registerVoiceRoutes(app, { store, runtime: app.companion.runtime, publish: app.companion.publish });
await checkVoice(); await app.listen({ host: '127.0.0.1', port: 0 });
const browser = await chromium.launch({ headless: true });
const output = join(process.cwd(), '.git/verification/voice-output');
const evidence = { at: new Date().toISOString(), passed: false, errors: [], scope: 'Actual isolated API/SQLite and real local Kokoro WAV; headless muted HTML audio. Explicit device-permission/picker failures reproduce saved-output errors. No physical sound, microphone, Realm connection or model request.' };
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, reducedMotion: 'reduce' });
  page.on('pageerror', error => evidence.errors.push(error.message));
  await page.addInitScript(() => {
    window.audioEvidence = { mic: 0, played: 0, sinkIds: [], playedSinks: [], selections: 0 };
    window.outputFailure = 'NotAllowedError';
    navigator.mediaDevices.getUserMedia = async () => { window.audioEvidence.mic++; throw new Error('Preview must never request a microphone.'); };
    navigator.mediaDevices.selectAudioOutput = async () => { window.audioEvidence.selections++; return { deviceId: 'approved-speaker', kind: 'audiooutput', label: 'Approved headset' }; };
    HTMLMediaElement.prototype.setSinkId = async function(id) { window.audioEvidence.sinkIds.push(id); if (id && id !== 'approved-speaker') throw new DOMException('No permission to use requested device', window.outputFailure); };
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function() { this.muted = true; window.audioEvidence.played++; window.audioEvidence.playedSinks.push(this.sinkId); return play.call(this); };
  });
  await page.goto(`http://127.0.0.1:${app.server.address().port}`);
  await page.getByRole('navigation').getByRole('button', { name: 'Settings', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('[aria-label="Companion voice"]')?.disabled);
  await page.getByRole('button', { name: 'Preview voice', exact: true }).click();
  await page.waitForFunction(() => window.audioEvidence.played > 0 || document.querySelector('.voice-preference .inline-error'));
  assert.ok(await page.evaluate(() => window.audioEvidence.played > 0), 'A denied saved output must not prevent the fixed sample from playing on the default device.');
  const warning = page.getByRole('status').filter({ hasText: 'Preview is using the system default' });
  await warning.waitFor(); assert.equal(store.settings().voice.outputDevice, 'speaker-from-another-browser-profile');
  assert.equal(await page.evaluate(() => window.audioEvidence.mic), 0);
  assert.equal(await page.evaluate(() => window.audioEvidence.playedSinks[0]), '');
  const stop = page.getByRole('button', { name: 'Stop voice preview', exact: true }); if (await stop.isVisible()) await stop.click();
  await mkdir(output, { recursive: true });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1100 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: join(output, `fallback-${width}.png`), fullPage: true });
  }
  await page.getByRole('button', { name: 'Choose audio output', exact: true }).click();
  await page.waitForFunction(async () => (await (await fetch('/api/state')).json()).settings.voice.outputDevice === 'approved-speaker');
  assert.equal(await page.evaluate(() => window.audioEvidence.selections), 1);
  await page.getByRole('button', { name: 'Preview voice', exact: true }).click();
  await page.waitForFunction(() => window.audioEvidence.sinkIds.includes('approved-speaker'));
  await page.waitForFunction(() => window.audioEvidence.played === 2);
  assert.equal(await page.getByRole('status').filter({ hasText: 'Preview is using the system default' }).count(), 0);
  if (await stop.isVisible()) await stop.click();
  await page.getByRole('combobox', { name: 'Audio output', exact: true }).selectOption('');
  await page.waitForFunction(async () => (await (await fetch('/api/state')).json()).settings.voice.outputDevice === '');
  assert.equal(await page.evaluate(() => window.audioEvidence.mic), 0);
  assert.equal(app.companion.snapshot().usage.requests, 0); assert.deepEqual(evidence.errors, []); evidence.passed = true;
} finally {
  await mkdir(output, { recursive: true }); await writeFile(join(output, 'results.json'), JSON.stringify(evidence, null, 2));
  await browser.close(); await app.close(); await rm(directory, { recursive: true, force: true });
}
console.log(JSON.stringify(evidence));
