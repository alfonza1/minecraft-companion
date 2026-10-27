import minecraftData from 'minecraft-data';

const cache = new Map();
export function dataFor(version) {
  if (typeof version !== 'string' || !/^\d+\.\d+(?:\.\d+)?$/.test(version)) throw new Error('A supported Java release version is required.');
  if (!cache.has(version)) {
    const data = minecraftData(version);
    if (!data || data.version.type === 'bedrock' || data.version.minecraftVersion !== version) throw new Error(`Minecraft Java ${version} is not in the installed protocol dataset.`);
    cache.set(version, data);
  }
  return cache.get(version);
}

export function itemStacks(quantity, stackSize = 64) {
  return { full: Math.floor(quantity / stackSize), remainder: quantity % stackSize };
}

export function recipeIngredients(recipe) {
  const slots = recipe.ingredients ?? recipe.inShape?.flat() ?? [];
  const counts = new Map();
  for (const slot of slots) {
    const id = typeof slot === 'object' && slot !== null ? slot.id : slot;
    if (!Number.isInteger(id) || id < 0) continue;
    counts.set(id, (counts.get(id) ?? 0) + (typeof slot === 'object' ? slot.count ?? 1 : 1));
  }
  return counts;
}

export function validateBlockProperties(block, properties = {}) {
  if (!properties || typeof properties !== 'object' || Array.isArray(properties)) throw new Error(`Invalid properties for ${block.name}.`);
  const result = {};
  for (const [key, value] of Object.entries(properties)) {
    const state = block.states?.find((candidate) => candidate.name === key);
    if (!state || !['string', 'number', 'boolean'].includes(typeof value)) throw new Error(`Unknown state ${block.name}.${key}.`);
    const text = String(value);
    const valid = state.type === 'bool' ? ['true', 'false'].includes(text)
      : state.values ? state.values.map(String).includes(text)
        : /^\d+$/.test(text) && Number(text) >= 0 && Number(text) < state.num_values;
    if (!valid) throw new Error(`Invalid state ${block.name}.${key}=${text}.`);
    result[key] = text;
  }
  return result;
}
