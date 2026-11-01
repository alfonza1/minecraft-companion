import { z } from 'zod';

export const inventorySummary = {
  id: 'inventory-summary', title: 'Observed inventory summary', apiVersion: 1, kind: 'observer',
  input: z.object({ search: z.string().max(80).default('') }).strict(),
  output: z.object({ observed: z.boolean(), items: z.array(z.object({ name: z.string(), count: z.number().int().nonnegative() })) }).strict(),
  observe({ search }, world) {
    if (!world) return { observed: false, items: [] };
    const totals = new Map();
    for (const item of world.inventory || []) {
      if (item.name.includes(search)) totals.set(item.name, (totals.get(item.name) || 0) + item.count);
    }
    return { observed: true, items: [...totals].map(([name, count]) => ({ name, count })) };
  },
};
