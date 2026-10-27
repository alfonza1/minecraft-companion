const vector = value => value ? { x: value.x, y: value.y, z: value.z } : null;
export function itemSnapshot(item, registry) {
  if (!item) return null;
  const max = registry?.itemsByName?.[item.name]?.maxDurability;
  return { slot: item.slot, name: item.name, displayName: item.displayName || item.name, type: item.type,
    count: item.count, stackSize: item.stackSize || 64,
    ...(max ? { durabilityRemaining: Math.max(0, max - (item.durabilityUsed || 0)), maxDurability: max } : {}) };
}
export function observeWorld(bot) {
  if (!bot?.entity || !bot.minenessReady) return null;
  const equipment = {};
  for (const [name, slot] of Object.entries({ head: 5, torso: 6, legs: 7, feet: 8, offhand: 45 })) {
    equipment[name] = itemSnapshot(bot.inventory.slots[slot], bot.registry);
  }
  equipment.hand = itemSnapshot(bot.heldItem, bot.registry);
  return { observedAt: new Date().toISOString(), provenance: 'observed', position: vector(bot.entity.position),
    dimension: bot.game?.dimension || 'unknown', health: bot.health ?? null, food: bot.food ?? null,
    oxygen: bot.oxygenLevel ?? null, experience: bot.experience || null, equipment,
    inventory: bot.inventory.items().map(item => itemSnapshot(item, bot.registry)),
    nearbyPlayers: Object.values(bot.players || {}).filter(player => player.entity && player.username !== bot.username)
      .map(player => ({ name: player.username, position: vector(player.entity.position), provenance: 'observed' })),
    nearbyEntities: Object.values(bot.entities || {}).filter(entity => entity.id !== bot.entity.id && entity.position.distanceTo(bot.entity.position) <= 32)
      .slice(0, 64).map(entity => ({ id: entity.id, name: entity.name || entity.type, position: vector(entity.position), distance: Math.round(entity.position.distanceTo(bot.entity.position) * 10) / 10 })),
    timeOfDay: bot.time?.timeOfDay ?? null,
  };
}
