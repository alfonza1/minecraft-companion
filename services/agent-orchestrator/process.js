import { spawn } from 'node:child_process';

// Every worker has an actual OS process boundary. Cancellation waits for exit.
export function runProcess(command, args, { input, signal, cwd, env, onStdout, maxBytes = 2_000_000, timeout = 120_000 } = {}) {
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted();
    const child = spawn(command, args, { cwd, env, windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', failure, size = 0;
    const terminate = reason => { failure ??= reason; child.kill(); };
    const abort = () => terminate(signal.reason ?? new DOMException('Cancelled', 'AbortError'));
    signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => terminate(new Error('Local worker timed out.')), timeout);
    child.stdout.on('data', chunk => { size += chunk.length; if (size > maxBytes) terminate(new Error('Worker output exceeds limit.')); else { stdout += chunk; try { onStdout?.(chunk.toString()); } catch (error) { terminate(error); } } });
    child.stderr.on('data', chunk => { if (stderr.length < 8000) stderr += chunk; });
    child.stdin.on('error', () => {});
    child.on('error', error => { failure = error; });
    child.on('close', code => {
      clearTimeout(timer); signal?.removeEventListener('abort', abort);
      if (failure) reject(failure);
      else if (code) { const error=new Error(`Local worker exited (${code}): ${stderr.slice(-1500)}`);error.stdout=stdout;reject(error); }
      else resolve({ stdout, stderr });
    });
    child.stdin.end(input ?? '');
  });
}
