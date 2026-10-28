import { getBridgeStatus } from '../protocol-bridge/index.js';
import { z } from 'zod';

export function registerSetupRoutes(app, context) {
  const { store, connector, runtime, publish, readiness } = context;
  let checkedAt = null;
  const [nodeMajor, nodeMinor] = process.versions.node.split('.').map(Number);
  const status = () => ({ checkedAt, node: { version: process.versions.node, ready: nodeMajor > 22 || (nodeMajor === 22 && nodeMinor >= 12) }, codex: readiness.codex(), ai: readiness.ai?.(), voice: readiness.voice(), auth: connector.auth, realms: connector.realms, compatibility: connector.compatibility ?? null, bridge: getBridgeStatus(), settings: store.settings() });
  app.get('/api/setup', async () => status());
  app.post('/api/setup/check', async () => { await readiness.refresh(); checkedAt = new Date().toISOString(); publish(); return status(); });
  app.post('/api/realms/check', async request => {
    const { realmId } = z.object({ realmId: z.number().int().positive() }).strict().parse(request.body);
    if (runtime.connection.status === 'connecting') { const error = new Error('Wait for the current Realm connection attempt.'); error.statusCode = 409; throw error; }
    return connector.probeRealm(realmId);
  });
}
