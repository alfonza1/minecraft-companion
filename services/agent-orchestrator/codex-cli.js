import { access } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

export const CODEX_RESTRICTIONS = ['--ignore-user-config','--ignore-rules','--ephemeral','--skip-git-repo-check','--sandbox','read-only','--disable','shell_tool','--disable','apps','--disable','hooks','--disable','multi_agent','-c','features.code_mode.enabled=false','-c','tools.view_image=false','-c','web_search="disabled"','-c','project_doc_max_bytes=0','-c','mcp_servers={}','-c','plugins={}','-c','approval_policy="never"'];
export async function locateCodex() {
  // Launch the native binary directly: killing an npm/node wrapper on Windows
  // does not reliably terminate its native inference child.
  const candidates = [process.env.COMPANION_CODEX_BIN].filter(Boolean);
  const cliRoot=path.join(process.env.APPDATA ?? '', 'npm/node_modules/@openai/codex');
  if(process.platform==='win32') {
    const target=process.arch==='arm64'?'aarch64-pc-windows-msvc':'x86_64-pc-windows-msvc';
    const packageName=`@openai/codex-win32-${process.arch}`;
    try {
      const require=createRequire(path.join(cliRoot,'package.json'));
      const packageFile=require.resolve(`${packageName}/package.json`);
      candidates.push(path.join(path.dirname(packageFile),'vendor',target,'bin/codex.exe'));
    }catch{}
    candidates.push(path.join(cliRoot,'vendor',target,'bin/codex.exe'));
  }
  for (const file of candidates) { try { await access(file); return [file, []]; } catch {} }
  return ['codex', []];
}
