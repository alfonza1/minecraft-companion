import { dataFor, itemStacks, recipeIngredients } from '../../packages/minecraft-data/index.js';
import { localProductionRecipes } from '../../packages/minecraft-data/production.js';
import { blockItem } from './blueprint.js';

const RAW = /(?:_log|_stem|_ore|_ingot|_leaves|_sapling|_dye)$/;
const NATURAL = new Set(['coal', 'charcoal', 'diamond', 'emerald', 'redstone', 'lapis_lazuli', 'quartz', 'cobblestone', 'cobbled_deepslate', 'sand', 'red_sand', 'dirt', 'gravel', 'clay_ball', 'flint', 'string', 'leather', 'feather', 'slime_ball', 'snowball', 'wheat', 'bamboo', 'sugar_cane', 'honeycomb', 'amethyst_shard', 'glowstone_dust', 'prismarine_shard', 'prismarine_crystals']);
const PRODUCTION = new Set(['stone', 'smooth_stone', 'glass', 'terracotta', 'brick', 'nether_brick', 'smooth_sandstone', 'smooth_red_sandstone', 'smooth_quartz', 'cracked_stone_bricks', 'sponge']);
const add = (map, name, count) => map.set(name, (map.get(name) ?? 0) + count);

// minecraft-data contains crafting recipes. Missing furnace/stonecutter recipes
// remain explicit acquisition prerequisites rather than invented raw quantities.
export function calculateMaterials(blueprint, recipeOverrides = {}, productionCatalog = localProductionRecipes(blueprint.version)) {
  const data = dataFor(blueprint.version);
  const placed = new Map();
  const items = new Map();
  const unresolved = [];
  for (const block of blueprint.blocks) {
    add(placed, block.name, 1);
    const item = blockItem(block, data);
    if (item === null) unresolved.push(`No survival inventory item mapping for ${block.name}.`);
    else if (item.name) add(items, item.name, item.quantity);
  }
  const plans = new Map();
  const depths = new Map();
  function resolve(name, ancestors = []) {
    if (ancestors.includes(name)) return false;
    if (plans.has(name)) return true;
    const productionChoices = productionCatalog.recipes.get(name) ?? [];
    if ((RAW.test(name) || NATURAL.has(name)) && !productionChoices.length) {
      plans.set(name, null); depths.set(name, 0);
      if (name.endsWith('_ingot')) unresolved.push(`${name}: refined resource prerequisite; ore smelting and fuel are not included in the installed crafting recipe dataset.`);
      return true;
    }
    const item = data.itemsByName[name];
    const candidates = data.recipes[item?.id] ?? [];
    const crafting = (recipeOverrides[name] === undefined ? candidates : [candidates[recipeOverrides[name]]].filter(Boolean)).map((recipe) => ({ yield: recipe.result?.count, ingredients: [...recipeIngredients(recipe)].map(([id, count]) => ({ name: data.items[id]?.name, count })), table: Boolean(recipe.inShape && (recipe.inShape.length > 2 || recipe.inShape.some((r) => r.length > 2))), method: 'crafting' }));
    const choices = recipeOverrides[name] === undefined ? [...productionChoices, ...crafting] : crafting;
    for (const recipe of choices) {
      const ingredients = recipe.ingredients;
      if (!ingredients.length || ingredients.some((x) => !x.name || ancestors.includes(x.name) || x.name === name) || !recipe.yield) continue;
      // Try the official data order. It is stable and displayed to users; this
      // is a deterministic acquisition plan, not a claim of global optimality.
      if (!ingredients.every((x) => resolve(x.name, [...ancestors, name]))) continue;
      plans.set(name, recipe);
      depths.set(name, 1 + Math.max(...ingredients.map((x) => depths.get(x.name) ?? 0)));
      return true;
    }
    plans.set(name, null);
    depths.set(name, 0);
    if (PRODUCTION.has(name) || choices.length) unresolved.push(`${name}: acquisition required; installed crafting data does not provide a safe non-cyclic furnace/stonecutting plan.`);
    return true;
  }
  for (const name of items.keys()) resolve(name);
  const demand = new Map(items);
  const steps = [];
  const raw = new Map();
  // Expanding shared intermediates once (after every dependent) avoids both
  // double counting and separate rounding of the same plank/log batches.
  const ordered = [...plans.keys()].sort((a, b) => (depths.get(b) ?? 0) - (depths.get(a) ?? 0) || a.localeCompare(b));
  for (const name of ordered) {
    const quantity = demand.get(name) ?? 0;
    if (!quantity) continue;
    const plan = plans.get(name);
    if (!plan) { add(raw, name, quantity); continue; }
    const batches = Math.ceil(quantity / plan.yield);
    steps.push({ name, required: quantity, batches, yield: plan.yield, produced: batches * plan.yield, surplus: batches * plan.yield - quantity, ingredients: plan.ingredients.map((x) => ({ name: x.name, quantity: x.count * batches })), requiresCraftingTable: Boolean(plan.table), requiresStonecutter: plan.method === 'stonecutting', requiresFurnace: plan.method === 'smelting', method: plan.method, cookingTicks: (plan.cookingTicks ?? 0) * batches, sourceRecipe: plan.sourceRecipe, ingredientAlternatives: plan.alternatives });
    for (const ingredient of plan.ingredients) add(demand, ingredient.name, ingredient.count * batches);
  }
  function rows(counts) {
    return [...counts].sort(([a], [b]) => a.localeCompare(b)).map(([name, quantity]) => ({ name, quantity, stackSize: data.itemsByName[name]?.stackSize ?? 64, stacks: itemStacks(quantity, data.itemsByName[name]?.stackSize ?? 64) }));
  }
  const cookingTicks = steps.reduce((sum, step) => sum + step.cookingTicks, 0);
  if (cookingTicks) unresolved.push(`Furnace fuel is separate: ${cookingTicks} total cooking ticks. Choose a fuel and account for furnace batch scheduling before gathering; no unverified fuel quantity is included.`);
  return { accuracy: blueprint.provenance === 'estimated' ? 'estimated' : 'exact-blueprint', basis: 'Counts describe the saved design, not hidden blocks in its references.', placed: rows(placed), craftedItems: rows(items), raw: rows(raw), steps: steps.reverse(), unresolved: [...new Set(unresolved)], contingency: [], recipeVersion: data.version.minecraftVersion, productionSource: productionCatalog.source, fuel: { cookingTicks, quantity: null, reason: cookingTicks ? 'Fuel choice and furnace batch scheduling are unresolved.' : null }, strategy: 'Exact-version installed client production recipes when available, otherwise installed crafting recipe order. This is one deterministic production plan, not global optimization. Temporary scaffolding and unresolved fuel are separate.' };
}
