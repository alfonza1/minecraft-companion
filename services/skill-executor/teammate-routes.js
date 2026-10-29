import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { Vec3 } from 'vec3';
import { locationSchema, routineSchema, teammateSettingsSchema, TEAMMATE_ACTIONS, isProtectedSupply, CHEST_APPROVAL_RADIUS } from './teammate.js';

const chestSchema = z.object({ name: z.string().trim().min(1).max(60),depositAllowed:z.boolean().default(true), position: z.object({ x: z.number().int().min(-29_999_800).max(29_999_800), y: z.number().int().min(-64).max(319), z: z.number().int().min(-29_999_800).max(29_999_800) }).strict(), allowedItems: z.array(z.string().regex(/^[a-z][a-z0-9_]*$/).max(80)).min(1).max(24) }).strict();
export function registerTeammateRoutes(app, { runtime, store, publish, teammate, getOrchestrator }) {
  app.get('/api/teammate', async () => teammate.snapshot());
  app.get('/api/teammate/nearby-chests', async () => {
    const bot = runtime.bot;
    if (!bot?.minenessReady) throw new Error('Connect companion before looking for supply chests.');
    return bot.findBlocks({ matching: block => ['chest', 'barrel'].includes(block.name), maxDistance: CHEST_APPROVAL_RADIUS, count: 12 }).map(position => ({ position: { x: position.x, y: position.y, z: position.z }, name: bot.blockAt(position)?.name }));
  });
  app.post('/api/teammate/preferences', async ({ body }) => {
    const patch = teammateSettingsSchema.parse(body);
    store.updateSettings({ ...(patch.busyMode&&store.settings().autonomy==='instructions'?{autonomy:'helpful'}:{}),teammate: { ...teammate.preferences(), ...patch } });if(patch.busyMode)runtime.idleWork?.resume();if(patch.busyMode===false)await runtime.idleWork?.stop();publish(); return teammate.snapshot();
  });
  app.post('/api/teammate/farm/approve',async({body})=>{
    const {radius}=z.object({radius:z.number().int().min(2).max(16).default(8)}).strict().parse(body??{}),bot=runtime.bot;
    if(!bot?.minenessReady)throw new Error('Connect near the farm before approving it.');
    if(!bot.findBlocks({matching:bot.registry.blocksByName.farmland.id,maxDistance:radius,count:1}).length)throw new Error('No existing farmland is visible here. I will not clear terrain automatically.');
    const p=bot.entity.position.floored();store.put('workAreas',{id:'farm',position:{x:p.x,y:p.y,z:p.z},radius,realmId:store.settings().realmId,dimension:bot.game.dimension});publish();return teammate.snapshot();
  });
  app.post('/api/teammate/farm/revoke',async()=>{store.delete('workAreas','farm');publish();return teammate.snapshot();});
  app.post('/api/teammate/routines', async ({ body }) => {
    const routine = routineSchema.parse(body);
    if (routine.supplies.some(supply => isProtectedSupply(supply.name))) throw new Error('Rare resources require an explicit task; they cannot be taken automatically by a routine.');
    if (new Set(routine.supplies.map(supply => supply.name)).size !== routine.supplies.length) throw new Error('Routine supplies must use unique item names.');
    store.put('routines', routine); publish(); return teammate.snapshot();
  });
  app.post('/api/teammate/locations/save', async ({ body }) => teammate.saveLocation(locationSchema.parse(body)));
  app.post('/api/teammate/locations/delete', async ({ body }) => { const { id } = z.object({ id: z.string().min(1).max(60) }).strict().parse(body); store.delete('locations', id); publish(); return teammate.snapshot(); });
  app.post('/api/teammate/chests/approve', async ({ body }) => {
    const value = chestSchema.parse(body), bot = runtime.bot;
    if (!bot?.minenessReady || bot.entity.position.distanceTo(new Vec3(value.position.x, value.position.y, value.position.z)) > CHEST_APPROVAL_RADIUS) throw new Error('Stand the companion within six blocks of the chest before approving it.');
    const block = bot.blockAt(new Vec3(value.position.x, value.position.y, value.position.z));
    if (!block || !['chest', 'barrel'].includes(block.name)) throw new Error('Choose an observed normal chest or barrel. Trapped and other containers are not supported.');
    if (value.allowedItems.some(name => !Object.hasOwn(bot.registry.itemsByName, name) || isProtectedSupply(name))) throw new Error('Choose known common supplies. Rare items require an explicit handoff task.');
    const realmId = store.settings().realmId, dimension = bot.game?.dimension || 'unknown';
    const existing = store.get('supplyChests').find(chest => chest.realmId === realmId && chest.dimension === dimension && ['x', 'y', 'z'].every(axis => chest.position[axis] === value.position[axis]));
    const chest = { ...value, id: existing?.id || randomUUID(), realmId, dimension, approved: true, approvedAt: new Date().toISOString(), provenance: 'observed-block', inventory: null, observedAt: null };
    store.put('supplyChests', chest); publish(); return chest;
  });
  app.post('/api/teammate/chests/revoke', async ({ body }) => { const { id } = z.object({ id: z.string().uuid() }).strict().parse(body); store.delete('supplyChests', id); publish(); return teammate.snapshot(); });
  app.post('/api/teammate/chests/deposit',async({body})=>{
    const {id,allowed}=z.object({id:z.string().uuid(),allowed:z.boolean()}).strict().parse(body),chest=store.get('supplyChests').find(value=>value.id===id);
    if(!chest)throw new Error('Choose an approved supply chest.');
    if(allowed&&(!runtime.bot?.minenessReady||chest.realmId!==store.settings().realmId||chest.dimension!==runtime.bot.game.dimension||runtime.bot.entity.position.distanceTo(new Vec3(chest.position.x,chest.position.y,chest.position.z))>CHEST_APPROVAL_RADIUS))throw new Error('Bring the companion within six blocks of this chest before enabling deposits.');
    store.put('supplyChests',{...chest,depositAllowed:allowed});publish();return teammate.snapshot();
  });
  app.post('/api/teammate/action', async ({ body }) => {
    const value = z.object({ tool: z.enum(Object.keys(TEAMMATE_ACTIONS)), args: z.record(z.string(), z.unknown()).default({}) }).strict().parse(body);
    const args = TEAMMATE_ACTIONS[value.tool].parse(value.args), orchestrator = getOrchestrator();
    if (!orchestrator) throw new Error('Companion planning service unavailable.');
    await orchestrator.schedule([{ tool: value.tool, args }], value.tool.replaceAll('_', ' ')); return { started: true };
  });
  app.post('/api/teammate/tasks/resume', async () => { if (!runtime.taskStack) throw new Error('Companion task service unavailable.'); await runtime.taskStack.resume(); return runtime.snapshot(); });
  app.post('/api/teammate/tasks/discard', async ({ body }) => { const { id } = z.object({ id: z.string().uuid() }).strict().parse(body); if (!runtime.taskStack) throw new Error('Companion task service unavailable.'); await runtime.taskStack.discard(id); return runtime.snapshot(); });
}
