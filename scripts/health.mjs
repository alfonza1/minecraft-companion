import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { supportedVersions } from '../services/realm-connector/index.js';
import { checkVoice } from '../services/voice/index.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const command = (name, args) => {
  try { const result = spawnSync(name, args, { encoding: 'utf8', windowsHide: true, timeout: 10_000, stdio: ['ignore', 'pipe', 'pipe'] }); return result.status === 0 ? (result.stdout || result.stderr).trim() : 'unavailable'; }
  catch { return 'unavailable'; }
};
const codexFile = join(process.env.APPDATA || '', 'npm/node_modules/@openai/codex/bin/codex.js');
const codex = existsSync(codexFile) ? args => command(process.execPath, [codexFile, ...args]) : args => command('codex', args);
const checks = {
  application: 'Minecraft Companion', platform: `${os.platform()} ${os.release()} ${os.arch()}`,
  node: process.versions.node, nodeCompatible: Number(process.versions.node.split('.')[0]) >= 22,
  git: command('git', ['--version']), python: command('python', ['--version']),
  java: command('java', ['--version']), javaRequiredForRealms: false,
  codex: codex(['--version']), codexAuthentication: codex(['login', 'status']).replace(/(?:sk-|ghp_|gho_)\S+/g, '[redacted]'),
  freeMemoryGiB: Math.round(os.freemem() / 1024 ** 3 * 10) / 10,
  installedMemoryGiB: Math.round(os.totalmem() / 1024 ** 3),
  protocol: { supportedVersions, latestSupportedVersion: supportedVersions.at(-1), currentReleaseGap: '26.3 is not supported by the installed 26.1 protocol stack.' },
  speech: await checkVoice(), dashboardBuilt: existsSync(join(root, 'apps/dashboard/dist/index.html')),
  dataStorage: 'LOCALAPPDATA/MinecraftCompanion; Windows DPAPI for account cache',
};
try { const response = await fetch('http://127.0.0.1:4365/api/state', { signal: AbortSignal.timeout(2000) }); const state = await response.json(); checks.runtime = { reachable: response.ok, state: state.state, account: state.auth.status }; }
catch { checks.runtime = { reachable: false, message: 'Launch with Start Minecraft Companion.cmd.' }; }
console.log(JSON.stringify(checks, null, 2));
if (!checks.nodeCompatible || !checks.dashboardBuilt) process.exitCode = 1;
