import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createOrchestrator } from '../services/agent-orchestrator/index.js';
import { compactConversationContext, localStatusReply } from '../services/agent-orchestrator/token-context.js';
import { lowTokenArguments, CODEX_RESTRICTIONS } from '../services/agent-orchestrator/codex-cli.js';
import { Store } from '../services/memory/store.js';
import { createApp } from '../services/api/index.js';
import { registerBuildRoutes } from '../services/build-planner/index.js';

const world = () => ({ observedAt: new Date().toISOString(), provenance: 'observed', inventoryExact: true, health: 17, food: 14, oxygen: 20, dimension: 'overworld', position: { x: 10.5, y: 64, z: -8.5 }, inventory: [{ name: 'oak_log', count: 4, slot: 9 }, { name: 'oak_log', count: 3, slot: 10 }, { name: 'torch', count: 8, slot: 11 }], equipment: { hand: { name: 'iron_axe', count: 1, durabilityRemaining: 50 } }, nearbyPlayers: [{ name: 'Player', position: { x: 12, y: 64, z: -8 } }], nearbyEntities: [{ name: 'creeper', distance: 4, position: { x: 14, y: 64, z: -8 } }] });
async function fixture({ low = true, request } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'companion-token-mode-')), store = new Store(directory);
  store.updateSettings({ lowTokenMode: low, model: 'fixture-model', playerName: 'Player', maxRequestsPerHour: 20 });
  let current = world(), active = true, calls = 0, cancelled = 0; const executed = [], prompts = [];
  const runtime = Object.assign(new EventEmitter(), { snapshot: () => ({ world: current, currentTask: { name: 'chopping wood' } }), isActive: () => active, execute: async (tool, args) => { executed.push({ tool, args }); return { success: true }; }, cancelTask: async () => { cancelled++; } });
  const orchestrator = createOrchestrator({ store, runtime, publish() {}, request: request || (async (prompt, options) => { calls++; prompts.push({ prompt, options }); return { model: options.model, plan: { reply: 'A short answer.', intent: 'general', actions: [] } }; }), designRequest: async () => { calls++; throw new Error('Design must not run in low token mode.'); } });
  return { store, runtime, orchestrator, executed, prompts, calls: () => calls, cancelled: () => cancelled, pause: () => { active = false; }, setWorld: value => { current = value; }, async close() { await orchestrator.close(); store.close(); await rm(directory, { recursive: true, force: true }); } };
}

test('low mode serves observed status without model calls, while chat and gameplay remain functional', async () => {
  const f = await fixture();
  try {
    assert.match(await f.orchestrator.respond('how much wood do you have?'), /7 wood/);
    assert.match(await f.orchestrator.respond('where are you?'), /10, 64, -9/);
    assert.match(await f.orchestrator.respond('how is your health?'), /17 out of 20/);
    assert.match(await f.orchestrator.respond('what are you doing?'), /chopping wood/);
    assert.equal(f.calls(), 0); assert.equal(f.orchestrator.usage.requests, 0); assert.equal(f.cancelled(), 0);
    await f.orchestrator.respond('get 8 oak logs'); await new Promise(resolve => setImmediate(resolve)); assert.equal(f.executed[0].tool, 'chop_tree'); assert.equal(f.calls(), 0);
    await f.orchestrator.respond('Explain Java versus Python.'); assert.equal(f.calls(), 1); assert.equal(f.prompts[0].options.lowTokenMode, true);
    assert.match(f.prompts[0].prompt, /General or casual questions MUST have actions:\[\]/);
  } finally { await f.close(); }
});

test('compact requests keep essential facts and relevant memory without sending full stored histories', () => {
  const source = { message: 'Get wood for our base.', playerName: 'Player', availableActions: ['chop_tree'], recent: Array.from({ length: 10 }, () => ({ role: 'companion', text: 'long conversation '.repeat(150) })), memory: [{ label: 'Our base', value: 'BASE_LOCATION_12_64_8' }, ...Array.from({ length: 25 }, (_, i) => ({ label: `Unrelated ${i}`, value: 'irrelevant '.repeat(200) }))], world: world(), currentTask: { name: 'wood', baselineInventory: { SECRET_BASELINE: 300 }, descriptor: { tool: 'chop_tree', args: { count: 16 } } }, savedTasks: { held: true, frames: Array.from({ length: 12 }, () => ({ label: 'saved task', status: 'saved', actions: [{ tool: 'craft_item', args: { private: 'OLD_ACTION_PAYLOAD' } }] })) }, teammate: { locations: [], routines: [], supplies: [{ name: 'Chest', inventory: [{ name: 'PRIVATE_CHEST_CONTENTS', count: 10000 }], observedAt: 'old' }], deaths: [{ id: 'death', warning: 'Unverified', inventory: [{ name: 'PRIVATE_DEATH_INVENTORY' }] }] } };
  const before = structuredClone(source), compact = compactConversationContext(source), serialized = JSON.stringify(compact);
  assert.equal(compact.world.inventory.oak_log, 7); assert.equal(compact.world.health, 17); assert.equal(compact.world.inventoryExact, true); assert.equal(compact.world.observedAt, source.world.observedAt);
  assert.equal(compact.world.equipment.hand.durabilityRemaining, 50); assert.equal(compact.world.nearbyEntities[0].name, 'creeper');
  assert.equal(compact.recent.length, 4); assert.ok(compact.recent.every(value => value.text.length <= 400)); assert.equal(compact.memory.length, 5); assert.ok(compact.memory.some(value => value.value === 'BASE_LOCATION_12_64_8'));
  assert.equal(compact.savedTasks.total, 12); assert.equal(compact.savedTasks.frames.length, 4);
  for (const value of ['PRIVATE_CHEST_CONTENTS', 'PRIVATE_DEATH_INVENTORY', 'SECRET_BASELINE', 'OLD_ACTION_PAYLOAD', '"slot"']) assert.equal(serialized.includes(value), false);
  assert.ok(serialized.length < JSON.stringify(source).length / 2); assert.deepEqual(source, before);
});

test('unconfirmed/offline inventory is labelled and general phrasing cannot become a false item count', () => {
  const state = { world: world() }; state.world.inventoryExact = false;
  assert.match(localStatusReply('what do you have?', state), /waiting for server confirmation/);
  assert.match(localStatusReply('how many torches do you have?', state), /isn’t confirmed/);
  assert.equal(localStatusReply('how much time do you have?', state), null);
  assert.equal(localStatusReply('how much time do you have?', { world: null }), null);
  assert.match(localStatusReply('where are you?', { world: null }), /not connected/);
});

test('mode toggles do not cancel active inference and normal context returns without deleting memories', async () => {
  let finish, calls = 0; const options = [], prompts = [];
  const f = await fixture({ low: false, request: async (prompt, option) => { calls++; options.push(option); prompts.push(prompt); await new Promise(resolve => { finish = resolve; }); return { plan: { reply: 'Okay.', intent: 'general', actions: [] } }; } });
  try {
    for (let n = 0; n < 10; n++) f.store.put('conversation', { id: `old-${n}`, role: 'user', text: 'history '.repeat(200) });
    f.store.put('memories', { id: 'note', label: 'Base', value: 'kept locally' });
    const first = f.orchestrator.respond('Explain black holes.'); await new Promise(resolve => setImmediate(resolve));
    f.store.updateSettings({ lowTokenMode: true }); assert.equal(options[0].lowTokenMode, false); assert.equal(options[0].signal.aborted, false); finish(); await first;
    const second = f.orchestrator.respond('Explain stars.'); await new Promise(resolve => setImmediate(resolve)); assert.equal(options[1].lowTokenMode, true); finish(); await second;
    const payload = prompt => JSON.parse(prompt.slice(prompt.lastIndexOf('\n') + 1));
    assert.ok(payload(prompts[0]).recent.length > payload(prompts[1]).recent.length);
    f.store.updateSettings({ lowTokenMode: false }); assert.equal(f.store.get('memories')[0].value, 'kept locally'); assert.equal(f.store.settings().model, 'fixture-model'); assert.equal(calls, 2);
  } finally { await f.close(); }
});

test('pause still gates local and model conversation; AI design is denied before usage is consumed', async () => {
  const f = await fixture();
  try {
    await assert.rejects(f.orchestrator.designBlueprint({ description: 'Build a stone hut', version: '1.21.5' }), /Low token mode disables/);
    assert.equal(f.orchestrator.usage.requests, 0); assert.equal(f.calls(), 0);
    f.pause(); await assert.rejects(f.orchestrator.respond('where are you?'), /Resume/); await assert.rejects(f.orchestrator.respond('Explain Java.'), /Resume/); assert.equal(f.calls(), 0);
    assert.deepEqual(lowTokenArguments(false), []); assert.ok(lowTokenArguments(true).includes('skills.include_instructions=false'));
    assert.ok(CODEX_RESTRICTIONS.includes('read-only')); assert.ok(CODEX_RESTRICTIONS.includes('shell_tool'));
  } finally { await f.close(); }
});

test('real API persists mode and blocks new designs while blueprint import, material counts and approval stay enabled', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'companion-token-api-')), store = new Store(directory), app = await createApp({ store, skipExtensions: true }); let designs = 0;
  registerBuildRoutes(app, { ...app.companion, orchestrator: { designBlueprint: () => { designs++; throw Error('Unexpected design'); } } });
  const post = (url, payload) => app.inject({ method: 'POST', url, payload, headers: { host: '127.0.0.1:4365' } });
  try {
    assert.equal((await post('/api/settings', { lowTokenMode: true })).statusCode, 200); assert.equal((await post('/api/settings', { lowTokenMode: 'true' })).statusCode, 400);
    const project = (await post('/api/projects', { name: 'Imported cube', version: '1.21.5' })).json();
    const blocked = await post(`/api/projects/${project.id}/design`, { description: 'Small stone house' }); assert.equal(blocked.statusCode, 400); assert.match(blocked.json().error, /Low token mode disables/); assert.equal(designs, 0);
    const blueprint = { version: '1.21.5', dimensions: { x: 1, y: 1, z: 1 }, provenance: 'reconstructed', uncertainties: [], blocks: [{ x: 0, y: 0, z: 0, name: 'cobblestone' }] };
    const imported = await post(`/api/projects/${project.id}/blueprint`, { blueprint }); assert.equal(imported.statusCode, 200, imported.body); assert.equal(imported.json().materials.placed[0].quantity, 1);
    assert.equal((await post(`/api/projects/${project.id}/approve`, {})).statusCode, 200);
    assert.equal(app.companion.snapshot().usage.requests, 0); assert.equal(store.settings().lowTokenMode, true);
  } finally { await app.close(); }
  const reopened = new Store(directory); assert.equal(reopened.settings().lowTokenMode, true); reopened.close(); await rm(directory, { recursive: true, force: true });
});
