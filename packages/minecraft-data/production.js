import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { dataFor } from './index.js';

const cache = new Map();

export function normalizeProductionCatalog(catalog, version) {
  if (!catalog || catalog.version !== version) throw new Error('Production recipe catalog version mismatch.');
  const data = dataFor(version);
  const output = new Map();
  function resolveIngredient(value, visited = []) {
    if (Array.isArray(value)) return [...new Set(value.flatMap((v) => resolveIngredient(v, visited)))];
    if (value && typeof value === 'object') return resolveIngredient(value.item ?? (value.tag ? `#${value.tag}` : value.id), visited);
    if (typeof value !== 'string') return [];
    if (value.startsWith('#minecraft:')) {
      const tag = value.slice('#minecraft:'.length);
      if (visited.includes(tag) || visited.length > 20) return [];
      return resolveIngredient(catalog.tags?.[tag] ?? [], [...visited, tag]);
    }
    if (!/^minecraft:[a-z0-9_]+$/.test(value)) return [];
    const name = value.slice(10);
    return data.itemsByName[name] ? [name] : [];
  }
  for (const recipe of catalog.recipes ?? []) {
    if (!['minecraft:smelting', 'minecraft:stonecutting'].includes(recipe.type)) continue;
    const result = typeof recipe.result === 'string' ? { id: recipe.result } : recipe.result;
    const outputName = result?.id?.replace(/^minecraft:/, '');
    if (!data.itemsByName[outputName]) continue;
    const count = result.count ?? 1;
    if (!Number.isInteger(count) || count < 1 || count > 64) continue;
    const inputs = resolveIngredient(recipe.ingredient);
    const method = recipe.type.replace('minecraft:', '');
    if (!inputs.length || (method === 'smelting' && (!Number.isInteger(recipe.cookingtime) || recipe.cookingtime < 1))) continue;
    const rank = (name) => name.startsWith('raw_') ? 0 : name.endsWith('_ore') ? 10 : 1;
    inputs.sort((a, b) => rank(a) - rank(b));
    const candidates = output.get(outputName) ?? [];
    candidates.push({ yield: count, ingredients: [{ name: inputs[0], count: 1 }], method, cookingTicks: method === 'smelting' ? recipe.cookingtime : 0, sourceRecipe: recipe.id, source: catalog.source, alternatives: inputs.slice(1) });
    output.set(outputName, candidates);
  }
  for (const recipes of output.values()) recipes.sort((a, b) => {
    const rank = (r) => r.ingredients[0].name.startsWith('raw_') ? 0 : r.ingredients[0].name.endsWith('_ore') ? 10 : 1;
    return rank(a) - rank(b) || a.sourceRecipe.localeCompare(b.sourceRecipe);
  });
  return output;
}

export function localProductionRecipes(version) {
  if (cache.has(version)) return cache.get(version);
  let result = { recipes: new Map(), source: null, limitation: 'No exact-version installed vanilla client recipe source. Furnace and stonecutter conversions remain unresolved.' };
  const minecraftDirectory = process.env.APPDATA && join(process.env.APPDATA, '.minecraft');
  if (process.platform === 'win32' && minecraftDirectory && existsSync(join(minecraftDirectory, 'versions', version, `${version}.jar`))) {
    const extraction = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', fileURLToPath(new URL('./read-local-recipes.ps1', import.meta.url)), '-Version', version, '-MinecraftDirectory', minecraftDirectory], { encoding: 'utf8', windowsHide: true, timeout: 20_000, maxBuffer: 16 * 1024 * 1024 });
    if (extraction.status === 0 && !extraction.error) {
      try {
        const catalog = JSON.parse(extraction.stdout.replace(/^\uFEFF/, ''));
        result = { recipes: normalizeProductionCatalog(catalog, version), source: catalog.source, limitation: null };
      } catch { result.limitation = 'Installed vanilla production recipes could not be validated. Crafting calculations remain available.'; }
    } else result.limitation = 'Installed client recipe extraction was unavailable. No files were changed; furnace conversions remain unresolved.';
  }
  cache.set(version, result);
  return result;
}
