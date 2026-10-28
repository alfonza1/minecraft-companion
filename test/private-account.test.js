import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../services/memory/store.js';
import { createApp } from '../services/api/index.js';
import { freshAccountDirectory, selectedAccountDirectory } from '../services/realm-connector/account-session.js';
import { createPrivateBrowser } from '../services/realm-connector/private-browser.js';

test('private account sessions preserve existing encrypted cache and persist the selected separate directory', async t => {
  const root = await mkdtemp(join(tmpdir(), 'companion-account-selection-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, 'live.dpapi'), 'original-encrypted-fixture');
  assert.equal(selectedAccountDirectory(root), root);
  const first = freshAccountDirectory(root), second = freshAccountDirectory(root);
  assert.notEqual(first, second); assert.equal(selectedAccountDirectory(root), second);
  assert.equal(await readFile(join(root, 'live.dpapi'), 'utf8'), 'original-encrypted-fixture');
  await writeFile(join(root, 'selected-session.json'), JSON.stringify({ session: '../../outside' }));
  assert.throws(() => selectedAccountDirectory(root), /Invalid/);
});

test('private browser launches an installed executable with explicit privacy flags and fixed official URLs, without a shell', async () => {
  const calls = [];
  const browser = createPrivateBrowser({ platform: 'win32', env: { ProgramFiles: '/fixture' }, exists: () => true,
    launch: (...args) => { calls.push(args); const child = new EventEmitter(); child.unref = () => {}; queueMicrotask(() => child.emit('spawn')); return child; } });
  await browser.open('signin'); await browser.open('profile');
  assert.match(calls[0][0], /msedge.exe$/);
  assert.deepEqual(calls[0][1], ['--inprivate', '--new-window', 'https://www.microsoft.com/link']);
  assert.equal(calls[0][2].shell, false); assert.equal(calls[0][2].windowsHide, false);
  assert.equal(calls[1][1][2], 'https://www.minecraft.net/en-us/msaprofile/mygames');
  await assert.rejects(browser.open('https://evil.example'), /Unsupported/); assert.equal(calls.length, 2);
  const absent = createPrivateBrowser({ platform: 'win32', env: {}, exists: () => false });
  assert.equal(absent.status().available, false); await assert.rejects(absent.open('signin'), /Private launching/);
  const failed = createPrivateBrowser({ platform: 'win32', env: { ProgramFiles: '/fixture' }, exists: () => true, launch: () => {
    const child = new EventEmitter(); queueMicrotask(() => child.emit('error', new Error('private provider detail'))); return child;
  } });
  await assert.rejects(failed.open('signin'), error => !error.message.includes('provider detail') && /could not open/.test(error.message));
});

async function fixture(t, { available = true, pending = false } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'companion-private-api-'));
  const calls = [];
  const connector = Object.assign(new EventEmitter(), {
    auth: { status: 'disconnected', username: null, device: null }, realms: [], close: async () => {},
    cancelAuth: async () => { calls.push('cancel'); },
    connectAccount(options) {
      calls.push(options); this.auth = { status: 'authenticating', username: null, device: null }; this.emit('change');
      if (!pending) setImmediate(() => { this.auth.device = { verificationUri: 'https://www.microsoft.com/link', userCode: 'FIXT-URE1', expiresAt: new Date(Date.now() + 60_000).toISOString() }; this.emit('change'); });
    },
  });
  const app = await createApp({ store: new Store(directory), connector, skipExtensions: true,
    privateBrowser: { status: () => ({ available, name: available ? 'Fixture InPrivate' : null }), open: async target => { calls.push(target); return { opened: true, browser: 'Fixture InPrivate' }; } } });
  await app.ready();
  t.after(async () => { await app.close(); await rm(directory, { recursive: true, force: true }); });
  return { app, connector, calls };
}

test('private connect explicitly starts a fresh session, waits for its device prompt and opens the official sign-in', async t => {
  const { app, connector, calls } = await fixture(t);
  const response = await app.inject({ method: 'POST', url: '/api/auth/connect-private', payload: {} });
  assert.equal(response.statusCode, 200, response.body); assert.equal(response.json().opened, true);
  assert.deepEqual(calls, ['cancel', { fresh: true }, 'signin']); assert.ok(connector.auth.device);
  const again = await app.inject({ method: 'POST', url: '/api/auth/private-window', payload: { target: 'signin' } });
  assert.equal(again.statusCode, 200); assert.equal(calls.at(-1), 'signin');
});

test('private account routes reject expired codes, arbitrary URLs and browser arguments, foreign origins and connected-bot switching', async t => {
  const { app, connector, calls } = await fixture(t);
  for (const [url, payload] of [['/api/auth/private-window', { url: 'https://evil.example' }], ['/api/auth/private-window', { target: 'signin', executable: 'cmd.exe' }], ['/api/auth/connect-private', { token: 'not-accepted' }]]) {
    assert.equal((await app.inject({ method: 'POST', url, payload })).statusCode, 400);
  }
  connector.auth = { status: 'authenticating', device: { expiresAt: new Date(0).toISOString() } };
  assert.equal((await app.inject({ method: 'POST', url: '/api/auth/private-window', payload: { target: 'signin' } })).statusCode, 409);
  assert.equal((await app.inject({ method: 'POST', url: '/api/auth/connect-private', payload: {}, headers: { origin: 'https://evil.example' } })).statusCode, 403);
  app.companion.runtime.connection.status = 'connecting';
  assert.equal((await app.inject({ method: 'POST', url: '/api/auth/connect-private', payload: {} })).statusCode, 409);
  assert.deepEqual(calls, []);
});

test('unavailable private browser leaves the saved account unchanged', async t => {
  const { app, calls } = await fixture(t, { available: false });
  const response = await app.inject({ method: 'POST', url: '/api/auth/connect-private', payload: {} });
  assert.equal(response.statusCode, 409, response.body); assert.deepEqual(calls, []);
});

test('stop during private sign-in cancels the wait without opening a window; another start cannot overlap', async t => {
  const { app, connector, calls } = await fixture(t, { pending: true });
  const pending = app.inject({ method: 'POST', url: '/api/auth/connect-private', payload: {} });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal((await app.inject({ method: 'POST', url: '/api/auth/connect-private', payload: {} })).statusCode, 409);
  connector.auth = { status: 'disconnected', device: null }; connector.emit('change');
  assert.equal((await pending).statusCode, 409); assert.equal(calls.includes('signin'), false);
});

test('stop while an earlier account worker is closing cannot begin a late fresh sign-in', async t => {
  const { app, connector, calls } = await fixture(t);
  let release, entered;
  const cancelling = new Promise(resolve => { entered = resolve; });
  let waiting = true;
  connector.cancelAuth = () => { if (!waiting) return Promise.resolve(); waiting = false; return new Promise(resolve => { release = resolve; entered(); }); };
  const pending = app.inject({ method: 'POST', url: '/api/auth/connect-private', payload: {} }).then(response => response);
  await cancelling;
  app.companion.runtime.generation++;
  release();
  assert.equal((await pending).statusCode, 409); assert.deepEqual(calls, []);
});
