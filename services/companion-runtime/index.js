import { SEARCH_LIMITS } from '../skill-executor/search-route.js';
import { recordServerSpawn } from '../skill-executor/storage-policy.js';
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import pathfinderPkg from 'mineflayer-pathfinder';
import collectBlockPkg from 'mineflayer-collectblock';
import { Vec3 } from 'vec3';
import { createActions, inventoryCounts } from '../../src/actions.js';
import { createToolRegistry } from './tools.js';
import { observeWorld } from '../world-state/index.js';
import { gatherApprovedBlocks, chopNaturalTrees } from '../skill-executor/index.js';
import { diagnoseKick } from '../realm-connector/kick-diagnosis.js';

const { pathfinder, Movements, goals } = pathfinderPkg;
const HOSTILES = new Set(['zombie', 'skeleton', 'creeper', 'spider', 'drowned', 'husk', 'stray', 'witch', 'pillager', 'phantom', 'warden', 'blaze', 'hoglin', 'piglin_brute']);
export const REFLEX_INTERVAL_MS = 500;
export const MAX_RECONNECTS = 5;
export const STABLE_CONNECTION_MS = 30000;
export const BODY_IDLE_TIMEOUT_MS = 3000;
export const SPRINT_MIN_HEALTH = 14;
export const SPRINT_MIN_FOOD = 14;
export const SPRINT_THREAT_RADIUS = 12;
export function canSprint(bot, settings) {
  return Boolean(bot.entity) && (settings.movementSpeed ?? 'brisk') === 'brisk' && bot.health >= SPRINT_MIN_HEALTH && bot.food >= SPRINT_MIN_FOOD &&
    !bot.entity?.isInWater && !bot.entity?.isInLava &&
    !Object.values(bot.entities || {}).some(entity => HOSTILES.has(entity.name) && entity.position?.distanceTo(bot.entity.position) < SPRINT_THREAT_RADIUS);
}

export class CompanionRuntime extends EventEmitter {
  constructor({ store, connector, createBot, timers = globalThis }) {
    super();
    this.store = store; this.connector = connector; this.botFactory = createBot || (id => connector.createBot(id)); this.timers = timers;
    this.state = 'DISCONNECTED'; this.planning = false; this.activationRequested = false;
    this.actionEpoch = 0;
    this.connection = { status: 'offline', username: null, realmId: null, version: null, error: null, reconnectAttempt: 0 };
    this.bot = null; this.actions = null; this.tools = new Map(); this.world = null; this.currentTask = null;
    this.pending = null; this.operations = new Map(); this.controlQueue = Promise.resolve(); this.jobController = null; this.reconnectTimer = null; this.generation = 0;
    this.logs = []; this.closed = false; this.modelCancel = async () => {}; this.audioStop = async () => {}; this.fullAudioStop = async () => {};
    for (const task of store.get('tasks')) {
      if (['running', 'queued'].includes(task.status)) store.put('tasks', { ...task, status: 'interrupted', summary: 'Application restarted; resume explicitly.' });
    }
    this.reflexTimer = timers.setInterval(() => this.reflex().catch(error => this.log('error', error.message)), REFLEX_INTERVAL_MS);
    this.reflexTimer.unref?.();
  }
  log(level, message) {
    const safe = String(message).replace(/(Bearer\s+|access_token[=: ]+|refresh_token[=: ]+)\S+/gi, '$1[redacted]').slice(0, 1200);
    this.logs.push({ at: new Date().toISOString(), level, message: safe });
    this.logs = this.logs.slice(-100); this.emit('change');
  }
  snapshot() { return { state: this.state, planning: this.planning, connection: { ...this.connection }, world: this.world, currentTask: this.currentTask, taskStack: this.taskStack?.snapshot(), tasks: this.store.get('tasks').slice(-100), logs: this.logs }; }
  isActive() { return ['ACTIVE', 'BUSY'].includes(this.state); }
  control(command) {
    const run = this.controlQueue.catch(() => {}).then(() => this.applyControl(command));
    this.controlQueue = run; return run;
  }
  async applyControl(command) {
    if (this.closed) throw new Error('Companion is shutting down.');
    if (command === 'plan') {
      if (this.bot || this.connection.status === 'connecting') throw new Error('Pause or stop the Realm companion before starting offline planning.');
      this.planning = true; this.state = 'ACTIVE'; this.connection.status = 'offline'; this.emit('change'); return;
    }
    if (command === 'start') {
      if (this.bot || this.connection.status === 'connecting') throw new Error('A companion connection already exists.');
      this.connection.reconnectAttempt = 0;
      this.planning = false;
      this.activationRequested = true;
      void this.connect(false).catch(error => this.log('error', error.message)); return;
    }
    if (command === 'resume') {
      if (this.state !== 'PAUSED' || (!this.planning && !this.bot?.minenessReady)) throw new Error('Resume requires a connected, paused companion or paused planning session.');
      if (this.pending || this.actions?.state().action || this.hasOperations()) throw new Error('Previous gameplay operation is still stopping. Wait before resuming.');
      this.actions?.resume(); this.state = 'ACTIVE'; this.emit('resume'); this.emit('change'); return;
    }
    if (command === 'cancel') { await this.cancelTask(); return; }
    if (['pause', 'emergency', 'stop', 'disconnect'].includes(command)) {
      this.actionEpoch++;
      const disconnect = ['stop', 'disconnect', 'emergency'].includes(command);
      this.activationRequested = false;
      // Gate synchronously, before awaiting model/process cancellation.
      this.state = disconnect ? 'DISCONNECTED' : ((this.bot || this.planning) ? 'PAUSED' : 'DISCONNECTED');
      if (disconnect) this.planning = false;
      if (disconnect || !this.bot) this.generation++;
      if (!this.bot) this.connection.status = 'offline';
      this.timers.clearTimeout(this.reconnectTimer); this.reconnectTimer = null;
      this.jobController?.abort(new Error('Companion paused or stopped.'));
      this.actions?.stop('Companion paused or stopped.');
      this.emit(disconnect ? 'stop' : 'pause'); this.emit('change');
      await Promise.allSettled([this.modelCancel({ preserveTasks: !disconnect }), this.fullAudioStop(), this.connector?.cancelAuth?.()]);
      if (disconnect) await this.disconnectBot();
      return;
    }
    throw new Error('Unknown companion control.');
  }
  async connect(recovering) {
    const realmId = this.store.settings().realmId;
    if (!Number.isSafeInteger(realmId)) throw new Error('Choose your Realm in Settings first.');
    const generation = ++this.generation;
    this.connection = { ...this.connection, realmId, status: 'connecting', error: null, errorCode: null };
    this.emit('change');
    let bot;
    try { bot = await this.botFactory(realmId); }
    catch (error) {
      if (generation !== this.generation || this.closed) return;
      this.state = 'ERROR'; this.connection.status = 'error'; this.connection.error = error.message; this.emit('change'); throw error;
    }
    if (generation !== this.generation || this.closed) { bot.quit(); return; }
    this.bot = bot;
    let spawned = false;
    bot.minenessReady = false;
    bot.loadPlugin(pathfinder); bot.loadPlugin(collectBlockPkg.plugin);
    this.actions = createActions(bot);
    this.trackOperations(bot);
    this.tools = createToolRegistry(bot, this.actions);
    const current = () => this.bot === bot && generation === this.generation;
    bot._client?.on?.('spawn_position', packet=>{
      if(current())recordServerSpawn(this.store,realmId,packet,bot.game?.dimension);
    });
    const observe = () => {
      if (this.bot !== bot) return;
      if (bot.companionInventorySyncing) return;
      this.world = observeWorld(bot);
      if (this.world) this.store.put('observations', { id: 'last-world', ...this.world });
      this.emit('change');
    };
    bot.on('spawn', () => {
      if (!current()) return;
      const activate = !spawned && !recovering && this.activationRequested;
      spawned = true;
      this.timers.clearTimeout(this.connectionTimer);
      bot.minenessReady = true;
      bot.physics.playerHalfWidth = 0.30001; bot.physics.playerHeight = 1.80001;
      const movement = new Movements(bot);
      movement.canDig = false; movement.allow1by1towers = false; movement.allowParkour = false;
      // Pathfinder measures feet-to-landing-block, including the floor itself:
      // 2 permits a single-block descent; 1 traps the bot on ordinary steps.
      movement.allowSprinting = canSprint(bot, this.store.settings()); movement.maxDropDown = 2; movement.infiniteLiquidDropdownDistance = false; movement.allowFreeMotion = false;
      movement.scafoldingBlocks = []; movement.liquidCost = 100;
      bot.pathfinder.setMovements(movement); bot.collectBlock.movements = null;
      this.connection = { ...this.connection, status: 'connected', username: bot.username, version: bot.version, serverVersion: bot.companionTransport?.serverVersion || bot.version, transport: bot.companionTransport?.kind || 'native', projected: Boolean(bot.companionTransport?.projected), error: null, errorCode: null };
      this.timers.clearTimeout(this.stabilityTimer);
      this.stabilityTimer = this.timers.setTimeout(() => { if (current() && this.connection.status === 'connected') { this.connection.reconnectAttempt = 0; this.emit('change'); } }, STABLE_CONNECTION_MS);
      this.stabilityTimer.unref?.();
      this.state = activate ? 'ACTIVE' : 'PAUSED';
      if (!activate) { this.jobController?.abort(new Error('Respawn/reconnection requires explicit resume.')); this.actions.stop('Resume explicitly after respawn or reconnect.'); this.fullAudioStop(); this.modelCancel({ preserveTasks: true }); }
      observe(); this.log('info', recovering ? 'Reconnected safely. Resume explicitly to continue.' : `Connected as ${bot.username}.`);
      this.emit('connected');
    });
    bot.on('health', observe); bot.on('experience', observe); bot.on('heldItemChanged', observe);
    bot.on('companionInventoryConfirmed', observe);
    bot._client?.on?.('window_items', packet => {
      if (packet.windowId === bot.inventory?.id) setImmediate(() => { if (this.bot === bot && !bot.companionInventorySyncing) { bot.companionInventoryUnverified = false; observe(); } });
    });
    bot.once('spawn', () => bot.inventory.on('updateSlot', observe));
    bot.on('death', () => { if (this.bot === bot) { this.emit('companion-death', { bot, world: this.world }); this.activationRequested = false; this.state = 'PAUSED'; this.jobController?.abort(); this.actions.stop('Died. Resume after respawn.'); observe(); this.emit('pause'); this.modelCancel({ preserveTasks: true }); this.fullAudioStop(); } });
    bot.on('kicked', reason => {
      if (!current()) return;
      bot.companionKicked = true;
      const diagnosis = diagnoseKick(reason);
      this.connection.error = diagnosis.message; this.connection.errorCode = diagnosis.code;
      this.activationRequested = false;
      this.log('error', this.connection.error);
    });
    bot.on('error', error => {
      if (this.bot !== bot) return;
      // Raw protocol/auth errors can contain tokens or signed chat data.
      this.connection.error = /version|protocol|unsupported/i.test(error.message) ? 'Minecraft protocol mismatch. Check Diagnostics for installed supported versions.' : 'Minecraft connection failed. Check account, Realm availability and network.';
      this.log('error', this.connection.error);
      if (!spawned) {
        this.state = 'ERROR'; this.activationRequested = false;
        void this.disconnectBot().then(() => { if (!this.bot && this.state === 'ERROR') { this.connection.status = 'error'; this.emit('change'); } });
      }
    });
    bot.on('end', () => this.onDisconnect(bot));
    bot.on('chat', (username, message) => {
      if (username === bot.username || username !== this.store.settings().playerName) return;
      if (/^(?:@companion\s+)?(?:stop|wait)[.!]?$/i.test(message.trim())) this.control('cancel').catch(() => {});
      else if (/^@companion\b/i.test(message) && this.isActive()) this.emit('conversation', message.replace(/^@companion\s*/i, '').slice(0, 2000));
    });
    this.worldTimer = this.timers.setInterval(observe, 1500); this.worldTimer.unref?.();
    this.connectionTimer = this.timers.setTimeout(() => {
      if (!spawned && this.bot === bot) bot.emit('error', new Error('Minecraft login timed out.'));
    }, 30_000);
    this.connectionTimer.unref?.();
  }
  onDisconnect(bot) {
    if (this.bot !== bot) return;
    this.timers.clearInterval(this.worldTimer);
    this.timers.clearTimeout(this.connectionTimer);
    this.timers.clearTimeout(this.stabilityTimer);
    this.bot = null; this.world = null; this.tools.clear();
    this.jobController?.abort(new Error('Minecraft disconnected.'));
    this.actions?.stop('Minecraft disconnected.');
      this.modelCancel({ preserveTasks: true }); this.fullAudioStop(); this.emit('disconnect');
    if ((this.state === 'DISCONNECTED' && !this.activationRequested) || this.closed) { this.connection.status = 'offline'; this.emit('change'); return; }
    this.activationRequested = false;
    this.state = 'ERROR'; this.connection.status = 'reconnecting';
    this.connection.error ||= 'Connection lost. Gameplay stopped; reconnecting with work paused.';
    this.emit('change');
    if (bot.companionKicked) { this.connection.status = 'error'; this.emit('change'); return; }
    this.scheduleReconnect();
  }
  scheduleReconnect() {
    if (this.closed || this.state === 'DISCONNECTED') return;
    if (this.connection.reconnectAttempt >= MAX_RECONNECTS) { this.connection.status = 'error'; this.emit('change'); return; }
    const attempt = ++this.connection.reconnectAttempt;
    this.reconnectTimer = this.timers.setTimeout(async () => {
      this.reconnectTimer = null;
      try { await this.connect(true); }
      catch { this.scheduleReconnect(); }
    }, Math.min(1000 * 2 ** attempt, 30_000));
    this.reconnectTimer.unref?.(); this.emit('change');
  }
  async disconnectBot() {
    const bot = this.bot;
    this.timers.clearInterval(this.worldTimer);
    this.timers.clearTimeout(this.stabilityTimer);
    this.timers.clearTimeout(this.connectionTimer);
    this.bot = null; this.world = null; this.tools.clear(); this.actions = null;
    this.connection.status = 'offline'; this.emit('disconnect'); this.emit('change');
    if (bot) {
      await new Promise(resolve => {
        const timeout = this.timers.setTimeout(() => { bot.end?.(); resolve(); }, 2000);
        bot.once('end', () => { this.timers.clearTimeout(timeout); resolve(); });
        try { bot.quit('Companion stopped'); } catch { this.timers.clearTimeout(timeout); resolve(); }
      });
    }
    await this.connector?.closeConnection?.();
  }
  async cancelTask() {
    this.actionEpoch++;
    this.emit('task-cancel');
    this.jobController?.abort(new Error('Task cancelled.'));
    this.actions?.stop('Task cancelled. Wait for a new request.');
    await Promise.allSettled([this.modelCancel(), this.audioStop()]);
    if (this.currentTask) this.store.put('tasks', { ...this.currentTask, status: 'interrupted' });
    this.emit('change');
  }
  async suspendWork(reason) {
    this.actionEpoch++;
    this.jobController?.abort(new Error(reason));
    this.actions?.stop(reason);
    await this.pending?.catch(() => {});
    await this.waitForIdle();
  }
  hasOperations() { return [...this.operations.values()].some(bot => bot === this.bot); }
  async waitForIdle() {
    const deadline = Date.now() + BODY_IDLE_TIMEOUT_MS;
    while (this.pending || this.actions?.state().action || this.hasOperations()) {
      if (Date.now() >= deadline) throw new Error('The previous action is still stopping. Wait a moment before the handoff.');
      await new Promise(resolve => setTimeout(resolve, 25));
    }
  }
  trackOperations(bot) {
    for (const [object, method] of [[bot.pathfinder, 'goto'], ...['dig', 'equip', 'unequip', 'placeBlock', '_genericPlace', 'craft', 'consume', 'look', 'lookAt', 'toss', 'clickWindow', 'activateBlock'].map(method => [bot, method])]) {
      if (typeof object?.[method] !== 'function') continue;
      const original = object[method].bind(object);
      object[method] = (...args) => {
        const controller = this.jobController;
        const operation = Promise.resolve().then(() => {
          if (this.bot !== bot || !this.isActive()) throw new Error('Gameplay operation cancelled.');
          controller?.signal.throwIfAborted();
          return original(...args);
        });
        this.operations.set(operation, bot);
        const release = () => this.operations.delete(operation);
        operation.then(release, release);
        return operation;
      };
    }
  }
  async runJob(name, work, descriptor = null) {
    if (!this.isActive() || !this.bot?.minenessReady) throw new Error('Companion must be active and connected.');
    if (this.pending || this.actions?.state().action || this.hasOperations() || this.state === 'BUSY') throw new Error('Companion is already working or finishing cancellation.');
    this.actions.resume();
    const controller = new AbortController(); this.jobController = controller;
    const task = { id: randomUUID(), tool: name, name, descriptor, baselineInventory: inventoryCounts(this.bot), site: { position: { x: this.bot.entity.position.x, y: this.bot.entity.position.y, z: this.bot.entity.position.z }, dimension: this.bot.game?.dimension || 'unknown', realmId: this.store.settings().realmId }, status: 'running', startedAt: new Date().toISOString() };
    this.currentTask = task; this.store.put('tasks', task); this.state = 'BUSY'; this.emit('change');
    const pending = Promise.resolve().then(() => { controller.signal.throwIfAborted(); return work(controller.signal); });
    this.pending = pending;
    try {
      const result = await pending;
      controller.signal.throwIfAborted();
      this.store.put('tasks', { ...task, status: result?.success === false ? 'blocked' : 'completed', result, endedAt: new Date().toISOString() });
      return result;
    } catch (error) {
      this.store.put('tasks', { ...task, status: controller.signal.aborted ? 'interrupted' : 'blocked', summary: error.message, endedAt: new Date().toISOString() });
      throw error;
    } finally {
      if (this.pending === pending) { this.pending = null; this.jobController = null; this.currentTask = null; }
      if (this.state === 'BUSY') this.state = 'ACTIVE';
      this.world = observeWorld(this.bot); this.emit('change');
    }
  }
  async execute(name, args = {}) {
    if (this.resumeHandlers?.has(name)) return this.resumeHandlers.get(name)(args);
    if(name==='resume_approved_build'){
      const {projectId}=this.teammate.schemas[name].parse(args);
      const project=this.store.get('projects').find(project=>(!projectId||project.id===projectId)&&project.checkpoint?.realmId===this.store.settings().realmId&&project.checkpoint?.dimension===this.bot?.game?.dimension&&project.approvedRevision===project.revision&&project.approvedHash&&project.status!=='complete');
      if(!project||!this.resumeHandlers?.has('resume_build'))throw new Error('Approve a blueprint and start its chosen site once in Build Studio before resuming construction by voice.');
      return this.resumeHandlers.get('resume_build')({projectId:project.id,origin:project.checkpoint.origin,expectedRevision:project.revision,expectedHash:project.approvedHash});
    }
    if (this.teammate && Object.hasOwn(this.teammate.schemas, name)) {
      if (this.bot?.companionTransport?.projected) throw new Error('Teammate resource actions require a native Minecraft connection.');
      const validated = this.teammate.schemas[name].parse(args);
      return this.runJob(name, async signal => {
        const result = await this.actions.run(name, actionSignal => this.teammate.execute(name, validated, actionSignal), name === 'find_resource' ? SEARCH_LIMITS.actionMs : ['find_food','cook_food','store_surplus','ensure_storage','explore_nearby'].includes(name) ? 240000 : undefined);
        signal.throwIfAborted(); return result;
      }, { tool: name, args: validated });
    }
    if (this.bot?.companionTransport?.projected && ['gather_blocks', 'chop_tree', 'craft_item', 'drop_item', 'give_items_to_player', 'equip_item'].includes(name)) throw new Error('Resource actions require native Minecraft identities. The translated connection provides a projected client view.');
    if (this.bot?.companionInventoryUnverified && ['gather_blocks', 'chop_tree', 'craft_item'].includes(name)) throw new Error('Wait for server inventory confirmation before collecting or crafting more resources.');
    const tool = this.tools.get(name);
    if (!tool) throw new Error(`Unsupported survival skill: ${name}.`);
    const validated = tool.schema.parse(args);
    if (name === 'look_around') {
      if (!this.isActive()) throw new Error('Resume companion first.');
      const result = await tool.handler(validated); return JSON.parse(result.content[0].text);
    }
    return this.runJob(name, async signal => {
      const result = name === 'chop_tree'
        ? { content: [{ text: JSON.stringify(await chopNaturalTrees(this.bot, this.actions, validated)) }] }
        : name === 'gather_blocks'
        ? { content: [{ text: JSON.stringify(await gatherApprovedBlocks(this.bot, this.actions, validated, this.store.settings().miningZone)) }] }
        : await tool.handler(validated);
      signal.throwIfAborted();
      return JSON.parse(result.content[0].text);
    }, { tool: name, args: validated });
  }
  async reflex() {
    if (!this.isActive() || !this.bot?.minenessReady) return;
    const bot = this.bot;
    if (bot.pathfinder?.movements) bot.pathfinder.movements.allowSprinting = canSprint(bot, this.store.settings());
    const threat = bot.nearestEntity(entity => HOSTILES.has(entity.name) && entity.position.distanceTo(bot.entity.position) < 6);
    if (threat && (bot.health <= 8 || threat.name === 'creeper' || threat.name === 'warden')) {
      this.jobController?.abort(new Error('Retreating from immediate danger.'));
      this.actions.stop('Danger nearby; task interrupted.');
      if (this.pending || this.actions.state().action || this.hasOperations()) return;
      // No model call, no tunneling or building during retreat.
      const away = bot.entity.position.minus(threat.position); away.y = 0;
      if (away.norm() > 0) {
        const target = bot.entity.position.plus(away.normalize().scaled(7));
        bot.pathfinder.setGoal(new goals.GoalNear(target.x, target.y, target.z, 2));
      }
      if (!this.lastThreatAlert || Date.now() - this.lastThreatAlert > 15_000) { this.lastThreatAlert = Date.now(); this.log('warn', `${threat.name} nearby; retreating. Saved work waits for explicit resume.`); this.teammate?.notice(`There’s a ${threat.name} too close. I’m backing off.`, 'danger', 'retreat'); }
      return;
    }
    if (this.pending || this.actions?.state().action || this.state !== 'ACTIVE') return;
    if (threat && this.store.settings().combat === 'defend' && threat.position.distanceTo(bot.entity.position) < 3 && Date.now() - (this.lastAttack || 0) > 1000) {
      this.lastAttack = Date.now();
      await this.runJob('defend', async signal => {
        const ranking = ['netherite_sword', 'diamond_sword', 'iron_sword', 'stone_sword', 'wooden_sword'];
        const weapon = bot.inventory.items().filter(item => ranking.includes(item.name)).sort((a, b) => ranking.indexOf(a.name) - ranking.indexOf(b.name))[0];
        if (weapon) await bot.equip(weapon, 'hand');
        signal.throwIfAborted();
        if (threat.isValid && threat.position.distanceTo(bot.entity.position) < 3) bot.attack(threat);
      }); return;
    }
    if (bot.oxygenLevel !== undefined && bot.oxygenLevel < 10 && bot.entity.isInWater) {
      await this.runJob('surface', async signal => {
        const abort = () => bot.clearControlStates();
        signal.addEventListener('abort', abort, { once: true });
        try { bot.setControlState('jump', true); await new Promise(resolve => this.timers.setTimeout(resolve, 1200)); signal.throwIfAborted(); }
        finally { signal.removeEventListener('abort', abort); bot.clearControlStates(); }
      }); return;
    }
    if (bot.food < 16) {
      const foods = bot.inventory.items().filter(item => bot.registry.foodsByName?.[item.name] && !['rotten_flesh', 'spider_eye', 'poisonous_potato', 'pufferfish', 'chorus_fruit','chicken','suspicious_stew','golden_apple','enchanted_golden_apple'].includes(item.name));
      const food = foods.sort((a, b) => bot.registry.foodsByName[b.name].foodPoints - bot.registry.foodsByName[a.name].foodPoints)[0];
      if (food) await this.runJob('eat', async signal => { await bot.equip(food, 'hand'); signal.throwIfAborted(); await bot.consume(); signal.throwIfAborted(); });
    }
  }
  async close() {
    await this.control('stop'); this.closed = true;
    this.timers.clearInterval(this.reflexTimer); this.timers.clearTimeout(this.reconnectTimer);
    await this.connector?.close?.();
  }
}
