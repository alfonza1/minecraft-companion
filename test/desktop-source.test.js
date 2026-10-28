import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sourceFingerprint } from '../scripts/desktop-source.mjs';

test('desktop revisions detect uncommitted dashboard and backend edits without hashing generated builds', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'companion-revision-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  for (const child of ['apps/dashboard/src', 'apps/dashboard/dist', 'apps/desktop/obj', 'apps/desktop/bin', 'services/api']) await mkdir(join(directory, child), { recursive: true });
  const frontend = join(directory, 'apps/dashboard/src/App.tsx');
  await writeFile(frontend, 'original');
  const original = await sourceFingerprint(directory);
  await writeFile(join(directory, 'apps/dashboard/dist/index.html'), 'compiled output');
  assert.equal(await sourceFingerprint(directory), original);
  await writeFile(join(directory, 'apps/desktop/obj/project.assets.json'), 'restored packages');
  await writeFile(join(directory, 'apps/desktop/bin/runtime.json'), 'compiled desktop');
  assert.equal(await sourceFingerprint(directory), original);
  await writeFile(join(directory, 'apps/desktop/App.csproj'), 'desktop source');
  const desktopEdit = await sourceFingerprint(directory);
  assert.notEqual(desktopEdit, original);
  await writeFile(frontend, 'local edit');
  const frontendEdit = await sourceFingerprint(directory);
  assert.notEqual(frontendEdit, desktopEdit);
  await writeFile(join(directory, 'services/api/index.js'), 'backend edit');
  assert.notEqual(await sourceFingerprint(directory), frontendEdit);
});
