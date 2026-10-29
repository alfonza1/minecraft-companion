import { Vec3 } from 'vec3';
import { blockItem } from '../build-planner/blueprint.js';
import { dataFor } from '../../packages/minecraft-data/index.js';
import { inventoryCounts, reserveMaterials } from '../resource-ledger/index.js';
import { matchesPlacement, resumableSlab } from './placement.js';
import { navigateWithRecovery } from '../skill-executor/navigation.js';
import { confirmInventory } from '../skill-executor/items.js';
import { isProtectedSupply } from '../skill-executor/teammate.js';

const MAX_CRAFT_BATCHES = 16;
export function remainingMaterials(blueprint, bot, origin) {
  const counts = new Map(), data = dataFor(blueprint.version), base = new Vec3(origin.x, origin.y, origin.z);
  for (const block of blueprint.blocks) {
    const observed = bot.blockAt(base.offset(block.x, block.y, block.z));
    if (matchesPlacement(observed, block, { final: false })) continue;
    const item = blockItem(block, data);
    if (item?.name) counts.set(item.name, (counts.get(item.name) ?? 0) + (resumableSlab(observed, block) ? 1 : item.quantity));
  }
  return [...counts].map(([name, quantity]) => ({ name, quantity }));
}

export function createBuildSupplies({ project, origin, bot, store, teammate, save }) {
  let demand = [];
  const refresh = () => {
    project.reservations = reserveMaterials(store.get('projects'), project.id, demand, bot.inventory.items(), { partial: true });
    save(project);
  };
  const free = name => {
    const reservedElsewhere = store.get('projects').filter(value => value.id !== project.id).reduce((sum, value) => sum + (value.reservations?.[name] ?? 0), 0);
    return Math.max(0, (inventoryCounts(bot.inventory.items().filter(item => !item.customName && !item.enchants?.length))[name] ?? 0) - reservedElsewhere);
  };
  const craftable = recipe => recipe.delta.filter(value => value.count < 0).every(value => {
    const name = bot.registry.items[value.id]?.name;
    if (!name || isProtectedSupply(name)) return false;
    const protectedCount = store.get('projects').reduce((sum, value) => sum + (value.reservations?.[name] ?? 0), 0);
    const stacks = bot.inventory.items().filter(item => item.name === name);
    return !stacks.some(item => item.customName || item.enchants?.length) && stacks.reduce((sum, item) => sum + item.count, 0) - protectedCount >= -value.count;
  });
  async function craft(name, desired, signal) {
    const table = bot.findBlock({ matching: bot.registry.blocksByName.crafting_table.id, maxDistance: 32 });
    for (let batch = 0; batch < MAX_CRAFT_BATCHES && free(name) < desired; batch++) {
      signal.throwIfAborted();
      refresh();
      const recipe = bot.recipesFor(bot.registry.itemsByName[name].id, null, 1, table).find(craftable);
      if (!recipe) break;
      if (recipe.requiresTable) await navigateWithRecovery(bot, table.position, 2, signal);
      signal.throwIfAborted();
      if (!craftable(recipe)) throw new Error('Crafting ingredients changed or were reserved by another project.');
      const before = free(name), originalClick = bot.clickWindow;
      bot.clickWindow = async (...args) => {
        signal.throwIfAborted(); await originalClick(...args);
        await bot.waitForTicks(2); signal.throwIfAborted();
        await confirmInventory(bot, bot.currentWindow ?? bot.inventory);
      };
      try { await bot.craft(recipe, 1, recipe.requiresTable ? table : null); }
      finally { bot.clickWindow = originalClick; }
      await confirmInventory(bot); signal.throwIfAborted();
      if (free(name) <= before) throw new Error(`Crafting ${name} did not produce confirmed inventory. Resupply stopped.`);
    }
  }
  return async (block, minimum, signal) => {
    signal.throwIfAborted();
    const item = blockItem(block, dataFor(bot.version));
    if (free(item.name) >= minimum) return;
    demand = remainingMaterials(project.blueprint, bot, origin);
    refresh();
    const remaining = demand.find(row => row.name === item.name)?.quantity ?? minimum;
    const desired = Math.min(remaining, bot.registry.itemsByName[item.name].stackSize);
    // Chest permissions are checked live by the existing teammate service.
    // The request is an inventory target including other projects' reservations.
    const reservedElsewhere = (inventoryCounts(bot.inventory.items())[item.name] ?? 0) - free(item.name);
    if (teammate) await teammate.withdraw([{ name: item.name, count: desired + reservedElsewhere }], signal);
    signal.throwIfAborted(); refresh();
    if (free(item.name) < minimum && !isProtectedSupply(item.name)) {
      // Wood conversions are the only recursive production step. More complex
      // smelting/fuel or rare-resource recipes stay explicit instead of guessed.
      if (/_stairs$|_slab$|_door$|_fence$/.test(item.name)) {
        const plank = item.name.replace(/_(stairs|slab|door|fence)$/, '_planks');
        const recipe = bot.recipesAll(bot.registry.itemsByName[item.name].id, null, true).find(value =>
          value.delta.some(ingredient => ingredient.count < 0 && bot.registry.items[ingredient.id]?.name === plank));
        const ingredient = recipe?.delta.find(value => value.count < 0 && bot.registry.items[value.id]?.name === plank);
        if (ingredient) {
          const batches = Math.ceil(Math.max(0, desired - free(item.name)) / recipe.result.count);
          await craft(plank, Math.min(64, -ingredient.count * batches), signal);
        }
      }
      await craft(item.name, desired, signal);
    }
    refresh(); signal.throwIfAborted();
    if (free(item.name) < minimum) throw new Error(`Need ${minimum} ${item.name}. Approved chests and unreserved crafting ingredients could not cover it. Bring materials or gather them, then resume this checkpoint.`);
  };
}
