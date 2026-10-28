import { z } from 'zod';
import { registerPlay } from '../../src/tools/play.js';
import { registerGoto } from '../../src/tools/goto.js';
import { registerLookAround } from '../../src/tools/look_around.js';
import { registerItemSkills } from '../skill-executor/items.js';

export function createToolRegistry(bot, actions) {
  const tools = new Map();
  const adapter = { tool(name, description, shape, handler) { tools.set(name, { schema: z.object(shape).strict(), handler, description }); } };
  registerPlay(adapter, bot, actions);
  registerGoto(adapter, bot, actions);
  registerLookAround(adapter, bot, actions);
  // Upstream placement clears plants and handles special blocks heuristically.
  // Construction is available solely through approved, obstruction-safe builds.
  tools.delete('place_blocks');
  tools.delete('give_items_to_player'); // upstream predicts slots; Realm records must come from server events.
  registerItemSkills(adapter, bot, actions);
  return tools;
}
