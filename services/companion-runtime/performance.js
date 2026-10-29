import { performance } from 'node:perf_hooks';

const MAX_SAMPLES = 100;
export function createPerformanceMetrics() {
  const stages = new Map();
  function record(stage, elapsedMs, success = true) {
    if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return;
    const row = stages.get(stage) ?? { samples: [], count: 0, failures: 0, totalMs: 0 };
    row.count++; row.failures += Number(!success); row.totalMs += elapsedMs;
    row.samples.push(elapsedMs); if (row.samples.length > MAX_SAMPLES) row.samples.shift();
    stages.set(stage, row);
  }
  return {
    record,
    async measure(stage, work) {
      const started = performance.now(); let success = false;
      try { const result = await work(); success = true; return result; }
      finally { record(stage, performance.now() - started, success); }
    },
    snapshot: () => [...stages].map(([stage, row]) => {
      const ordered = [...row.samples].sort((a, b) => a - b);
      return { stage, count: row.count, failures: row.failures, totalMs: Math.round(row.totalMs), lastMs: Math.round(row.samples.at(-1)), medianMs: Math.round(ordered[Math.floor(ordered.length / 2)]), p95Ms: Math.round(ordered[Math.ceil(ordered.length * .95) - 1]), sampleCount: ordered.length };
    }),
  };
}
// Process-local timings contain no prompts, audio, coordinates or credentials.
export const companionPerformance = createPerformanceMetrics();
