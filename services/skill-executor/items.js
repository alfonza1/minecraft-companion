import { z } from 'zod';
import { inventoryCounts, resolvePlayer, walkTo } from '../../src/actions.js';
import { toolResult } from '../../src/bot.js';

const itemName = z.string().regex(/^[a-z][a-z0-9_]*$/).max(80);
const quantity = z.number().int().min(1).max(2304);
const SYNC_TIMEOUT_MS = 5000;
const pendingSyncs = new WeakMap();
export const HANDOFF_APPROACH_DISTANCE = 0.75;
export const HANDOFF_STEP_BACK_DISTANCE = 3;
const EQUIPMENT = { head: /(?:_helmet|^carved_pumpkin)$/, torso: /(?:_chestplate|^elytra)$/, legs: /_leggings$/, feet: /_boots$/ };

export async function confirmInventory(bot) {
  if (!bot.supportFeature('stateIdUsed') || !bot._syncWindow) throw new Error('This client cannot confirm an inventory transfer safely.');
  bot.companionInventoryUnverified = true;
  // Reuse a timed-out request until it settles, rather than accumulating the
  // library's window listeners when a server stops answering inventory syncs.
  let pending = pendingSyncs.get(bot);
  if (!pending) {
    pending = Promise.resolve().then(() => bot._syncWindow(bot.inventory)).finally(() => pendingSyncs.delete(bot));
    pendingSyncs.set(bot, pending);
  }
  let timer;
  try {
    await Promise.race([pending, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Server inventory confirmation timed out; transfer is unverified.')), SYNC_TIMEOUT_MS); })]);
    bot.companionInventoryUnverified = false;
  } finally { clearTimeout(timer); }
}

export async function dropInventoryItem(bot, { item, count, player }, signal) {
  if (bot.currentWindow || bot.inventory.selectedItem) throw new Error('Close the open inventory/container before handing off items.');
  await confirmInventory(bot);
  const before = inventoryCounts(bot)[item] ?? 0;
  if (!before) throw new Error(`I don't have any ${item}.`);
  const target = player ? resolvePlayer(bot, player) : null;
  if (target) {
    await walkTo(bot, target.entity.position, HANDOFF_APPROACH_DISTANCE, signal);
    const live = resolvePlayer(bot, target.username).entity;
    if (bot.entity.position.distanceTo(live.position) > 3.5) throw new Error('The player moved out of handoff range.');
    await bot.lookAt(live.position.offset(0, 0.8, 0), true);
    await bot.waitForTicks(1);
  }
  let remaining = Math.min(count, before), confirmed = false;
  bot.companionInventorySyncing = true; bot.companionInventoryUnverified = true;
  try {
    while (remaining > 0) {
      signal.throwIfAborted();
      if (bot.currentWindow) throw new Error('A container opened during the handoff.');
      const stack = bot.inventory.items().find(value => value.name === item);
      if (!stack) break;
      const wholeStack = stack.count <= remaining;
      const amount = wholeStack ? stack.count : 1;
      // Vanilla inventory Throw click: one item or one whole stack. No cursor
      // item and no fabricated slot writes; server sync below is authoritative.
      await bot.clickWindow(stack.slot, wholeStack ? 1 : 0, 4);
      remaining -= amount;
    }
    if (target) {
      signal.throwIfAborted();
      const live = resolvePlayer(bot, target.username).entity;
      const away = bot.entity.position.minus(live.position); away.y = 0;
      if (away.norm() < 0.2) away.x = 1;
      // Inventory Throw clicks scatter around the donor. Stand in pickup range
      // first, then leave it so the donor cannot immediately reclaim the gift.
      await walkTo(bot, bot.entity.position.plus(away.normalize().scaled(HANDOFF_STEP_BACK_DISTANCE)), 0.75, signal);
    }
  } finally {
    try { await confirmInventory(bot); confirmed = true; }
    finally {
      bot.companionInventorySyncing = false;
      bot.emit('companionInventoryConfirmed');
    }
  }
  signal.throwIfAborted();
  const dropped = Math.max(0, before - (inventoryCounts(bot)[item] ?? 0));
  return { success: confirmed && dropped > 0, item, dropped, availableBefore: before, remainingAfter: inventoryCounts(bot)[item] ?? 0, requested: count, player: target?.username ?? null,
    recipientPickupVerified: false, summary: `Dropped ${dropped} ${item}${target ? ` toward ${target.username}` : ''}. Server inventory confirmed; recipient pickup is not verified.` };
}

export function registerItemSkills(adapter, bot, actions) {
  adapter.tool('drop_item', 'Drop an exact owned item quantity here. Uses server-confirmed inventory; never promises another player picked it up.', { item: itemName, count: quantity.default(1) },
    args => actions.run('drop_item', signal => dropInventoryItem(bot, args, signal)).then(toolResult));
  adapter.tool('give_items_to_player', 'Walk to a visible player and hand off an exact owned item quantity. Reports confirmed dropped amount, not recipient inventory.', { item: itemName, count: quantity.default(64), player: z.string().regex(/^[A-Za-z0-9_]{1,16}$/) },
    args => actions.run('give_items_to_player', signal => dropInventoryItem(bot, args, signal)).then(toolResult));
  adapter.tool('equip_item', 'Equip an owned item in hand, offhand, or its armor slot.', { item: itemName, destination: z.enum(['hand','off-hand','head','torso','legs','feet']).default('hand') },
    args => actions.run('equip_item', async signal => {
      await confirmInventory(bot);
      const owned = bot.inventory.items().find(value => value.name === args.item);
      if (!owned) throw new Error(`I don't have any ${args.item}.`);
      if (EQUIPMENT[args.destination] && !EQUIPMENT[args.destination].test(args.item)) throw new Error(`${args.item} cannot be worn in the ${args.destination} slot.`);
      bot.companionInventorySyncing = true; bot.companionInventoryUnverified = true;
      try { signal.throwIfAborted(); await bot.equip(owned, args.destination); }
      finally {
        try { await confirmInventory(bot); }
        finally { bot.companionInventorySyncing = false; bot.emit('companionInventoryConfirmed'); }
      }
      signal.throwIfAborted();
      const equipped = args.destination === 'hand' ? bot.heldItem : bot.inventory.slots[bot.getEquipmentDestSlot(args.destination)];
      if (equipped?.name !== args.item) throw new Error('The server did not confirm that equipment change.');
      return { success: true, item: args.item, destination: args.destination, summary: `Equipped ${args.item}.` };
    }).then(toolResult));
}
