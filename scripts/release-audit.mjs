import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
const names = execFileSync('git', ['ls-files','-z','--cached','--others','--exclude-standard'], { encoding:'utf8' }).split('\0').filter(Boolean);
const findings = [];
const patterns = [
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['GitHub credential', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{50,})\b/],
  ['provider credential', /\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{32,}\b/],
  ['Google credential', /\bAIza[0-9A-Za-z_-]{35}\b/],
];
for (const file of names) {
  if (/\.(?:sqlite(?:-wal|-shm)?|dpapi|pem|pfx)$|(?:^|\/)(?:\.env|auth-cache\.json)$/.test(file)) findings.push({ file, kind:'private data artifact' });
  let info; try { info = await stat(file); } catch { continue; }
  if (!info.isFile() || info.size > 2_000_000 || !/\.(?:[cm]?[jt]sx?|json|md|ya?ml|ps1|py|txt|html|css)$/.test(file)) continue;
  const bytes = await readFile(file);
  let text;
  try { text = new TextDecoder('utf-8', { fatal:true }).decode(bytes); } catch { findings.push({ file, kind:'invalid UTF-8 source encoding' }); continue; }
  // Report location/type, never the matching credential itself.
  for (const [kind, pattern] of patterns) if (pattern.test(text)) findings.push({ file, kind });
}
const lock = JSON.parse(await readFile('package-lock.json','utf8'));
const licenses = Object.entries(lock.packages).filter(([name])=>name).map(([path,pkg])=>({ package:path.replace(/^.*node_modules\//,''), version:pkg.version, license:pkg.license || 'UNDECLARED', development:Boolean(pkg.dev) })).sort((a,b)=>a.package.localeCompare(b.package));
await mkdir('release', { recursive:true });
await writeFile('release/dependency-licenses.json', JSON.stringify({ source:'package-lock.json', packages:licenses },null,2)+'\n');
await writeFile('release/source-audit.json', JSON.stringify({ filesScanned:names.length, findings, method:'Heuristic current-tree credential/artifact patterns; not a complete security audit' },null,2)+'\n');
console.log(JSON.stringify({ filesScanned:names.length, findings, licenses:licenses.length, undeclared:licenses.filter(item=>item.license==='UNDECLARED').map(item=>item.package) },null,2));
if(findings.length)process.exitCode=1;
