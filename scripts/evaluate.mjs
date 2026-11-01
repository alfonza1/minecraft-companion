import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import os from 'node:os';

const suites = [
  'test/ollama.test.js', 'test/extensions.test.js', 'test/orchestrator-runtime.test.js',
  'test/companion-api.test.js', 'test/build-planner.test.js', 'test/teammate-tasks.test.js',
];
const started = performance.now();
const child = spawn(process.execPath, ['--test', '--test-reporter=tap', ...suites], { stdio: ['ignore','pipe','pipe'], windowsHide: true });
let output = '', errors = '';
child.stdout.on('data', data => { output += data; });
child.stderr.on('data', data => { errors += data; });
const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
const count = label => Number(output.match(new RegExp('^# ' + label + ' (\\d+)$', 'm'))?.[1] || 0);
const report = {
  schemaVersion: 1, status: code === 0 ? 'measured' : 'failed',
  scope: 'Automated contracts; not gameplay', measuredAt: new Date().toISOString(),
  sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  sourceModified: Boolean(execFileSync('git', ['status','--porcelain'], { encoding: 'utf8' }).trim()),
  command: 'npm run evaluate', suites, environment: { node: process.versions.node, platform: process.platform, architecture: process.arch },
  tests: count('tests'), passed: count('pass'), failed: count('fail'), skipped: count('skipped'),
  elapsedMs: Math.round(performance.now() - started),
  modelRequests: 0, gameplayActions: 0, modelUsage: null, estimatedInferenceCost: null,
  planningLatency: null, gameplaySuccessRate: null, recoveryRate: null,
  resourceUtilization: { parentRssBytes: process.memoryUsage().rss, systemMemoryBytes: os.totalmem(), scope: 'Harness parent process only, not game/model workers' },
  summary: `${count('pass')} automated contract tests passed, ${count('fail')} failed. Includes provider validation, pause gates, API isolation, resource accounting and task recovery doubles. No model or game benchmark.`,
  limitations: ['Synthetic world/action/provider doubles where applicable', 'No hosted or local model generation', 'No game connection', 'No model comparison', 'Timing is suite wall time, not planning latency', 'No monetary estimate without provider billing data'],
};
await mkdir('evaluations/local', { recursive: true });
await writeFile('evaluations/local/latest.json', JSON.stringify(report, null, 2) + '\n');
await writeFile('evaluations/local/latest.tap', output + errors);
if (process.argv.includes('--publish') && code === 0) await writeFile('apps/website/public/evaluation.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
if (code !== 0 || report.tests === 0) process.exitCode = 1;
