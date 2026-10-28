import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { chromium } from 'playwright';

if (process.platform !== 'win32') throw new Error('This fixture tests the actual Windows desktop window.');
const exec = promisify(execFile), root = process.cwd();
const { stdout } = await exec('powershell.exe', ['-NoProfile', '-File', path.join(root, 'scripts/Build-Desktop.ps1')], { windowsHide: true });
const executable = stdout.trim(), launcher = path.join(process.env.LOCALAPPDATA, 'MinecraftCompanion/launcher/Minecraft Companion.exe');
const evidence = path.join(root, '.git/verification/desktop-window');
await mkdir(evidence, { recursive: true });
const initial = await fetch('http://127.0.0.1:4365/api/state').then(r => r.json());
const results = [];
async function port() {
  const server = net.createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const number = server.address().port; await new Promise(resolve => server.close(resolve)); return number;
}
for (let run = 1; run <= 2; run++) {
  const debugPort = await port();
  const child = spawn(executable, ['--project', root, '--launcher', launcher, '--test-port', String(debugPort), '--minimized'], { windowsHide: true, stdio: 'ignore' });
  let browser, page;
  try {
    const deadline = Date.now() + 30000;
    while (!browser && Date.now() < deadline) {
      try { browser = await chromium.connectOverCDP(`http://127.0.0.1:${debugPort}`); }
      catch { if (child.exitCode !== null) throw new Error('Desktop window exited before WebView initialization.'); await new Promise(resolve => setTimeout(resolve, 200)); }
    }
    assert.ok(browser, 'Native WebView2 must initialize');
    page = browser.contexts()[0].pages()[0]; const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.getByRole('heading', { name: 'Overview', exact: true }).waitFor();
    await page.getByText('Desktop workspace', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => Boolean(window.chrome?.webview)), true);
    assert.equal(await page.locator('#overview-request').isDisabled(), !['ACTIVE', 'BUSY'].includes(initial.state));
    const network = await exec('powershell.exe', ['-NoProfile', '-Command', `(Get-NetTCPConnection -LocalPort ${debugPort} -State Listen).LocalAddress | ConvertTo-Json`], { windowsHide: true });
    assert.ok([JSON.parse(network.stdout)].flat().every(address => ['127.0.0.1','::1'].includes(address)), 'Test debugging binds only to loopback');
    if (run === 1) {
      // A minimized WebView can suspend its compositor. DOM checks keep this
      // fixture isolated; visible-window and headless UI captures are separate.
      await page.getByRole('button', { name: 'Apply local updates', exact: true }).evaluate(button => button.click());
      await page.getByText('Linked to your local working copy', { exact: true }).waitFor({ timeout: 30000 });
      await page.getByRole('heading', { name: 'Overview', exact: true }).waitFor();
      await page.getByRole('button', { name: 'Reload desktop view', exact: true }).evaluate(button => button.click());
      await page.getByText('Desktop workspace', { exact: true }).waitFor();
      await page.evaluate(() => { window.location.href = 'https://example.invalid/'; });
      await new Promise(resolve => setTimeout(resolve, 300));
      assert.ok(page.url().startsWith('http://127.0.0.1:4365/'), 'External navigation cannot replace the trusted dashboard');
    }
    assert.deepEqual(errors, []);
    results.push({ run, nativeBridge: true, pageErrors: errors, externalNavigationBlocked: run === 1, loopbackTestPort: true });
  } catch (error) {
    if (page && !page.isClosed()) console.error('Desktop status:', await page.locator('.desktop-bar').innerText().catch(() => 'Unavailable'));
    throw error;
  } finally {
    // Close only this fixture's own window. The real bot/API remain untouched.
    await exec('powershell.exe', ['-NoProfile', '-Command', `$desktop=Get-Process -Id ${child.pid} -ErrorAction SilentlyContinue; if($desktop){$desktop.CloseMainWindow() | Out-Null}`], { windowsHide: true });
    if (browser) await browser.close();
    const closed = await Promise.race([new Promise(resolve => child.exitCode !== null ? resolve(true) : child.once('exit', () => resolve(true))), new Promise(resolve => setTimeout(() => resolve(false), 5000))]);
    if (!closed) { child.kill(); throw new Error('Desktop window did not exit cleanly after close.'); }
  }
}
const final = await fetch('http://127.0.0.1:4365/api/state').then(r => r.json());
assert.equal(final.usage.requests, initial.usage.requests);
assert.equal(final.state, initial.state);
await writeFile(path.join(evidence, 'results.json'), JSON.stringify({ at: new Date().toISOString(), passed: true, results, modelRequestsMade: final.usage.requests - initial.usage.requests, scope: 'Actual Windows WebView2 executable opened/closed/reopened minimized, localhost dashboard, no gameplay/audio/account actions. Test-only debugging enabled on loopback; production has no debugging port.' }, null, 2));
console.log('Actual native desktop open, local-update action, reload, navigation restriction, clean close and reopen passed; zero additional model requests.');
