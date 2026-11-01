import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { dataDirectory } from '../../memory/store.js';

export const claudeIntegrationDirectory = join(dataDirectory, 'integrations', 'claude');
export async function loadClaudeSdk() {
  // Preserve existing installs while keeping the proprietary optional integration
  // out of the open-source core dependency graph and source release artifacts.
  const locations = [createRequire(import.meta.url), createRequire(join(claudeIntegrationDirectory, 'package.json'))];
  for (const require of locations) {
    let path;
    try { path = require.resolve('@anthropic-ai/claude-agent-sdk'); }
    catch (error) { if (error.code === 'MODULE_NOT_FOUND') continue; throw error; }
    return import(pathToFileURL(path).href);
  }
  throw new Error('Optional Claude integration is not installed. Run npm run setup:claude, review its vendor terms, then refresh models.');
}
