/** Isolated visual-test observations. Never imported by production services or UI. */
import { EventEmitter } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createApp } from '../services/api/index.js';
import { Store, defaults } from '../services/memory/store.js';
import { TaskStack } from '../services/agent-orchestrator/task-stack.js';
import { registerBuildRoutes, reviseProject, approveProject } from '../services/build-planner/index.js';
import { reconcileProjectInventory } from '../services/resource-ledger/index.js';
import { saveMoment } from '../services/companion-personality/index.js';
import voices from '../services/voice/voices.json' with { type: 'json' };

export const DESIGN_TIME = Date.parse('2026-11-01T12:00:00.000Z');
export const DESIGN_SCENARIOS = ['disconnected', 'gathering', 'building', 'exploring', 'hangout', 'blocked', 'mission', 'inventory', 'collaboration'];
export const WORKSPACE_PAGES = ['Session', 'My companion', 'Current mission', 'Tasks & plans', 'Inventory', 'Resources', 'Collaboration', 'Activity', 'Communication', 'Build studio', 'Games', 'Extensions', 'Community', 'Settings', 'Setup', 'Diagnostics & logs'];
export const WEBSITE_PAGES = ['', 'get-started/', 'games/', 'how-it-works/', 'features/', 'docs/', 'engineering/', 'roadmap/', 'contribute/'];
const id = number => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
const collections = ['projects', 'tasks', 'taskStack', 'materialRequests', 'assistance', 'conversation', 'adventureMoments', 'companionProfile', 'supplyChests', 'locations', 'memories', 'workspaceDecisions', 'spawnPoints'];
let activeFixture = false;

function fixtureBlueprint() {
  const blocks = [];
  for (let x = 0; x < 7; x++) for (let z = 0; z < 5; z++) {
    blocks.push({ x, y: 0, z, name: 'cobblestone', section: 'foundation' });
    if (x === 0 || x === 6 || z === 0 || z === 4) for (let y = 1; y <= 3; y++) {
      if (x === 3 && z === 0 && y < 3) continue;
      const corner = [0, 6].includes(x) && [0, 4].includes(z);
      const window = !corner && y === 2 && (([1, 5].includes(x) && [0, 4].includes(z)) || ([0, 6].includes(x) && z === 2));
      blocks.push({ x, y, z, name: corner ? 'oak_log' : window ? 'glass' : 'oak_planks', section: window ? 'windows' : 'walls' });
    }
    blocks.push({ x, y: 4, z, name: 'oak_slab', properties: { type: 'bottom', waterlogged: 'false' }, section: 'roof' });
  }
  return { version: '26.3', dimensions: { x: 7, y: 5, z: 5 }, blocks, provenance: 'reconstructed', uncertainties: ['Synthetic visual-test design. Not a user project or recorded gameplay.'] };
}

function item(slot, name, count, extras = {}) {
  return { slot, name, count, type: slot + 1, displayName: name.split('_').map(word => word[0].toUpperCase() + word.slice(1)).join(' '), stackSize: 64, ...extras };
}

function installedClock(freezeTime) {
  if (!freezeTime) return () => {};
  const OriginalDate = globalThis.Date;
  globalThis.Date = class FixtureDate extends OriginalDate {
    constructor(...args) { super(...(args.length ? args : [DESIGN_TIME])); }
    static now() { return DESIGN_TIME; }
  };
  return () => { globalThis.Date = OriginalDate; };
}

export async function createDesignFixture({ scenario = 'disconnected', freezeTime = true } = {}) {
  if (activeFixture) throw new Error('Design fixtures use a process-local deterministic clock; run one fixture per test worker.');
  if (!DESIGN_SCENARIOS.includes(scenario)) throw new Error('Unknown design scenario.');
  activeFixture = true;
  const restoreClock = installedClock(freezeTime);
  let directory, store;
  try {
    directory = await mkdtemp(join(tmpdir(), 'waypoint-design-only-'));
    store = new Store(directory);
  } catch (error) {
    restoreClock(); activeFixture = false;
    if (directory) await rm(directory, { recursive: true, force: true });
    throw error;
  }
  const unavailable = () => { throw new Error('Design fixtures never connect accounts, run models or enter a game.'); };
  const connector = Object.assign(new EventEmitter(), { auth: { status: 'disconnected' }, realms: [], connectAccount: unavailable, createBot: unavailable, closeConnection: async () => {}, checkRealm: unavailable, close: async () => {} });
  const catalog = { provider: 'codex', models: [{ id: 'design-fixture', displayName: 'Design fixture · inference disabled' }], available: true, authenticated: true, error: null, observedAt: new Date().toISOString() };
  const providerRegistry = { status: () => catalog, get: async () => catalog, execute: unavailable, startClaudeLogin: unavailable, close: async () => {} };
  const modelCatalog = { get: async () => ({ ...catalog, defaultModel: 'design-fixture' }), close: async () => {} };
  const voice = { available: false, status: 'setup-required', recordingsStored: false, desktop: { running: false, phase: 'off' } };
  let app;
  try {
    app = await createApp({ store, connector, skipExtensions: true, providerRegistry, modelCatalog, voiceModule: { getVoiceStatus: () => voice, updateVoiceSettings: async () => {} }, readiness: { codex: () => catalog, ai: () => catalog, voice: () => voice, refresh: async () => {} } });
    app.get('/api/voice/options', async () => voices.map(option => ({ ...option, available: false })));
    app.get('/api/voice/devices', async () => []);
    app.get('/api/voice/status', async () => voice);
    app.post('/api/voice/desktop/suspend', async () => voice);
    app.post('/api/voice/preview', async (_, reply) => reply.code(409).send({ error: 'Design fixtures do not synthesize or play audio.' }));
    app.post('/api/voice/cancel', async () => ({ stopped: true }));
    const context = app.companion, runtime = context.runtime;
    registerBuildRoutes(app, { ...context, orchestrator: { searchYouTube: unavailable, designBlueprint: unavailable }, videoCredentials: { status: async () => ({ configured: false, model: 'unavailable', pendingJobs: [] }), read: unavailable } });
    const stack = new TaskStack({ runtime, store, publish: context.publish });

    function setFixture(nextScenario) {
      if (!DESIGN_SCENARIOS.includes(nextScenario)) throw new Error('Unknown design scenario.');
      for (const collection of collections) for (const record of store.get(collection)) store.delete(collection, record.id);
      store.put('settings', { ...structuredClone(defaults), id: 'settings', model: 'design-fixture', realmId: nextScenario === 'disconnected' ? null : 101, playerName: 'FixturePlayer', teammate: { busyMode: false }, voice: { ...defaults.voice, desktopEnabled: false } });
      store.put('companionProfile', { id: 'profile', name: 'Scout Fixture', style: 'relaxed', talkativeness: 'balanced', proactive: false, memoryEnabled: true, mode: nextScenario === 'hangout' ? 'hangout' : nextScenario === 'exploring' ? 'adventure' : 'teammate', modeSelected: true });
      stack.frames = []; stack.held = true;
      runtime.state = nextScenario === 'disconnected' ? 'DISCONNECTED' : 'ACTIVE'; runtime.planning = false; runtime.currentTask = null; runtime.logs = [];
      runtime.connection = { status: nextScenario === 'disconnected' ? 'offline' : 'connected', username: 'FixtureCompanion', realmId: nextScenario === 'disconnected' ? null : 101, version: '26.3', serverVersion: '26.3', reconnectAttempt: 0, error: null };
      connector.auth = { status: nextScenario === 'disconnected' ? 'disconnected' : 'connected', username: nextScenario === 'disconnected' ? null : 'FixtureCompanion' };
      connector.realms = nextScenario === 'disconnected' ? [] : [{ id: 101, name: 'Isolated design fixture', owner: 'FixturePlayer', state: 'OPEN', activeVersion: '26.3' }];
      const at = new Date().toISOString();
      runtime.world = nextScenario === 'disconnected' ? null : { observedAt: at, inventoryExact: true, provenance: 'observed', serverVersion: '26.3', clientVersion: '26.3', position: { x: 128, y: 64, z: -42 }, dimension: 'overworld', health: 18, food: 17, oxygen: 20, experience: { level: 6, points: 72 }, equipment: { head: item(5, 'iron_helmet', 1, { durabilityRemaining: 145, maxDurability: 165 }), torso: null, legs: null, feet: item(8, 'iron_boots', 1), hand: item(36, 'stone_axe', 1, { durabilityRemaining: 92, maxDurability: 131 }), offhand: null }, inventory: [item(9, 'oak_log', 42), item(10, 'cobblestone', 64), item(11, 'bread', 12), item(12, 'torch', 24), item(13, 'oak_planks', 16), item(36, 'stone_axe', 1, { durabilityRemaining: 92, maxDurability: 131 }), item(37, 'iron_pickaxe', 1, { durabilityRemaining: 187, maxDurability: 250 })], nearbyPlayers: [{ name: 'FixturePlayer', position: { x: 132, y: 64, z: -40 }, provenance: 'observed' }], nearbyEntities: [], timeOfDay: 5000 };
      if (runtime.world) {
        store.put('locations', { id: 'home', name: 'Home', realmId: 101, dimension: 'overworld', position: { x: 128, y: 64, z: -42 }, observedAt: at, provenance: 'observed' });
        store.put('supplyChests', { id: id(50), name: 'Home supplies · fixture', realmId: 101, dimension: 'overworld', position: { x: 130, y: 64, z: -42 }, approved: true, depositAllowed: true, allowedItems: ['oak_log', 'cobblestone', 'bread'], observedAt: at, provenance: 'observed-container', inventory: [item(0, 'cobblestone', 64), item(1, 'bread', 8)] });
      }
      const makeTask = (tool, args, name = tool.replaceAll('_', ' ')) => {
        const task = { id: id(201), name, tool, status: 'running', descriptor: { tool, args }, baselineInventory: {}, startedAt: at };
        runtime.currentTask = task; runtime.state = 'BUSY'; store.put('tasks', task); return task;
      };
      if (nextScenario === 'gathering') makeTask('chop_tree', { count: 64, species: 'oak' }, 'Gather oak logs for camp');
      if (nextScenario === 'exploring') makeTask('explore_nearby', { radius: 24, steps: 2 }, 'Scout the nearby surface route');
      if (['building', 'blocked', 'mission', 'collaboration'].includes(nextScenario)) {
        let project = reviseProject({ id: id(101), name: 'Riverside shelter · design fixture', version: '26.3', revision: 0, references: [], aiPercent: 50, createdAt: at }, fixtureBlueprint());
        project = approveProject(project);
        project.status = nextScenario === 'building' ? 'building' : nextScenario === 'blocked' ? 'blocked' : 'approved';
        const verified = project.blueprint.blocks.map((block, index) => block.section === 'foundation' ? index : null).filter(index => index !== null);
        project.checkpoint = { revision: project.revision, verified, updatedAt: at, reason: nextScenario === 'blocked' ? 'A ravine blocks the safe route. Choose another approach before continuing.' : null };
        project.assignments = project.assignments.map(row => ({ ...row, userProgress: row.material === 'sand' ? 2 : 0, userObservedAt: at }));
        store.put('projects', project);
        for (const next of reconcileProjectInventory([project], runtime.world.inventory, at)) store.put('projects', next);
        if (nextScenario === 'building') makeTask('resume_approved_build', { projectId: project.id }, 'Build the shelter walls');
        if (['mission', 'blocked'].includes(nextScenario)) {
          stack.frames = [{ id: id(301), label: 'Build a shared riverside shelter', actions: [{ tool: 'chop_tree', args: { count: 64, species: 'oak' } }, { tool: 'craft_item', args: { item: 'oak_planks', count: 64 } }, { tool: 'resume_approved_build', args: { projectId: project.id } }], index: 1, status: nextScenario === 'blocked' ? 'blocked' : 'saved', ...(nextScenario === 'blocked' ? { error: 'The safe route ends at a ravine. Pick a different approach or bring supplies back to camp.' } : {}) }];
          stack.save();
        }
        if (nextScenario === 'collaboration') store.put('materialRequests', { id: `${project.id}:1:glass`, projectId: project.id, revision: 1, item: 'glass', count: 6, targetStock: 6, reason: 'The windows need glass. You can bring it while the remaining supplies stay reserved.', status: 'requested', realmId: 101, dimension: 'overworld', at });
      }
      if (nextScenario === 'hangout') {
        store.put('conversation', { id: id(401), role: 'user', text: 'That bridge was worth the detour.', at });
        store.put('conversation', { id: id(402), role: 'companion', text: 'We did take the scenic route. Want to keep exploring or call this home?', at });
        saveMoment(store, { sourceType: 'conversation', sourceId: id(401), title: 'The scenic route · fixture quote' });
      }
      if (nextScenario !== 'disconnected') runtime.logs = [{ level: 'info', message: 'DESIGN FIXTURE: simulated observations. No game client or model is running.', at }];
      runtime.emit('change'); context.publish();
      return context.snapshot();
    }

    setFixture(scenario);
    await app.listen({ host: '127.0.0.1', port: 0 });
    let closed = false;
    return { app, store, runtime, base: `http://127.0.0.1:${app.server.address().port}`, directory, setFixture, scope: 'Real local API and SQLite; deterministic synthetic observations; no model, microphone, account or game connection.', async close() { if (closed) return; closed = true; try { await app.close(); } finally { restoreClock(); activeFixture = false; await rm(directory, { recursive: true, force: true }); } } };
  } catch (error) {
    if (app) await app.close().catch(() => {}); else store.close();
    restoreClock(); activeFixture = false; await rm(directory, { recursive: true, force: true }); throw error;
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const fixture = await createDesignFixture({ scenario: process.argv[2] || 'disconnected' });
  console.log(`DESIGN FIXTURE ONLY · ${fixture.base}\n${fixture.scope}\nScenario: ${process.argv[2] || 'disconnected'}. No public fixture mutation endpoint exists.`);
  const stop = async () => { await fixture.close(); process.exit(0); };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
}
