import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Vec3 } from 'vec3';
import { Store } from '../services/memory/store.js';
import { CompanionRuntime } from '../services/companion-runtime/index.js';
import { createOrchestrator } from '../services/agent-orchestrator/index.js';
import { TaskStack, remainingAction } from '../services/agent-orchestrator/task-stack.js';
import { observeWorld } from '../services/world-state/index.js';

const tick = () => new Promise(resolve => setImmediate(resolve));
async function until(predicate) { for (let n = 0; n < 100; n++) { if (predicate()) return; await tick(); } throw new Error('Task did not reach expected state.'); }
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'companion-task-stack-')), store = new Store(directory);
  store.updateSettings({ realmId: 1, playerName: 'Alfonza' });
  const runtime = new CompanionRuntime({ store, connector: {} }), bot = new EventEmitter(); let wood = 0;
  Object.assign(bot, { minenessReady: true, entity: { position: new Vec3(1, 65, 3) }, health: 20, food: 20, players: {}, entities: {}, registry: {}, game: { dimension: 'overworld' }, inventory: { slots: [], items: () => wood ? [{ name: 'oak_log', count: wood }] : [] }, quit: () => queueMicrotask(() => bot.emit('end')) });
  runtime.bot = bot; runtime.state = 'ACTIVE'; runtime.actions = { stop() {}, resume() {}, state: () => ({ action: null }) };
  const calls = [], controllers = [];
  runtime.execute = (name, args) => runtime.runJob(name, signal => {
    calls.push({ name, args }); controllers.push(signal);
    if (name === 'chop_tree') return new Promise((resolve, reject) => { signal.addEventListener('abort', () => reject(signal.reason), { once: true }); runtime.finish = resolve; });
    if (name === 'goto') { bot.entity.position = new Vec3(args.x ?? 10, args.y ?? 65, args.z ?? 10); return { success: true }; }
    if (name === 'give_items_to_player') { wood -= args.count; return { success: true }; }
    return { success: true };
  }, { tool: name, args });
  const stack = new TaskStack({ runtime, store, publish() {} });
  runtime.modelCancel = options => stack.cancel(options);
  runtime.world = observeWorld(bot);
  return { runtime, store, stack, calls, bot, setWood: n => { wood = n; runtime.world = observeWorld(bot); }, async close() { await runtime.control('stop'); store.close(); clearInterval(runtime.reflexTimer); await rm(directory, { recursive: true, force: true }); } };
}

test('temporary helper returns to the original site and resumes only remaining gathering quantity', async () => {
  const f = await fixture();
  try {
    await f.stack.submit([{ tool: 'chop_tree', args: { count: 8 } }], 'wood'); await until(() => f.calls.length === 1);
    f.setWood(3);
    await f.stack.submit([{ tool: 'goto', args: { player: 'Alfonza' } }], 'help');
    await until(() => f.calls.filter(value => value.name === 'chop_tree').length === 2);
    assert.deepEqual(f.calls.map(value => value.name), ['chop_tree', 'goto', 'goto', 'chop_tree']);
    assert.equal(f.calls.at(-1).args.count, 5);
    assert.deepEqual(f.calls[2].args, { x: 1, y: 65, z: 3, tolerance: 2 });
    f.setWood(8); f.runtime.finish({ success: true }); await until(() => !f.stack.worker);
    assert.equal(f.stack.frames.length, 0);
  } finally { await f.close(); }
});

test('pause saves progress, blocks all further work, and explicit resume continues it', async () => {
  const f = await fixture();
  try {
    await f.stack.submit([{ tool: 'chop_tree', args: { count: 8 } }], 'wood'); f.setWood(2);
    await f.runtime.control('pause'); await tick();
    assert.equal(f.stack.frames[0].actions[0].args.count, 6); assert.equal(f.stack.held, true);
    const count = f.calls.length; await tick(); assert.equal(f.calls.length, count);
    await f.runtime.control('resume'); await until(() => f.calls.length > count + 1);
    assert.equal(f.calls.at(-1).args.count, 6);
  } finally { await f.close(); }
});

test('stop clears saved and running work so no helper completion can resurrect it', async () => {
  const f = await fixture();
  try {
    await f.stack.submit([{ tool: 'chop_tree', args: { count: 8 } }], 'wood');
    await f.stack.submit([{ tool: 'chop_tree', args: { count: 2 } }], 'temporary wood');
    await f.runtime.control('cancel'); await until(() => !f.stack.worker);
    assert.deepEqual(f.stack.frames, []); const count = f.calls.length;
    await f.stack.resume(); await tick(); assert.equal(f.calls.length, count);
  } finally { await f.close(); }
});

test('blocked helper preserves original work and can be discarded before explicit resume', async () => {
  const f = await fixture();
  try {
    await f.stack.submit([{ tool: 'chop_tree', args: { count: 8 } }], 'wood');
    const execute = f.runtime.execute;
    f.runtime.execute = (name, args) => name === 'rescue_player' ? Promise.resolve({ success: false, summary: 'Player no longer visible.' }) : execute(name, args);
    await f.stack.submit([{ tool: 'rescue_player', args: {} }], 'help'); await until(() => !f.stack.worker);
    assert.equal(f.stack.frames.length, 2); assert.equal(f.stack.frames.at(-1).status, 'blocked');
    await f.stack.discard(f.stack.frames.at(-1).id); await f.stack.resume();
    await until(() => f.calls.filter(value => value.name === 'chop_tree').length === 2);
    assert.equal(f.calls.at(-1).args.count, 8);
  } finally { await f.close(); }
});

test('model-routed requests interrupt gameplay too, while general conversation leaves it running', async () => {
  const f = await fixture();
  try {
    let model = 0;
    const orchestrator = createOrchestrator({ runtime: f.runtime, store: f.store, publish() {}, request: async prompt => {
      model++; const { message } = JSON.parse(prompt.slice(prompt.lastIndexOf('\n') + 1));
      return { plan: message === 'Please walk over to the river bend' ? { reply: 'On my way.', intent: 'minecraft_action', actions: [{ tool: 'goto', args: { x: 8, y: 65, z: 8 } }] } : { reply: 'Java has static types.', intent: 'general', actions: [] } };
    } });
    f.stack = f.runtime.taskStack; f.runtime.modelCancel = options => orchestrator.cancel(options);
    await orchestrator.respond('get 8 wood'); await tick(); f.setWood(3);
    await orchestrator.respond('How does Java work?'); assert.equal(f.calls.length, 1);
    await orchestrator.respond('Please walk over to the river bend');
    await until(() => f.calls.filter(value => value.name === 'chop_tree').length === 2);
    assert.equal(f.calls.at(-1).args.count, 5); assert.equal(model, 2);
  } finally { await f.close(); }
});

test('saved stack survives SQLite restart and never starts itself on boot', async () => {
  const f = await fixture();
  try {
    await f.stack.submit([{ tool: 'chop_tree', args: { count: 8 } }], 'wood'); f.setWood(4);
    await f.runtime.control('pause');
    const records = f.store.get('taskStack'); assert.equal(records[0].frames[0].actions[0].args.count, 4);
    const fresh = Object.assign(new EventEmitter(), { snapshot: () => ({}), isActive: () => false });
    const restored = new TaskStack({ runtime: fresh, store: f.store, publish() {} });
    assert.equal(restored.held, true); assert.equal(restored.worker, null); assert.equal(restored.frames[0].actions[0].args.count, 4);
  } finally { await f.close(); }
});

test('checkpoint arithmetic separates crafted output, dropped amounts and stone drops', () => {
  assert.equal(remainingAction({ tool: 'craft_item', args: { item: 'oak_planks', count: 12 } }, { oak_planks: 2 }, { oak_planks: 6 }).args.count, 8);
  assert.equal(remainingAction({ tool: 'give_items_to_player', args: { item: 'oak_log', count: 8 } }, { oak_log: 10 }, { oak_log: 7 }).args.count, 5);
  assert.equal(remainingAction({ tool: 'gather_blocks', args: { block: 'stone', count: 8 } }, {}, { cobblestone: 3 }).args.count, 5);
  assert.equal(remainingAction({ tool: 'chop_tree', args: { count: 8 } }, {}, { oak_log: 8 }), null);
});

test('nested temporary jobs resume in reverse order with independent remaining counts', async () => {
  const f = await fixture();
  try {
    await f.stack.submit([{ tool: 'chop_tree', args: { count: 8 } }], 'original wood'); f.setWood(2);
    await f.stack.submit([{ tool: 'chop_tree', args: { count: 4 } }], 'helper wood'); f.setWood(3);
    await f.stack.submit([{ tool: 'goto', args: { x: 5, y: 65, z: 5 } }], 'quick visit');
    await until(() => f.calls.filter(value => value.name === 'chop_tree').length === 3);
    assert.equal(f.calls.at(-1).args.count, 3); assert.equal(f.stack.frames.at(-1).label, 'helper wood');
    f.setWood(6); f.runtime.finish({ success: true });
    await until(() => f.calls.filter(value => value.name === 'chop_tree').length === 4);
    assert.equal(f.calls.at(-1).args.count, 6); assert.equal(f.stack.frames.at(-1).label, 'original wood');
  } finally { await f.close(); }
});

test('an API-owned construction job is saved with its descriptor and returns to the job site', async () => {
  const f = await fixture();
  try {
    const build = f.runtime.runJob('build:House', current => new Promise((_resolve, reject) => current.addEventListener('abort', () => reject(current.reason))), { tool: 'resume_build', args: { projectId: 'house', expectedRevision: 2, expectedHash: 'approved', origin: { x: 2, y: 65, z: 2 } } });
    const interrupted = assert.rejects(build);
    await f.stack.submit([{ tool: 'goto', args: { x: 5, y: 65, z: 5 } }], 'help'); await interrupted;
    await until(() => !f.stack.worker);
    assert.deepEqual(f.calls.map(value => value.name), ['goto', 'goto', 'resume_build']);
    assert.equal(f.calls.at(-1).args.expectedRevision, 2); assert.equal(f.calls.at(-1).args.expectedHash, 'approved');
  } finally { await f.close(); }
});

test('crash checkpoint restores the last observed progress and still requires explicit resume', async () => {
  const f = await fixture();
  try {
    await f.stack.submit([{ tool: 'chop_tree', args: { count: 8 } }], 'wood');
    f.setWood(3); f.runtime.emit('change');
    const fresh = Object.assign(new EventEmitter(), { snapshot: () => ({}), isActive: () => false });
    const restored = new TaskStack({ runtime: fresh, store: f.store, publish() {} });
    assert.equal(restored.held, true); assert.equal(restored.worker, null); assert.equal(restored.frames[0].actions[0].args.count, 5);
  } finally { await f.close(); }
});

test('interrupting the return journey saves it instead of blocking the original task', async () => {
  const f = await fixture(); let returning;
  try {
    const execute = f.runtime.execute;
    let delayReturn = true;
    f.runtime.execute = (name, args) => name === 'goto' && args.x === 1 && delayReturn ? f.runtime.runJob(name, current => {
      returning = true; return new Promise((_resolve, reject) => current.addEventListener('abort', () => reject(current.reason)));
    }, { tool: name, args }) : execute(name, args);
    await f.stack.submit([{ tool: 'chop_tree', args: { count: 8 } }], 'wood');
    await f.stack.submit([{ tool: 'goto', args: { x: 5, y: 65, z: 5 } }], 'first help');
    await until(() => returning); delayReturn = false;
    await f.stack.submit([{ tool: 'goto', args: { x: 9, y: 65, z: 9 } }], 'second help');
    await until(() => f.calls.filter(value => value.name === 'chop_tree').length === 2);
    assert.equal(f.stack.held, false); assert.equal(f.stack.frames.at(-1).label, 'wood');
  } finally { await f.close(); }
});
