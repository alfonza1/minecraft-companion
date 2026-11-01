import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Fastify from 'fastify';
import minecraftData from 'minecraft-data';
import { Vec3 } from 'vec3';
import { Store } from '../services/memory/store.js';
import { registerPersonalityRoutes, companionProfile, personalityContext, setCompanionMode, modeFromMessage, saveMoment } from '../services/companion-personality/index.js';
import { createOrchestrator } from '../services/agent-orchestrator/index.js';
import { chooseIdleWork } from '../services/skill-executor/idle-work.js';
import { createApp } from '../services/api/index.js';
import { projectConversation } from '../services/agent-orchestrator/project-conversation.js';
import { quickPlan } from '../services/agent-orchestrator/quick-actions.js';

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'waypoint-personality-'));
  const store = new Store(directory), calls = [];
  const runtime = Object.assign(new EventEmitter(), { isActive: () => true, snapshot: () => ({ world: null }), idleWork: { stop: async () => calls.push('stop-idle'), resume: () => calls.push('resume-idle') } });
  const app = Fastify();
  registerPersonalityRoutes(app, { store, runtime, publish: () => {} });
  t.after(async () => { await app.close(); store.close(); await rm(directory, { recursive: true, force: true }); });
  return { store, runtime, app, calls, post: (url, payload) => app.inject({ method: 'POST', url: `/api/companion/${url}`, payload }) };
}

test('profile API persists personality, preserves existing automation until explicit mode selection, and rejects unknown settings', async t => {
  const f = await fixture(t);
  f.store.updateSettings({ model: 'kept-model', autonomy: 'independent', teammate: { busyMode: true }, voice: { speed: 1.2 } });
  assert.equal(companionProfile(f.store).modeSelected, false);
  assert.equal((await f.post('profile', { name: 'Scout', style: 'dry-humor', talkativeness: 'chatty', proactive: true })).statusCode, 200);
  assert.equal(f.store.settings().teammate.busyMode, true);
  assert.equal((await f.post('profile', { shell: 'anything' })).statusCode >= 400, true);
  const reopened = new Store(f.store.directory);
  assert.equal(companionProfile(reopened).name, 'Scout'); reopened.close();
  await f.post('mode', { mode: 'hangout' });
  assert.equal(f.store.settings().teammate.busyMode, false);
  assert.equal(f.store.settings().model, 'kept-model'); assert.equal(f.store.settings().voice.speed, 1.2);
  assert.deepEqual(f.calls, ['stop-idle']);
});

test('mode updates serialize and do not grant terrain, chest or combat permissions', async t => {
  const f = await fixture(t); let release;
  f.runtime.idleWork.stop = () => new Promise(resolve => { release = resolve; });
  const original = f.store.settings();
  const hangout = setCompanionMode(f, 'hangout');
  const adventure = setCompanionMode(f, 'adventure');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(companionProfile(f.store).mode, 'hangout'); release();
  await Promise.all([hangout, adventure]);
  assert.equal(companionProfile(f.store).mode, 'adventure');
  assert.equal(f.store.settings().teammate.busyMode, true);
  assert.equal(f.store.settings().combat, original.combat);
  assert.equal(f.store.settings().miningZone, original.miningZone);
  assert.deepEqual(f.store.get('supplyChests'), []);
  assert.deepEqual(f.calls, ['resume-idle']);
});

test('hangout and focused teammate modes suppress new idle work even if another preference enables it', async t => {
  const f = await fixture(t);
  for (const mode of ['hangout', 'teammate']) {
    f.store.put('companionProfile', { id: 'profile', mode, modeSelected: true });
    const decision = chooseIdleWork({ store: f.store, runtime: f.runtime, preferences: () => ({ busyMode: true }) });
    assert.equal(decision.tool, undefined); assert.match(decision.reason, /mode/);
  }
});

test('a later stop invalidates queued automatic mode changes rather than resuming background work', async t => {
  const f = await fixture(t); let release;
  f.runtime.idleWork.stop = () => new Promise(resolve => { release = resolve; });
  const hangout = setCompanionMode(f, 'hangout');
  const autonomous = setCompanionMode(f, 'autonomous');
  const rejected = assert.rejects(autonomous, /cancelled by runtime control/);
  await new Promise(resolve => setImmediate(resolve));
  f.runtime.emit('task-cancel'); release(); await hangout; await rejected;
  assert.equal(companionProfile(f.store).mode, 'hangout');
  assert.equal(f.store.settings().teammate.busyMode, false); assert.deepEqual(f.calls, []);
  assert.equal(f.runtime.listenerCount('task-cancel'), 0);
});

test('real API memory-off cancels a pending recall, stops speech, and retains pause and origin protections', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'waypoint-memory-cancel-')), store = new Store(directory);
  let started = false, cancelled = 0, speechStops = 0;
  const voiceModule = { registerVoiceRoutes() {}, updateVoiceSettings: async () => {}, getVoiceStatus: () => ({ available: false }), checkVoice: async () => {}, cancelSpeech: async () => { speechStops++; }, stopVoice: async () => {} };
  const app = await createApp({ store, voiceModule, modelRequest: async (_prompt, { signal }) => new Promise((_resolve, reject) => {
    started = true; signal.addEventListener('abort', () => { cancelled++; reject(signal.reason); }, { once: true });
  }) });
  t.after(async () => { await app.close(); await rm(directory, { recursive: true, force: true }); });
  const post = (url, payload) => app.inject({ method: 'POST', url, payload });
  const hostile = await app.inject({ method: 'POST', url: '/api/companion/profile', payload: { memoryEnabled: false }, headers: { origin: 'https://example.org' } });
  assert.equal(hostile.statusCode, 403);
  store.put('memories', { id: 'retained', label: 'Our adventure', value: 'Retained story' });
  await post('/api/control', { command: 'plan' });
  const pending = post('/api/conversation', { text: 'Tell me about our adventures' });
  const finished = pending.then(result => result);
  const deadline = Date.now() + 3000;
  while (!started && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(started, true, 'Model request should have reached the test provider');
  assert.equal((await post('/api/companion/profile', { memoryEnabled: false })).statusCode, 200);
  assert.equal((await finished).statusCode >= 400, true); assert.equal(cancelled, 1); assert.equal(speechStops, 1);
  assert.equal(store.get('conversation').some(message => message.role === 'companion'), false);
  await post('/api/control', { command: 'pause' });
  assert.equal((await post('/api/conversation', { text: 'switch to autonomous mode' })).statusCode >= 400, true);
  assert.equal(companionProfile(store).modeSelected, false);
});

test('spoken material needs and delivery requests do not request already satisfied construction again', async t => {
  const f = await fixture(t);
  const project = { id: 'build', name: 'Wall', materials: { raw: [{ name: 'oak_log', quantity: 10 }] }, assignments: [{ material: 'oak_log', total: 10, aiProgress: 2, userProgress: 4, constructionSatisfied: 8 }] };
  f.store.put('projects', project);
  assert.match(projectConversation('how much more do we need', f.store, null), /covered/);
  const answer = quickPlan('bring the remaining wood', { project, playerName: 'PlayerOne', world: { inventory: [] } });
  assert.deepEqual(answer.actions, []);
});

test('saved adventures require real sources, deduplicate, survive reopening and can be deleted/exported while memory is disabled', async t => {
  const f = await fixture(t);
  f.store.put('conversation', { id: 'actual-quote', role: 'user', text: 'That bridge looks great.', at: '2026-11-01T12:00:00Z' });
  f.store.put('tasks', { id: 'not-done', tool: 'chop_tree', status: 'blocked' });
  assert.throws(() => saveMoment(f.store, { sourceType: 'task', sourceId: 'not-done' }), /completed work/);
  assert.throws(() => saveMoment(f.store, { sourceType: 'conversation', sourceId: 'invented' }), /existing/);
  const first = (await f.post('moments', { sourceType: 'conversation', sourceId: 'actual-quote', title: 'Our bridge' })).json();
  const repeated = (await f.post('moments', { sourceType: 'conversation', sourceId: 'actual-quote' })).json();
  assert.equal(first.id, repeated.id); assert.equal(first.provenance, 'saved-conversation-quote');
  assert.match(first.text, /Player said: That bridge looks great/);
  await f.post('profile', { memoryEnabled: false });
  assert.deepEqual(personalityContext(f.store).savedMoments, []);
  assert.equal((await f.app.inject('/api/companion/export')).json().moments.length, 1);
  assert.equal((await f.post('moments', { sourceType: 'conversation', sourceId: 'actual-quote' })).statusCode >= 400, true);
  assert.equal((await f.post('moments/delete', { id: first.id })).statusCode, 200);
  assert.equal(f.store.get('adventureMoments').length, 0);
});

test('adventure idle selection retains food, storage, threat and loot safeguards before scouting', async t => {
  const f = await fixture(t);
  f.store.updateSettings({ realmId: 1, autonomy: 'helpful' });
  f.store.put('companionProfile', { id: 'profile', mode: 'adventure', modeSelected: true });
  f.store.put('spawnPoints', { id: '1:overworld', realmId: 1, dimension: 'overworld', position: { x: 0, y: 64, z: 0 }, provenance: 'server-reported' });
  f.store.put('supplyChests', { id: 'approved', name: 'Base', realmId: 1, dimension: 'overworld', position: { x: 4, y: 64, z: 0 }, approved: true, depositAllowed: true, allowedItems: ['bread'] });
  let inventory = [{ name: 'bread', count: 12 }, { name: 'iron_pickaxe', count: 1 }, { name: 'iron_sword', count: 1 }];
  const bot = { minenessReady: true, registry: minecraftData('1.21.5'), version: '1.21.5', health: 20, food: 20, game: { dimension: 'overworld' }, time: { timeOfDay: 6000 }, entity: { position: new Vec3(0,64,0) }, entities: {}, inventory: { items: () => inventory, emptySlotCount: () => 30 }, findBlock: () => null, findBlocks: () => [], blockAt: () => null };
  f.runtime.bot = bot;
  const service = { runtime: f.runtime, store: f.store, preferences: () => ({ autoGear: false, busyMode: true, autoDeposit: true }), threats: () => [], reserved: () => 0 };
  assert.deepEqual(chooseIdleWork(service), { tool: 'explore_nearby', args: { radius: 24, steps: 2 }, reason: 'Adventure mode: scouting a nearby safe surface route, then returning.' });
  assert.equal(chooseIdleWork(service, new Set(['explore_nearby'])).tool, undefined);
  bot.health = 5; assert.equal(chooseIdleWork(service).tool, undefined); bot.health = 20;
  bot.time.timeOfDay = 15000; assert.equal(chooseIdleWork(service).tool, undefined); bot.time.timeOfDay = 6000;
  inventory.push({ name: 'diamond', count: 1 }); assert.equal(chooseIdleWork(service).tool, 'store_surplus'); inventory.pop();
  service.threats = () => [{ name: 'creeper' }]; assert.equal(chooseIdleWork(service).tool, undefined);
});

test('both normal and low-token model contexts honor disabled memory and include consistent personality', async t => {
  const f = await fixture(t), prompts = [];
  f.store.put('memories', { id: 'legacy', label: 'A saved note', value: 'private retained story' });
  f.store.put('adventureMoments', { id: 'story', title: 'A story', text: 'private saved adventure' });
  f.store.put('companionProfile', { id: 'profile', name: 'Scout', memoryEnabled: false, style: 'dry-humor', talkativeness: 'focused' });
  const orchestrator = createOrchestrator({ ...f, publish: () => {}, request: async prompt => { prompts.push(prompt); return { plan: { reply: 'Sure.', intent: 'casual', actions: [] } }; } });
  t.after(() => orchestrator.close());
  for (const lowTokenMode of [false, true]) {
    f.store.updateSettings({ lowTokenMode });
    await orchestrator.respond('Tell me something about stars');
    const prompt = prompts.at(-1), context = JSON.parse(prompt.slice(prompt.lastIndexOf('\n') + 1));
    assert.equal(context.companion.name, 'Scout'); assert.equal(context.companion.talkativeness, 'focused');
    assert.deepEqual(context.memory, []); assert.deepEqual(context.companion.savedMoments, []);
    assert.equal(prompt.includes('private retained story'), false); assert.equal(prompt.includes('private saved adventure'), false);
    assert.match(prompt, /Never claim human feelings/);
  }
});

test('natural mode commands use no inference, preserve explicit work, and remain paused until resume', async t => {
  const f = await fixture(t); let models = 0;
  const orchestrator = createOrchestrator({ ...f, publish: () => {}, request: async () => { models++; throw Error('Unexpected inference'); } });
  t.after(() => orchestrator.close());
  f.runtime.currentTask = { id: 'active-work', name: 'gathering wood' };
  assert.match(await orchestrator.respond("Let's just hang out"), /hangout mode/);
  assert.equal(models, 0); assert.equal(f.runtime.currentTask.id, 'active-work');
  f.runtime.isActive = () => false;
  await assert.rejects(orchestrator.respond('switch to adventure mode'), /Resume/);
  assert.equal(companionProfile(f.store).mode, 'hangout');
  assert.equal(modeFromMessage('Can we discuss adventure mode?'), null);
});

test('proactive completion notices are opt-in, deduplicated, quiet while paused, and do not save invented memories', async t => {
  const f = await fixture(t), notices = [];
  f.runtime.teammate = { notice: (...args) => notices.push(args) };
  f.store.put('tasks', { id: 'first', tool: 'chop_tree', status: 'completed' }); f.runtime.emit('change');
  assert.equal(notices.length, 0);
  await f.post('profile', { proactive: true });
  f.store.put('tasks', { id: 'second', tool: 'craft_item', status: 'completed' }); f.runtime.emit('change'); f.runtime.emit('change');
  assert.equal(notices.length, 1); assert.match(notices[0][0], /craft item finished/);
  f.runtime.isActive = () => false;
  f.store.put('tasks', { id: 'third', tool: 'chop_tree', status: 'completed' }); f.runtime.emit('change');
  assert.equal(notices.length, 1); assert.deepEqual(f.store.get('adventureMoments'), []);
});
