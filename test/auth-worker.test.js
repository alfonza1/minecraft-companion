import test from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';

test('actual account worker loads installed auth libraries and becomes ready without requesting sign-in', async t => {
  const worker = fork(new URL('../services/realm-connector/auth-worker.js', import.meta.url), [], {
    execArgv: [], windowsHide: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
  });
  t.after(async () => {
    if (worker.exitCode !== null || worker.signalCode !== null) return;
    const exited = once(worker, 'exit'); worker.kill(); await exited;
  });
  const messages = [];
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Account worker startup timed out.')), 5000);
    const finish = error => { clearTimeout(timer); error ? reject(error) : resolve(); };
    worker.on('message', message => { messages.push(message); if (message.type === 'ready') finish(); });
    worker.once('error', () => finish(new Error('Account worker failed to launch.')));
    worker.once('exit', code => finish(new Error(`Account worker exited before readiness (code ${code}).`)));
  });
  assert.deepEqual(messages, [{ type: 'ready' }]);
});
