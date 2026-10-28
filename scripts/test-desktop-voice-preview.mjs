import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { chromium } from 'playwright';

const exec = promisify(execFile), root = process.cwd();
const before = await fetch('http://127.0.0.1:4365/api/state').then(response => response.json());
assert.equal(before.state, 'DISCONNECTED', 'Run this passive preview check only when disconnected.');
const { stdout } = await exec('powershell.exe', ['-NoProfile', '-File', path.join(root, 'scripts/Build-Desktop.ps1')], { windowsHide: true });
const listener = net.createServer(); await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
const debugPort = listener.address().port; await new Promise(resolve => listener.close(resolve));
const launcher = path.join(process.env.LOCALAPPDATA, 'MinecraftCompanion/launcher/Minecraft Companion.exe');
const child = spawn(stdout.trim(), ['--project', root, '--launcher', launcher, '--test-port', String(debugPort), '--minimized'], { windowsHide: true, stdio: 'ignore' });
let browser, page;
const evidence = { at: new Date().toISOString(), passed: false, scope: 'Actual rebuilt Windows WebView2, isolated minimized test profile and real localhost Kokoro preview. Uses the saved output preference without modifying settings. Audio muted; no physical sound or microphone, no Realm or model request. Test debugging is loopback only.' };
try {
  const deadline = Date.now() + 30000;
  while (!browser && Date.now() < deadline) {
    try { browser = await chromium.connectOverCDP(`http://127.0.0.1:${debugPort}`); }
    catch { if (child.exitCode !== null) throw new Error('Native test window stopped.'); await new Promise(resolve => setTimeout(resolve, 200)); }
  }
  assert.ok(browser, 'Native WebView2 must initialize.');
  page = browser.contexts()[0].pages()[0];
  await page.addInitScript(() => {
    window.previewEvidence = { playStarted: false, micRequests: 0, routingErrors: [] };
    navigator.mediaDevices.getUserMedia = async () => { window.previewEvidence.micRequests++; throw Error('Preview must not request a microphone.'); };
    const route = HTMLMediaElement.prototype.setSinkId;
    if (route) HTMLMediaElement.prototype.setSinkId = async function(id) { try { return await route.call(this, id); } catch (error) { window.previewEvidence.routingErrors.push(error.name); throw error; } };
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = async function() { this.muted = true; window.previewEvidence.playInvoked = true; window.previewEvidence.playingElement = this; try { await play.call(this); window.previewEvidence.playStarted = true; } catch(error) { window.previewEvidence.playError = error.message; throw error; } };
  });
  await page.reload(); await page.getByRole('heading', { name: 'Overview', exact: true }).waitFor();
  await page.getByRole('navigation').getByRole('button', { name: 'Settings', exact: true }).evaluate(button => button.click());
  await page.waitForFunction(() => !document.querySelector('[aria-label="Companion voice"]')?.disabled);
  const response = page.waitForResponse(response => response.url().endsWith('/api/voice/preview'));
  await page.getByRole('button', { name: 'Preview voice', exact: true }).evaluate(button => button.click());
  assert.equal((await response).status(), 200);
  await page.waitForFunction(() => window.previewEvidence.playStarted && window.previewEvidence.playingElement.currentTime > 0, undefined, { timeout: 15000 });
  const playback = await page.evaluate(() => ({ micRequests: window.previewEvidence.micRequests, routingErrors: window.previewEvidence.routingErrors, playbackAdvanced: window.previewEvidence.playingElement.currentTime > 0, fallbackNotice: Boolean([...document.querySelectorAll('[role="status"]')].find(element => element.textContent.includes('Preview is using the system default'))) }));
  assert.equal(playback.micRequests, 0);
  if (playback.routingErrors.length) assert.equal(playback.fallbackNotice, true);
  const stop = page.getByRole('button', { name: 'Stop voice preview', exact: true }); if (await stop.count()) await stop.evaluate(button => button.click());
  const after = await fetch('http://127.0.0.1:4365/api/state').then(response => response.json());
  assert.equal(after.state, before.state); assert.deepEqual(after.settings, before.settings); assert.equal(after.usage.requests, before.usage.requests);
  evidence.playback = playback; evidence.passed = true;
} catch (error) {
  if (page && !page.isClosed()) evidence.failure = await page.evaluate(() => ({ message: document.querySelector('.voice-preference .inline-error')?.textContent, notice: [...document.querySelectorAll('.voice-preference [role="status"]')].map(element => element.textContent), playback: window.previewEvidence ? { playInvoked: window.previewEvidence.playInvoked, playStarted: window.previewEvidence.playStarted, playError: window.previewEvidence.playError, routingErrors: window.previewEvidence.routingErrors, paused: window.previewEvidence.playingElement?.paused, readyState: window.previewEvidence.playingElement?.readyState, time: window.previewEvidence.playingElement?.currentTime, duration: window.previewEvidence.playingElement?.duration, visibility: document.visibilityState } : null }));
  console.error(JSON.stringify(evidence.failure)); throw error;
} finally {
  await exec('powershell.exe', ['-NoProfile', '-Command', `$testWindow = Get-Process -Id ${child.pid} -ErrorAction SilentlyContinue; if ($testWindow) { $testWindow.CloseMainWindow() | Out-Null }`], { windowsHide: true });
  if (browser) await browser.close();
  const closed = await Promise.race([new Promise(resolve => child.exitCode !== null ? resolve(true) : child.once('exit', () => resolve(true))), new Promise(resolve => setTimeout(() => resolve(false), 5000))]);
  if (!closed) { child.kill(); throw new Error('Native test window did not exit.'); }
  const output = path.join(root, '.git/verification/voice-output'); await mkdir(output, { recursive: true });
  await writeFile(path.join(output, 'native.json'), JSON.stringify(evidence, null, 2));
}
console.log(JSON.stringify(evidence));
