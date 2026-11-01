import { spawnSync } from 'node:child_process';
import { mkdir, writeFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { claudeIntegrationDirectory } from '../services/agent-orchestrator/providers/claude-sdk.js';

const version = '0.3.312';
console.log('Installing optional Claude Agent SDK. Its vendor terms apply: https://code.claude.com/docs/en/legal-and-compliance');
console.log('The open-source core and local Ollama provider do not require this integration.');
await mkdir(claudeIntegrationDirectory, { recursive: true, mode: 0o700 });
const manifest = join(claudeIntegrationDirectory, 'package.json');
try { await access(manifest); } catch { await writeFile(manifest, JSON.stringify({ name: 'waypoint-optional-claude', private: true })); }
const npm = process.env.npm_execpath || join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
const result = spawnSync(process.execPath, [npm, 'install', '--prefix', claudeIntegrationDirectory, '--ignore-scripts', '--no-audit', '--no-fund', '--save-exact', `@anthropic-ai/claude-agent-sdk@${version}`], { stdio: 'inherit', windowsHide: true });
if (result.error || result.status !== 0) throw new Error('Optional Claude installation failed. Check npm connectivity and retry.');
console.log('Claude integration installed outside the source tree. Existing account sign-in is unchanged.');
