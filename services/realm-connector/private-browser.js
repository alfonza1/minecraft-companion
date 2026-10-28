import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const DESTINATIONS = Object.freeze({ signin: 'https://www.microsoft.com/link', profile: 'https://www.minecraft.net/en-us/msaprofile/mygames' });
const stateError = message => Object.assign(new Error(message), { statusCode: 409 });

export function createPrivateBrowser({ platform = process.platform, env = process.env, exists = existsSync, launch = spawn } = {}) {
  const candidates = platform === 'win32' ? [
    ...[env['ProgramFiles(x86)'], env.ProgramFiles, env.LOCALAPPDATA].filter(Boolean).map(root => ({ name: 'Microsoft Edge InPrivate', executable: join(root, 'Microsoft', 'Edge', 'Application', 'msedge.exe'), flag: '--inprivate' })),
    ...[env.ProgramFiles, env['ProgramFiles(x86)'], env.LOCALAPPDATA].filter(Boolean).map(root => ({ name: 'Chrome Incognito', executable: join(root, 'Google', 'Chrome', 'Application', 'chrome.exe'), flag: '--incognito' })),
  ] : [];
  const browser = candidates.find(candidate => exists(candidate.executable));
  return {
    status: () => ({ available: Boolean(browser), name: browser?.name || null }),
    async open(target) {
      if (!Object.hasOwn(DESTINATIONS, target)) throw new Error('Unsupported account sign-in destination.');
      if (!browser) throw new Error('Private launching needs Microsoft Edge or Chrome on Windows. Right-click the Microsoft sign-in link and choose a private window instead.');
      await new Promise((resolve, reject) => {
        const child = launch(browser.executable, [browser.flag, '--new-window', DESTINATIONS[target]], { shell: false, windowsHide: false, detached: true, stdio: 'ignore' });
        child.once('error', () => reject(new Error('The private browser could not open. Use the Microsoft sign-in link instead.')));
        child.once('spawn', () => { child.unref(); resolve(); });
      });
      return { opened: true, browser: browser.name };
    },
  };
}

function waitForDevice(connector, signal) {
  return new Promise((resolve, reject) => {
    const finish = error => { clearTimeout(timer); connector.off('change', check); signal.removeEventListener('abort', aborted); error ? reject(Object.assign(error, { statusCode: 409 })) : resolve(); };
    const check = () => {
      if (connector.auth.status === 'authenticating' && connector.auth.device) finish();
      else if (connector.auth.status !== 'authenticating') finish(new Error(connector.auth.error || 'Microsoft sign-in was cancelled or could not start.'));
    };
    const aborted = () => finish(new Error('Private sign-in was cancelled.'));
    const timer = setTimeout(() => finish(new Error('Microsoft has not returned a device code yet. Wait for the prompt and use Open in private window.')), 25_000);
    connector.on('change', check); signal.addEventListener('abort', aborted, { once: true });
    if (signal.aborted) aborted(); else check();
  });
}

export function registerPrivateAccountRoutes(app, { connector, runtime }, browser = createPrivateBrowser()) {
  let starting = false;
  const controller = new AbortController();
  app.addHook('preClose', async () => controller.abort());
  app.get('/api/auth/private-browser', async () => browser.status());
  const open = target => {
    const expires = Date.parse(connector.auth.device?.expiresAt || '');
    if (target === 'signin' && (connector.auth.status !== 'authenticating' || !Number.isFinite(expires) || expires <= Date.now())) throw stateError('Connect the Minecraft account first to request a current device code.');
    if (target === 'profile' && connector.auth.issue !== 'JAVA_PROFILE_REQUIRED') throw stateError('Profile setup is available when Minecraft reports a missing Java profile.');
    return browser.open(target);
  };
  app.post('/api/auth/private-window', async request => {
    const body = request.body;
    if (!body || Object.keys(body).length !== 1 || !['signin', 'profile'].includes(body.target)) { const error = new Error('Choose a supported account sign-in destination.'); error.statusCode = 400; throw error; }
    return open(body.target);
  });
  app.post('/api/auth/connect-private', async request => {
    if (!request.body || Object.keys(request.body).length) { const error = new Error('Private sign-in does not accept URLs, tokens or browser commands.'); error.statusCode = 400; throw error; }
    if (starting || runtime.bot || runtime.connection.status === 'connecting') throw stateError('Stop the existing Minecraft connection before starting another account sign-in.');
    if (!browser.status().available) throw stateError('A supported private browser is not installed. Use the Microsoft sign-in link in your own private window.');
    const generation = runtime.generation;
    starting = true;
    try {
      await connector.cancelAuth();
      if (runtime.generation !== generation || runtime.bot || runtime.connection.status === 'connecting' || controller.signal.aborted) throw stateError('Private account sign-in cancelled.');
      connector.connectAccount({ fresh: true });
      await waitForDevice(connector, controller.signal);
      return await open('signin');
    } finally { starting = false; }
  });
}
