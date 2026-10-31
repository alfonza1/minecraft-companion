import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Vec3 } from 'vec3';
import { Store } from '../services/memory/store.js';
import { TeammateService, navigateWithRecovery, supplyOwned } from '../services/skill-executor/teammate.js';
import { createApp } from '../services/api/index.js';
import { quickPlan } from '../services/agent-orchestrator/quick-actions.js';

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'companion-teammate-')), store = new Store(directory);
  store.updateSettings({ realmId: 1, playerName: 'Alfonza' });
  const bot = new EventEmitter(), stock = { bread: 20, torch: 64, stone_pickaxe: 1 }, owned = {}, visits = [], withdrawals = [];
  Object.assign(bot, { minenessReady: true, entity: { position: new Vec3(0, 65, 0) }, health: 20, food: 20, game: { dimension: 'overworld' }, players: {}, entities: {},
    registry: { itemsByName: { bread: { id: 1 }, torch: { id: 2 }, stone_pickaxe: { id: 3, maxDurability: 131 }, iron_pickaxe: { id: 4, maxDurability: 250 }, diamond: { id: 5 } } },
    inventory: { slots: [], items: () => Object.entries(owned).filter(([, count]) => count).map(([name, count]) => ({ name, count })) }, supportFeature: () => true, _syncWindow: async () => {},
    blockAt: p => p.x === 2 ? { name: 'chest', position: p } : null,
    pathfinder: { goto: async goal => { bot.entity.position = new Vec3(goal.x, goal.y, goal.z); visits.push(goal); }, setGoal() {}, stop() {} },
    equip: async value => { bot.heldItem = value; }, clearControlStates() {},
    openContainer: async () => ({ containerItems: () => Object.entries(stock).filter(([, count]) => count).map(([name, count]) => ({ name, count })), close() {}, withdraw: async (id, _metadata, count) => { const name = Object.keys(bot.registry.itemsByName).find(name => bot.registry.itemsByName[name].id === id); stock[name] -= count; owned[name] = (owned[name] || 0) + count; withdrawals.push({ name, count }); } }),
  });
  const runtime = Object.assign(new EventEmitter(), { bot, world: { observedAt: new Date().toISOString(), position: { x: 0, y: 65, z: 0 }, dimension: 'overworld', nearbyPlayers: [], health: 20, food: 20 }, isActive: () => true });
  const teammate = new TeammateService({ runtime, store, publish() {} });
  return { store, bot, runtime, teammate, stock, owned, visits, withdrawals, async close() { store.close(); await rm(directory, { recursive: true, force: true }); } };
}
const signal = () => new AbortController().signal;
const chest = { id: '00000000-0000-4000-8000-000000000001', name: 'Supplies', realmId: 1, dimension: 'overworld', approved: true, allowedItems: ['bread', 'torch', 'stone_pickaxe'], position: { x: 2, y: 65, z: 0 } };

test('restocking withdraws only missing approved supplies and records actual observed chest stock', async () => {
  const f = await fixture();
  try {
    f.store.put('supplyChests', chest); f.owned.bread = 3;
    const result = await f.teammate.routine('mining', signal());
    assert.equal(result.success, true); assert.equal(f.owned.bread, 8); assert.equal(f.owned.torch, 32); assert.equal(f.owned.stone_pickaxe, 1);
    assert.deepEqual(f.withdrawals, [{ name: 'bread', count: 5 }, { name: 'torch', count: 32 }, { name: 'stone_pickaxe', count: 1 }]);
    assert.equal(f.store.get('supplyChests')[0].provenance, 'observed-container');
    const count = f.withdrawals.length; await f.teammate.routine('mining', signal()); assert.equal(f.withdrawals.length, count);
  } finally { await f.close(); }
});

test('unapproved, wrong-dimension and revoked supply chests cannot provide materials', async () => {
  const f = await fixture();
  try {
    for (const patch of [{ approved: false }, { dimension: 'the_nether' }, { realmId: 2 }]) {
      f.store.put('supplyChests', { ...chest, ...patch });
      const supplies=await f.teammate.withdraw(f.teammate.routines().find(r=>r.id==='mining').supplies,signal());assert.ok(supplies.every(s=>s.missing>0)); assert.equal(f.withdrawals.length, 0);
    }
    f.store.put('supplyChests', chest); const open = f.bot.openContainer;
    f.bot.openContainer = async () => { const container = await open(); const withdraw = container.withdraw; container.withdraw = async (...args) => { await withdraw(...args); f.store.delete('supplyChests', chest.id); }; return container; };
    await assert.rejects(f.teammate.withdraw(f.teammate.routines().find(r=>r.id==='mining').supplies,signal()), /revoked/);
    assert.equal(f.withdrawals.length, 1); assert.equal(f.store.get('supplyChests').length, 0);
  } finally { await f.close(); }
});

test('routine accepts a better healthy tool and replaces a worn-out one without spending rare stock', async () => {
  const f = await fixture();
  try {
    f.owned.iron_pickaxe = 1; assert.equal(supplyOwned(f.bot, { name: 'stone_pickaxe', count: 1 }), 1);
    f.bot.inventory.items = () => [{ name: 'iron_pickaxe', count: 1, durabilityUsed: 245 }]; assert.equal(supplyOwned(f.bot, { name: 'stone_pickaxe', count: 1 }), 0);
    f.store.put('supplyChests', { ...chest, allowedItems: ['diamond'] }); f.stock.diamond = 10;
    const result = await f.teammate.withdraw([{ name: 'diamond', count: 5 }], signal());
    assert.equal(result[0].missing, 5); assert.equal(f.withdrawals.length, 0);
  } finally { await f.close(); }
});

test('a missing remembered chest does not prevent checking the next approved chest',async()=>{
  const f=await fixture();try{
    f.store.put('supplyChests',{...chest,id:'missing',position:{x:10,y:65,z:0}});f.store.put('supplyChests',chest);
    const result=await f.teammate.withdraw([{name:'bread',count:8}],signal());
    assert.equal(result[0].missing,0);assert.equal(f.owned.bread,8);assert.match(f.store.get('supplyChests').find(c=>c.id==='missing').lastCheckError,/missing/);
  }finally{await f.close();}
});

test('recording a failed chest route cannot restore deleted or revoked permission',async()=>{
  const f=await fixture();try{
    f.store.put('supplyChests',chest);
    f.bot.pathfinder.goto=async()=>{f.store.put('supplyChests',{...chest,approved:false});throw new Error('No path');};
    const result=await f.teammate.withdraw([{name:'bread',count:8}],signal());
    assert.equal(result[0].missing,8);assert.equal(f.store.get('supplyChests')[0].approved,false);assert.equal(f.withdrawals.length,0);
  }finally{await f.close();}
});

test('restocking never selects an enchanted or named tool from type-matched shared stock', async () => {
  const f = await fixture();
  try {
    f.store.put('supplyChests', chest);
    const open = f.bot.openContainer;
    f.bot.openContainer = async () => { const container = await open(), list = container.containerItems; container.containerItems = () => list().map(value => value.name === 'stone_pickaxe' ? { ...value, enchants: [{ name: 'efficiency', lvl: 3 }], customName: 'My good pick' } : value); return container; };
    const result = await f.teammate.withdraw([{name:'stone_pickaxe',count:1}], signal());
    assert.equal(f.stock.stone_pickaxe, 1); assert.equal(f.owned.stone_pickaxe, undefined);
    assert.equal(result[0].missing,1);
  } finally { await f.close(); }
});

test('named places use observed coordinates, preserve dimension, and reject an unseen player location', async () => {
  const f = await fixture();
  try {
    assert.throws(() => f.teammate.saveLocation({ name: 'Home', source: 'player' }), /can’t currently see/);
    const place = f.teammate.saveLocation({ name: 'Home', source: 'companion' }); assert.equal(place.dimension, 'overworld'); assert.equal(place.provenance, 'observed');
    assert.equal((await f.teammate.execute('visit_location', { name: 'HOME' }, signal())).success, true);
    f.bot.game.dimension = 'the_nether'; await assert.rejects(f.teammate.execute('visit_location', { name: 'Home' }, signal()), /another Realm or dimension/);
  } finally { await f.close(); }
});

test('rescue uses only current or recent observed player locations and respects its own safety', async () => {
  const f = await fixture();
  try {
    await assert.rejects(f.teammate.rescue(signal()), /can’t see you/);
    f.runtime.world.nearbyPlayers = [{ name: 'Alfonza', position: { x: 4, y: 65, z: 0 } }]; f.teammate.observe();
    assert.equal(f.teammate.playerDestination().current, false);
    f.bot.health = 5; await assert.rejects(f.teammate.rescue(signal()), /too hurt/);
    f.bot.health = 20; assert.equal((await f.teammate.rescue(signal())).success, false);
    f.bot.players.Alfonza = { entity: { position: new Vec3(4, 65, 0) } };
    assert.equal((await f.teammate.rescue(signal())).success, true);
    f.bot.entities.creeper = { name: 'creeper', position: new Vec3(4, 65, 1) }; assert.equal((await f.teammate.rescue(signal())).success, false);
  } finally { await f.close(); }
});

test('death records label lost inventory as last-observed and recovery refuses cross-dimension or dangerous trips', async () => {
  const f = await fixture();
  try {
    f.teammate.recordDeath({ bot: f.bot, world: { inventory: [{ name: 'oak_log', count: 7 }] } });
    const death = f.store.get('deaths')[0]; assert.equal(death.inventoryProvenance, 'last-observed-before-death'); assert.match(death.warning, /keepInventory/);
    f.bot.food = 5; await assert.rejects(f.teammate.recover(death.id, signal()), /unsafe/);
    f.bot.food = 20; f.bot.game.dimension = 'the_nether'; await assert.rejects(f.teammate.recover(death.id, signal()), /another Realm or dimension/);
    f.bot.game.dimension = 'overworld'; const result = await f.teammate.recover(death.id, signal()); assert.equal(result.success, false); assert.equal(f.store.get('deaths')[0].status, 'not-found');
  } finally { await f.close(); }
});

test('navigation recovery is bounded, leaves terrain intact and never retries cancellation', async () => {
  const f = await fixture();
  try {
    let calls = 0; await assert.rejects(navigateWithRecovery(f.bot, new Vec3(8, 65, 0), 2, signal(), async () => { calls++; throw new Error('No path to destination'); }), /tried 3 routes/); assert.equal(calls, 3);
    const controller = new AbortController(); calls = 0;
    await assert.rejects(navigateWithRecovery(f.bot, new Vec3(8, 65, 0), 2, controller.signal, async () => { calls++; controller.abort(); throw new Error('No path'); }), { name: 'AbortError' }); assert.equal(calls, 1);
  } finally { await f.close(); }
});

test('updates deduplicate warnings and quiet mode suppresses completion chatter', async () => {
  const f = await fixture();
  try {
    f.store.updateSettings({ teammate: { updates: 'quiet' } });
    f.teammate.notice('Done gathering.', 'completed'); assert.equal(f.store.get('conversation').length, 0);
    f.teammate.notice('Need help!', 'danger', 'danger'); f.teammate.notice('Need help again!', 'danger', 'danger');
    assert.equal(f.store.get('conversation').length, 1);
  } finally { await f.close(); }
});

test('teammate API persists routines/preferences, rejects unsafe permissions and invents no unseen stock', async () => {
  const f = await fixture(); const app = await createApp({ store: f.store, skipExtensions: true });
  try {
    const request = (url, payload) => app.inject({ method: 'POST', url, payload, headers: { host: '127.0.0.1:4365' } });
    assert.equal((await request('/api/teammate/preferences', { autoRestock: true })).statusCode, 200);
    assert.equal((await request('/api/teammate/routines', { id: 'mining', label: 'Mine', supplies: [{ name: 'torch', count: 16 }] })).statusCode, 200);
    assert.equal(f.store.settings().teammate.autoRestock, true); assert.equal(f.store.get('routines')[0].supplies[0].count, 16);
    assert.equal((await request('/api/teammate/routines', { id: 'mining', label: 'Mine', supplies: [{ name: 'diamond', count: 16 }] })).statusCode, 409);
    assert.equal((await request('/api/teammate/chests/approve', { name: 'Supply', position: { x: 2, y: 65, z: 0 }, allowedItems: ['bread'] })).statusCode, 409);
    assert.equal((await request('/api/teammate/preferences', { runShell: true })).statusCode, 400);
    const state = (await app.inject({ url: '/api/state', headers: { host: '127.0.0.1:4365' } })).json(); assert.equal(state.teammate.supplies.length, 0); assert.equal(state.teammate.deaths.length, 0);
  } finally { await app.close(); await rm(f.store.directory, { recursive: true, force: true }); }
});

test('everyday teammate phrases route without inference; unrelated phrases still fall through', () => {
  const context = { world: { inventory: [] }, playerName: 'Alfonza', locations: [{ id: 'home' }] };
  for (const [phrase, tool] of [['help me', 'rescue_player'], ['get ready to mine', 'prepare_routine'], ['bring me a stack of wood', 'bring_items'], ['go home', 'visit_location'], ['recover your items', 'recover_items']]) assert.equal(quickPlan(phrase, context).actions[0].tool, tool);
  for (const phrase of ['go figure', 'help me understand Java', 'what is a stack in Python']) assert.equal(quickPlan(phrase, context), null);
});
