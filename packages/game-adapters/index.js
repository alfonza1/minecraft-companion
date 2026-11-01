import { z } from 'zod';

const descriptorSchema = z.object({
  apiVersion: z.literal(1), id: z.string().regex(/^[a-z][a-z0-9-]{1,60}$/),
  name: z.string().min(1).max(80), status: z.enum(['early-access', 'test-fixture']),
  playable: z.boolean(), capabilities: z.array(z.string().max(100)).max(40),
  requirements: z.array(z.string().max(300)).max(20), widgets: z.array(z.string().max(80)).max(20),
  actions: z.array(z.string().regex(/^[a-z][a-z0-9_]*$/)).max(100), safety: z.array(z.string().max(300)).max(20),
}).strict();

export function createGameRegistry(adapters, { allowFixtures = false } = {}) {
  const registry = new Map();
  for (const adapter of adapters) {
    const descriptor = descriptorSchema.parse(adapter.descriptor);
    if (registry.has(descriptor.id)) throw new Error(`Duplicate game adapter: ${descriptor.id}`);
    if (typeof adapter.project !== 'function') throw new Error('Game adapter requires an observation projection.');
    if (descriptor.status === 'test-fixture' && (!allowFixtures || descriptor.playable)) throw new Error('Test fixtures cannot be registered as playable games.');
    registry.set(descriptor.id, { ...adapter, descriptor: Object.freeze(descriptor) });
  }
  function get(id) {
    const adapter = registry.get(id);
    if (!adapter) throw new Error('Unsupported game adapter.');
    return adapter;
  }
  return {
    list: () => [...registry.values()].map(adapter => structuredClone(adapter.descriptor)),
    get,
    project(id, state, context) {
      const adapter = get(id);
      // Trusted installed code receives copied observations, never a bot, account or store.
      const result = adapter.project(structuredClone(state), structuredClone(context));
      if (result?.schemaVersion !== 1 || result?.game?.id !== id || !result.session || !result.activity || !Array.isArray(result.resources)) throw new Error('Invalid game workspace projection.');
      return result;
    },
  };
}
