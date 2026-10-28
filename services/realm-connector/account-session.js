import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

export function selectedAccountDirectory(root) {
  const pointer = join(root, 'selected-session.json');
  if (!existsSync(pointer)) return root; // Preserve the original encrypted cache.
  if (statSync(pointer).size > 1024) throw new Error('Invalid saved account session selection.');
  const { session } = JSON.parse(readFileSync(pointer, 'utf8'));
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(session)) throw new Error('Invalid saved account session selection.');
  return join(root, 'sessions', session);
}

export function freshAccountDirectory(root) {
  const session = randomUUID();
  const directory = join(root, 'sessions', session);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const temporary = join(root, `selection-${randomUUID()}.tmp`);
  writeFileSync(temporary, JSON.stringify({ session }), { mode: 0o600 });
  renameSync(temporary, join(root, 'selected-session.json'));
  return directory;
}
