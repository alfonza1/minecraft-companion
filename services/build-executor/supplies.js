import { Vec3 } from 'vec3';
import { blockItem } from '../build-planner/blueprint.js';
import { dataFor } from '../../packages/minecraft-data/index.js';
import { inventoryCounts, reserveMaterials } from '../resource-ledger/index.js';
import { matchesPlacement, resumableSlab } from './placement.js';
import { navigateWithRecovery } from '../skill-executor/navigation.js';
import { confirmInventory } from '../skill-executor/items.js';
import { isProtectedSupply } from '../skill-executor/teammate.js';
import { createRawGatherer, RAW_BUILD_SOURCES } from './raw-materials.js';
import { approach, occupied, abortableWait } from './site.js';
import { placementSupport, placeAdaptedBlock, EMPTY } from './placement.js';
import { vector } from './construction-plan.js';
import { companionPerformance } from '../companion-runtime/performance.js';
import { requestMaterial, resolveMaterialRequest } from '../resource-ledger/material-requests.js';

const MAX_CRAFT_BATCHES = 16;
const MAX_PHASE_MATERIAL_TYPES = 4;
const FREE_SUPPLY_SLOTS = 2;
const RAW_STOCK_TARGET = 64;
const CRAFTED_STOCK_TARGET = 32;
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
  let phaseDemand = null;
  const gather = createRawGatherer({ project, bot, store, save, teammate });
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
    const protectedCount = store.get('projects').filter(value => !project.construction?.policy.gatherMaterials || value.id !== project.id).reduce((sum, value) => sum + (value.reservations?.[name] ?? 0), 0);
    const stacks = bot.inventory.items().filter(item => item.name === name);
    return !stacks.some(item => item.customName || item.enchants?.length) && stacks.reduce((sum, item) => sum + item.count, 0) - protectedCount >= -value.count;
  });
  async function craft(name, desired, signal) {
    let table = bot.findBlock({ matching: bot.registry.blocksByName.crafting_table.id, maxDistance: 32 });
    if (!table && project.construction?.workbench && name !== 'crafting_table' && bot.recipesAll(bot.registry.itemsByName[name].id, null, true).some(recipe => recipe.requiresTable)) table = await ensureWorkbench(signal);
    for (let batch = 0; batch < MAX_CRAFT_BATCHES && free(name) < desired; batch++) {
      signal.throwIfAborted();
      refresh();
      const recipe = bot.recipesFor(bot.registry.itemsByName[name].id, null, 1, table).find(craftable);
      if (!recipe) break;
      if (recipe.requiresTable) await navigateWithRecovery(bot, table.position, 2, signal);
      signal.throwIfAborted();
      if (!craftable(recipe)) throw new Error('Crafting ingredients changed or were reserved by another project.');
      const repetitions = Math.max(1, Math.min(MAX_CRAFT_BATCHES - batch, Math.ceil((desired-free(name))/recipe.result.count), ...recipe.delta.filter(value=>value.count<0).map(value=>Math.floor((free(bot.registry.items[value.id].name)-reservedHere(bot.registry.items[value.id].name))/-value.count))));
      const before = free(name), originalClick = bot.clickWindow;
      bot.clickWindow = async (...args) => {
        signal.throwIfAborted(); await originalClick(...args);
        await bot.waitForTicks(2); signal.throwIfAborted();
        await confirmInventory(bot, bot.currentWindow ?? bot.inventory);
      };
      try { await companionPerformance.measure('crafting batch', () => bot.craft(recipe, repetitions, recipe.requiresTable ? table : null)); }
      finally { bot.clickWindow = originalClick; }
      batch += repetitions - 1;
      await confirmInventory(bot); signal.throwIfAborted();
      if (free(name) <= before) throw new Error(`Crafting ${name} did not produce confirmed inventory. Resupply stopped.`);
    }
  }
  const reservedHere = name => project.construction?.policy.gatherMaterials ? 0 : project.reservations?.[name] ?? 0;
  const supportedIngredient = name => RAW_BUILD_SOURCES[name] || /^(oak|spruce|birch)_planks$/.test(name) || name === 'stick';
  async function acquire(name, target, signal, { temporary = false, ancestors = [] } = {}) {
    if (ancestors.includes(name) || ancestors.length > 4 || isProtectedSupply(name)) return;
    signal.throwIfAborted();
    if (free(name) >= target) return;
    const otherReserved = (inventoryCounts(bot.inventory.items())[name] ?? 0) - free(name);
    if (teammate) await teammate.withdraw([{ name, count: target + otherReserved }], signal);
    signal.throwIfAborted(); refresh();
    if (RAW_BUILD_SOURCES[name] && project.construction?.policy.gatherMaterials) {
      for (let trip = 0; trip < 8 && free(name) < target; trip++) {
        await gather(name, target - free(name), signal, { temporary }); refresh();
      }
      return;
    }
    await craft(name, target, signal);
    if (free(name) >= target || !project.construction?.policy.gatherMaterials) return;
    const recipes = bot.recipesAll(bot.registry.itemsByName[name].id, null, true);
    const ingredients = recipe => recipe.delta.filter(value => value.count < 0).map(value => ({ name: bot.registry.items[value.id]?.name, count: -value.count }));
    const recipe = recipes.find(value => ingredients(value).length && ingredients(value).every(input => input.name && !ancestors.includes(input.name) && input.name !== name && !isProtectedSupply(input.name) && (supportedIngredient(input.name) || free(input.name) - reservedHere(input.name) >= input.count)));
    if (!recipe) return;
    const batches = Math.min(MAX_CRAFT_BATCHES, Math.ceil((target - free(name)) / recipe.result.count));
    for (const input of ingredients(recipe)) await acquire(input.name, input.count * batches + reservedHere(input.name), signal, { temporary, ancestors: [...ancestors, name] });
    await craft(name, target, signal);
  }
  async function ensureWorkbench(signal) {
    const entry = project.construction.workbench, p = vector(entry.position);
    if (bot.blockAt(p)?.name === 'crafting_table') return bot.blockAt(p);
    if (!EMPTY.has(bot.blockAt(p)?.name)) throw new Error('The planned workbench position is occupied or unloaded.');
    const plank = project.blueprint.blocks.map(block => block.name.match(/^(oak|spruce|birch)_/)?.[1]).find(Boolean) ?? 'oak';
    await acquire(`${plank}_planks`, 4, signal, { temporary: true });
    await craft('crafting_table', 1, signal);
    await approach(bot, p, signal, 1);
    const item = bot.inventory.items().find(item => item.name === 'crafting_table' && !item.customName);
    if (!item) throw new Error('Could not craft the automatic workbench.');
    await bot.equip(item, 'hand'); signal.throwIfAborted();
    const support = placementSupport(bot, p);
    if (!support) throw new Error('Workbench foundation is no longer available.');
    entry.status = 'intent'; save(project);
    await abortableWait(localSignal => placeAdaptedBlock(bot, { name: 'crafting_table' }, p, support, localSignal, () => {
      if (!EMPTY.has(bot.blockAt(p)?.name) || occupied(bot, p)) throw new Error('Workbench position changed while approaching.');
    }), signal, bot);
    entry.status = 'placed'; save(project);
    await confirmInventory(bot); signal.throwIfAborted();
    return bot.blockAt(p);
  }
  const ensure = async (block, minimum, signal, { temporaryDemand = 0 } = {}) => {
    signal.throwIfAborted();
    const item = blockItem(block, dataFor(bot.version));
    if (free(item.name) >= minimum) { resolveMaterialRequest(store, project, item.name, free(item.name)); return; }
    demand = structuredClone(phaseDemand ?? remainingMaterials(project.blueprint, bot, origin));
    if (temporaryDemand) {
      const row = demand.find(value => value.name === item.name);
      if (row) row.quantity += temporaryDemand;
      else demand.push({ name: item.name, quantity: temporaryDemand });
    }
    refresh();
    // Extra worksite material has its own allowance; do not charge blueprint
    // demand to that allowance when the scaffold happens to use the same block.
    const remaining = temporaryDemand || demand.find(row => row.name === item.name)?.quantity || minimum;
    const desired = Math.min(remaining, RAW_BUILD_SOURCES[item.name] ? RAW_STOCK_TARGET : CRAFTED_STOCK_TARGET, bot.registry.itemsByName[item.name].stackSize);
    // Chest permissions are checked live by the existing teammate service.
    // The request is an inventory target including other projects' reservations.
    const reservedElsewhere = (inventoryCounts(bot.inventory.items())[item.name] ?? 0) - free(item.name);
    if (teammate) await teammate.withdraw([{ name: item.name, count: desired + reservedElsewhere }], signal);
    signal.throwIfAborted(); refresh();
    if (free(item.name) < minimum && !isProtectedSupply(item.name)) {
      if (project.construction?.policy.gatherMaterials) await acquire(item.name, desired, signal, { temporary: temporaryDemand > 0 });
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
    if (free(item.name) < minimum) throw requestMaterial({store, project, teammate, item:item.name, count:desired-free(item.name), available:free(item.name)});
    resolveMaterialRequest(store, project, item.name, free(item.name));
  };
  ensure.preparePhase = async (blocks, signal) => {
    phaseDemand = remainingMaterials({...project.blueprint,blocks},bot,origin);
    demand = structuredClone(phaseDemand);
    refresh();
    const limit=Math.min(MAX_PHASE_MATERIAL_TYPES,Math.max(0,(bot.inventory.emptySlotCount?.()??6)-FREE_SUPPLY_SLOTS));
    for(const row of phaseDemand.slice(0,limit)){
      signal.throwIfAborted();
      const definition=bot.registry.itemsByName[row.name];
      const target=Math.min(row.quantity,definition.stackSize,RAW_BUILD_SOURCES[row.name]?RAW_STOCK_TARGET:CRAFTED_STOCK_TARGET);
      if(free(row.name)>=target)continue;
      try { await ensure({name:row.name},target,signal); }
      catch(error){signal.throwIfAborted();if(error.code!=='MATERIAL_HELP_NEEDED')throw error;}
    }
  };
  return ensure;
}
