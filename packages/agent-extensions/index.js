import { z } from 'zod';

/** Trusted, statically registered observers. Not a sandbox for third-party code. */
export function createObserverRegistry() {
  const observers = new Map();
  return {
    register(extension) {
      if (!/^[a-z][a-z0-9-]{2,63}$/.test(extension.id) || observers.has(extension.id)) throw new Error('Invalid or duplicate extension id.');
      if (extension.apiVersion !== 1 || extension.kind !== 'observer' || typeof extension.observe !== 'function') throw new Error('Only v1 observation extensions are supported.');
      if (!(extension.input instanceof z.ZodType) || !(extension.output instanceof z.ZodType)) throw new Error('Extensions require input and output schemas.');
      observers.set(extension.id, Object.freeze({ ...extension }));
    },
    list() { return [...observers.values()].map(({ id, title, apiVersion, kind }) => ({ id, title, apiVersion, kind })); },
    async run(id, input, { snapshot, signal }) {
      signal?.throwIfAborted();
      const extension = observers.get(id);
      if (!extension) throw new Error('Unknown observer extension.');
      const args = extension.input.parse(input);
      // Only an isolated copy of observed world data, never auth, raw bot, files,
      // conversation, or mutation hooks. Installed source itself remains trusted.
      const result = await extension.observe(args, structuredClone(snapshot), signal);
      signal?.throwIfAborted();
      return extension.output.parse(result);
    },
  };
}
