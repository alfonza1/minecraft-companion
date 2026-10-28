import { setTimeout as delay } from 'node:timers/promises';

export const LANDING_TIMEOUT_MS = 1200;
export async function waitForMiningFooting(bot, signal) {
  signal.throwIfAborted();
  if (bot.entity.isInWater) return;
  const deadline = Date.now() + LANDING_TIMEOUT_MS;
  while (!bot.entity.onGround && Date.now() < deadline) {
    signal.throwIfAborted(); await delay(25, undefined, { signal });
  }
  if (!bot.entity.onGround) throw new Error('I need stable footing before mining. Move me onto solid ground.');
}

export async function equipFastestTool(bot, block, signal) {
  const effects = bot.entity.effects;
  const helmet = bot.inventory.slots[bot.getEquipmentDestSlot('head')];
  const candidates = [null, ...bot.inventory.items()].filter(item => block.canHarvest(item?.type ?? null));
  const duration = item => block.digTime(item?.type ?? null, false, false, false,
    [...(item?.enchants ?? []), ...(helmet?.enchants ?? [])], effects);
  candidates.sort((a, b) => duration(a) - duration(b));
  if (!candidates.length) throw new Error(`I need a suitable tool to harvest ${block.name}.`);
  const best = candidates[0], held = bot.heldItem;
  if (block.canHarvest(held?.type ?? null) && duration(held) <= duration(best)) return;
  signal.throwIfAborted();
  if (best) await bot.equip(best, 'hand');
  else if (held) await bot.unequip('hand');
  signal.throwIfAborted();
}
