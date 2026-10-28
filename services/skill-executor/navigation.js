import { setTimeout as delay } from 'node:timers/promises';
import { walkTo } from '../../src/actions.js';

export const MAX_NAVIGATION_ATTEMPTS = 3;
export async function navigateWithRecovery(bot, destination, tolerance, signal, navigate = walkTo) {
  let last;
  for (let attempt = 0; attempt < MAX_NAVIGATION_ATTEMPTS; attempt++) {
    signal.throwIfAborted();
    if (bot.health < 8 || bot.entity.isInLava) throw new Error('Travel is unsafe right now. I need help getting somewhere safe.');
    try { return await navigate(bot, destination, tolerance, signal); }
    catch (error) {
      signal.throwIfAborted(); last = error;
      if (!/path|reach|timeout|timed out|stuck/i.test(error.message)) throw error;
      bot.pathfinder?.stop(); bot.pathfinder?.setGoal(null); bot.clearControlStates?.();
      // Recompute with a small arrival tolerance; never dig or place an escape route.
      tolerance = Math.min(3, tolerance + 0.5);
      if (attempt + 1 < MAX_NAVIGATION_ATTEMPTS) await delay(150 * (attempt + 1), undefined, { signal });
    }
  }
  throw new Error(`I tried ${MAX_NAVIGATION_ATTEMPTS} routes but couldn’t reach that spot. Clear a path or move closer. ${last.message}`);
}
