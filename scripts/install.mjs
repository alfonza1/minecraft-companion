import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

const root = fileURLToPath(new URL('../', import.meta.url));
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 13)) throw new Error('Install Node.js 24 LTS (or 22.13+) before continuing.');
const checkOnly = process.argv.includes('--check');
const checks = { platform: process.platform, node: process.versions.node, dependencies: existsSync(join(root, 'node_modules/fastify/package.json')), dashboard: existsSync(join(root, 'apps/dashboard/dist/index.html')), realmAuth: process.platform === 'win32' ? 'Windows DPAPI' : 'Not supported yet: secure system credential adapter required', desktopVoice: process.platform === 'win32' ? 'Optional Windows speech setup' : 'Browser planning only; native voice not supported' };
if (checkOnly) { console.log(JSON.stringify(checks, null, 2)); process.exit(checks.dependencies && checks.dashboard ? 0 : 1); }
function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' && command === 'npm.cmd' });
  if (result.error || result.status !== 0) throw new Error(`${command} failed. Fix the error above and rerun npm run install:agent.`);
}
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
run(npm, ['ci', '--ignore-scripts']);
run(process.execPath, ['scripts/setup-native.mjs']);
run(npm, ['run', 'build']);
console.log('\nCore ready. Run npm start, open http://127.0.0.1:4365 and choose Setup.');
console.log('Select Ollama for local inference, or an existing supported provider account. No model is downloaded automatically.');
if (process.platform !== 'win32') console.log('Experimental portable browser planning only. Realm login and native voice require Windows.');
else console.log('Optional local voice / desktop launcher: scripts/Bootstrap.ps1 -SkipBridge -DesktopShortcut');
