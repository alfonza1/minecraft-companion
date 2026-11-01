import { z } from 'zod';
import { createObserverRegistry } from '../../packages/agent-extensions/index.js';
import { inventorySummary } from '../../examples/extensions/inventory-summary.js';

export function registerObservers(app, runtime) {
  const registry = createObserverRegistry();
  registry.register(inventorySummary);
  app.get('/api/extensions', async () => registry.list());
  app.post('/api/extensions/:id/run', async request => {
    if (!runtime.isActive()) { const error = new Error('Resume the companion before running an observer.'); error.statusCode = 409; throw error; }
    const id = z.string().regex(/^[a-z][a-z0-9-]{2,63}$/).parse(request.params.id);
    return registry.run(id, request.body, { snapshot: runtime.world });
  });
}
