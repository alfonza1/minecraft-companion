import {GEAR_LIMITS,replacementThreshold,remainingDurability} from '../services/skill-executor/gear-policy.js';
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

export async function equipFastestTool(bot, block, signal, { minimumDurability = GEAR_LIMITS.minimumDurability,toolFilter=()=>true } = {}) {
  signal.throwIfAborted();
  const effects = bot.entity.effects;
  const helmet = bot.inventory.slots[bot.getEquipmentDestSlot('head')];
  const usable = item => !item || !bot.registry?.itemsByName[item.name]?.maxDurability || bot.registry.itemsByName[item.name].maxDurability - (item.durabilityUsed ?? 0) >= minimumDurability;
  const candidates = [null, ...bot.inventory.items()].filter(item => usable(item) && toolFilter(item) && block.canHarvest(item?.type ?? null));
  const duration = item => block.digTime(item?.type ?? null, false, false, false,
    [...(item?.enchants ?? []), ...(helmet?.enchants ?? [])], effects);
  candidates.sort((a, b) => duration(a) - duration(b) || remainingDurability(bot,b)-remainingDurability(bot,a));
  if (!candidates.length) throw new Error(`I need a suitable tool to harvest ${block.name}.`);
  const best = candidates[0], held = bot.heldItem;
  if (usable(held) && toolFilter(held) && (!held||remainingDurability(bot,held)>replacementThreshold(bot,held)) && block.canHarvest(held?.type ?? null) && duration(held) <= duration(best)) return;
  signal.throwIfAborted();
  if (best) await bot.equip(best, 'hand');
  else if (held) await bot.unequip('hand');
  signal.throwIfAborted();
}
