import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

const SOURCE_DIRECTORIES = ['apps', 'services', 'packages', 'src', 'scripts'];
const SKIP_DIRECTORIES = new Set(['node_modules', 'dist', '__pycache__', '.git', 'bin', 'obj']);
const SOURCE_EXTENSIONS = /\.(?:[cm]?js|tsx?|css|html|json|py|ps1|cs|csproj|java|yml)$/i;

export async function sourceFingerprint(root) {
  const files = [];
  async function collect(directory) {
    let entries;
    try { entries = await readdir(directory, { withFileTypes: true }); }
    catch (error) { if (error.code === 'ENOENT') return; throw error; }
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory() && !SKIP_DIRECTORIES.has(entry.name)) await collect(path);
      else if (entry.isFile() && SOURCE_EXTENSIONS.test(entry.name)) files.push(path);
    }
  }
  for (const directory of SOURCE_DIRECTORIES) await collect(join(root, directory));
  for (const name of ['package.json', 'package-lock.json']) {
    const path = join(root, name);
    try { if ((await stat(path)).isFile()) files.push(path); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const hash = createHash('sha256');
  for (const path of files.sort()) hash.update(relative(root, path).replaceAll('\\', '/')).update('\0').update(await readFile(path)).update('\0');
  return hash.digest('hex');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(await sourceFingerprint(process.cwd()));
}
