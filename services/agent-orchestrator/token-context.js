import { LOW_TOKEN_LIMITS as limits } from '../../packages/shared-types/token-mode.js';

const HOSTILE = /^(?:zombie|skeleton|creeper|spider|drowned|husk|stray|witch|pillager|phantom|warden|blaze|hoglin|piglin_brute)$/;
const point = value => value ? Object.fromEntries(['x', 'y', 'z'].map(axis => [axis, Math.round(value[axis] * 10) / 10])) : null;
const item = value => value ? { name: value.name, count: value.count, ...(value.durabilityRemaining !== undefined ? { durabilityRemaining: value.durabilityRemaining } : {}) } : null;
export function inventoryTotals(inventory = []) {
  return inventory.reduce((totals, value) => { totals[value.name] = (totals[value.name] || 0) + value.count; return totals; }, Object.create(null));
}

function relevant(records, message, fields, count) {
  const words = new Set(message.toLowerCase().match(/[a-z0-9_]{3,}/g) || []);
  for (const word of ['the', 'and', 'what', 'how', 'are', 'you', 'your', 'can', 'for', 'that', 'this', 'with', 'please']) words.delete(word);
  return records.map((record, index) => ({ record, index, score: fields.reduce((score, field) => score + [...words].filter(word => String(record[field] || '').toLowerCase().includes(word)).length, 0) }))
    .sort((a, b) => b.score - a.score || b.index - a.index).slice(0, count).map(value => value.record);
}

export function compactConversationContext({ message, recent, memory, project, world, currentTask, savedTasks, teammate, playerName, availableActions }) {
  const previous = recent.at(-1)?.role === 'user' && recent.at(-1).text === message.slice(0, 2000) ? recent.slice(0, -1) : recent;
  const entities = world?.nearbyEntities || [];
  const threats = entities.filter(entity => HOSTILE.test(entity.name));
  const nearby = [...entities].sort((a, b) => Number(HOSTILE.test(b.name)) - Number(HOSTILE.test(a.name)) || a.distance - b.distance).slice(0, limits.nearbyEntities);
  return {
    message,
    project:project?{...project,assignments:project.assignments?.slice(0,12),uncertainties:project.uncertainties?.slice(0,3)}:null,
    recent: previous.slice(-limits.messages).map(value => ({ role: value.role, text: value.text.slice(0, limits.messageCharacters) })),
    memory: relevant(memory, message, ['label', 'value'], limits.memories).map(value => ({ label: String(value.label || '').slice(0, 100), value: String(value.value || '').slice(0, limits.memoryCharacters) })),
    world: world ? { observedAt: world.observedAt, provenance: world.provenance, inventoryExact: world.inventoryExact, dimension: world.dimension, position: point(world.position), health: world.health, food: world.food, oxygen: world.oxygen,
      inventory: inventoryTotals(world.inventory), equipment: Object.fromEntries(Object.entries(world.equipment || {}).map(([slot, value]) => [slot, item(value)])),
      nearbyPlayers: (world.nearbyPlayers || []).filter(value => value.name === playerName).map(value => ({ name: value.name, position: point(value.position) })),
      nearbyEntities: nearby.map(value => ({ name: value.name, distance: value.distance, position: point(value.position) })), observedThreatCount: threats.length, timeOfDay: world.timeOfDay } : null,
    currentTask: currentTask ? { name: currentTask.name, tool: currentTask.tool, status: currentTask.status } : null,
    savedTasks: savedTasks ? { held: savedTasks.held, total: savedTasks.frames.length, frames: savedTasks.frames.slice(-limits.tasks).map(frame => ({ label: frame.label, status: frame.status, step: frame.step, steps: frame.steps, error: frame.error?.slice(0, 160) })) } : null,
    teammate: teammate ? {
      preferences: teammate.preferences,
      storageAnchor: teammate.storageAnchor,
      locations: relevant(teammate.locations || [], message, ['name', 'id'], limits.locations).map(place => ({ name: place.name, position: point(place.position), dimension: place.dimension, realmId: place.realmId, provenance: place.provenance, observedAt: place.observedAt })),
      routines: (teammate.routines || []).map(routine => ({ id: routine.id, supplies: routine.supplies })),
      supplies: (teammate.supplies || []).slice(-8).map(chest => ({ name: chest.name, dimension: chest.dimension, realmId: chest.realmId, approved: chest.approved, observedAt: chest.observedAt })),
      deaths: (teammate.deaths || []).slice(-1).map(death => ({ id: death.id, dimension: death.dimension, realmId: death.realmId, position: point(death.position), at: death.at, status: death.status, warning: death.warning })),
    } : null,
    playerName, availableActions,
  };
}

// Explicit status questions only. Normal conversation still uses the planner.
export function localStatusReply(text, state) {
  const message = text.toLowerCase().trim().replace(/[.!?]+$/, ''), world = state.world;
  if (/^(?:what(?:'s| is) (?:in )?your inventory|what (?:items |stuff )?do you have|check your inventory)$/.test(message)) {
    if (!world) return 'I’m not connected, so I can’t check my inventory.';
    if (world.inventoryExact === false) return 'My inventory is waiting for server confirmation. I don’t want to give you the wrong counts.';
    const stock = Object.entries(inventoryTotals(world.inventory));
    return stock.length ? `I’ve got ${stock.map(([name, count]) => `${count} ${name.replaceAll('_', ' ')}`).join(', ')}.` : 'My inventory is empty.';
  }
  const quantity = message.match(/^how (?:much|many) (.+?) (?:do you have|have you got)$/);
  if (quantity && /^[a-z_ ]{1,80}$/.test(quantity[1])) {
    const phrase = quantity[1].replace(/_/g, ' '), totals = inventoryTotals(world?.inventory);
    let names = Object.keys(totals).filter(name => [name.replaceAll('_', ' '), name.replaceAll('_', ' ') + 's'].includes(phrase));
    if (/^(?:wood|logs?|timber)$/.test(phrase)) names = Object.keys(totals).filter(name => /_(?:log|stem)$/.test(name));
    if (/^planks?$/.test(phrase)) names = Object.keys(totals).filter(name => name.endsWith('_planks'));
    // Avoid turning general questions (e.g. "how much time do you have") into item counts.
    if (!names.length && !/^(?:wood|logs?|timber|planks?|food|torches|stone|cobblestone|oak logs?|spruce logs?|birch logs?)$/.test(phrase)) return null;
    if (phrase === 'food') return null; // Food needs the version-specific registry, not a guessed list.
    if (!world) return 'I’m not connected, so I can’t check my supplies.';
    if (world.inventoryExact === false) return 'My inventory isn’t confirmed yet. Ask me again once it syncs.';
    const count = names.reduce((sum, name) => sum + totals[name], 0);
    if (phrase === 'torches') names = Object.keys(totals).filter(name => name === 'torch');
    const amount = phrase === 'torches' ? totals.torch || 0 : count;
    return `I’ve got ${amount} ${phrase}.`;
  }
  if (/^(?:where are you|what are your (?:coords|coordinates)|what(?:'s| is) your location)$/.test(message)) return world ? `I’m at ${Math.floor(world.position.x)}, ${Math.floor(world.position.y)}, ${Math.floor(world.position.z)} in ${world.dimension}.` : 'I’m not connected to the world right now.';
  if (/^(?:how(?:'s| is) your health|how much health do you have|are you hurt)$/.test(message)) return world ? `I’m at ${world.health} out of 20 health, with ${world.food} out of 20 hunger.` : 'I’m offline, so there’s no current health reading.';
  if (/^(?:what are you doing|what're you doing)$/.test(message)) return state.currentTask ? `I’m working on ${state.currentTask.name || state.currentTask.tool}.` : state.taskStack?.frames.length ? `I’ve got ${state.taskStack.frames.length} saved job${state.taskStack.frames.length === 1 ? '' : 's'} waiting.` : 'No task running right now.';
  return null;
}
