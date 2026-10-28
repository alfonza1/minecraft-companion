import { randomUUID } from 'node:crypto';

export const MAX_TASK_STACK = 12;
const counts = world => (world?.inventory || []).reduce((result, item) => {
  result[item.name] = (result[item.name] || 0) + item.count; return result;
}, {});

// Capture progress before the helper task can consume or give away its output.
export function remainingAction(action, before, after) {
  const args = { ...action.args };
  if (!Number.isInteger(args.count)) return { ...action, args };
  let progress = 0;
  if (action.tool === 'chop_tree') {
    progress = Object.keys(after).filter(name => args.species ? name === `${args.species.replace(/_log$/, '')}_log` : name.endsWith('_log'))
      .reduce((sum, name) => sum + Math.max(0, after[name] - (before[name] || 0)), 0);
  } else if (action.tool === 'craft_item') progress = Math.max(0, (after[args.item] || 0) - (before[args.item] || 0));
  else if (['give_items_to_player', 'drop_item', 'bring_items'].includes(action.tool)) progress = Math.max(0, (before[args.item] || 0) - (after[args.item] || 0));
  else if (action.tool === 'gather_blocks') {
    const drop = ({ stone: 'cobblestone', deepslate: 'cobbled_deepslate', grass_block: 'dirt' })[args.block] || args.block;
    progress = Math.max(0, (after[drop] || 0) - (before[drop] || 0));
  }
  args.count = Math.max(0, args.count - progress);
  return args.count ? { ...action, args } : null;
}

export class TaskStack {
  constructor({ runtime, store, publish, notify = () => {} }) {
    Object.assign(this, { runtime, store, publish, notify });
    this.frames = structuredClone(store.get('taskStack').find(value => value.id === 'active')?.frames || []);
    for (const frame of this.frames) {
      if (frame.status !== 'running') continue;
      if (Object.hasOwn(frame, 'observedRemaining')) {
        if (frame.observedRemaining) frame.actions[frame.index] = frame.observedRemaining; else frame.index++;
      }
      frame.status = 'saved'; frame.returnTo = frame.anchor;
      delete frame.beforeInventory; delete frame.observedRemaining;
    }
    this.held = this.frames.length > 0; this.worker = null; this.switching = false; this.version = 0;
    this.mutations = Promise.resolve();
    runtime.taskStack = this;
    runtime.on?.('pause', () => this.hold());
    runtime.on?.('disconnect', () => this.hold());
    runtime.on?.('stop', () => this.clear());
    runtime.on?.('task-cancel', () => this.clear());
    runtime.on?.('resume', () => { void this.resume().catch(error => notify(error.message, 'blocked')); });
    runtime.on?.('change', () => this.checkpoint());
  }
  checkpoint() {
    const frame = this.frames.at(-1), world = this.runtime.snapshot().world;
    if (!frame?.beforeInventory || frame.status !== 'running' || !world || world.inventoryExact === false || world.observedAt === this.lastObservation) return;
    this.lastObservation = world.observedAt;
    frame.observedRemaining = remainingAction(frame.actions[frame.index], frame.beforeInventory, counts(world)); this.save();
  }
  save() { this.store.put('taskStack', { id: 'active', frames: this.frames, held: this.held }); this.publish(); }
  snapshot() { return { held: this.held, switching: this.switching, frames: this.frames.map(frame => ({ id: frame.id, label: frame.label, status: frame.status, step: frame.index + 1, steps: frame.actions.length, actions: frame.actions, error: frame.error })) }; }
  hold() { this.held = true; this.save(); }
  clear() { this.version++; this.frames = []; this.held = true; this.save(); }
  async cancel({ preserveTasks = false } = {}) { preserveTasks ? this.hold() : this.clear(); await this.worker; }
  async suspendBody() {
    if (this.runtime.suspendWork) await this.runtime.suspendWork('Helping with a temporary request.');
    else await this.runtime.cancelTask?.();
    await this.worker;
    await this.runtime.waitForIdle?.();
  }
  submit(actions, label) {
    const expected = this.version;
    const operation = this.mutations.catch(() => {}).then(async () => {
      if (expected !== this.version) throw new Error('That request was stopped before it could begin.');
      if (!this.runtime.isActive()) throw new Error('Resume companion before assigning a task.');
      if (this.frames.length >= MAX_TASK_STACK) throw new Error('Too many interrupted tasks. Finish or cancel a saved task first.');
      this.switching = true;
      try {
        const externalTask = !this.worker && this.runtime.currentTask;
        const following = !this.worker && !externalTask && this.runtime.actions?.state().following;
        let external = externalTask?.descriptor;
        if (this.frames.length + 1 + (external || following ? 1 : 0) > MAX_TASK_STACK) throw new Error('Too many saved tasks. Finish or discard one first.');
        if (this.worker || this.runtime.currentTask) await this.suspendBody();
        if (expected !== this.version || !this.runtime.isActive()) throw new Error('That request was stopped before it could begin.');
        const world = this.runtime.snapshot().world;
        if (external && world && world.inventoryExact !== false) external = remainingAction(external, externalTask.baselineInventory || {}, counts(world));
        if (external) {
          const unverified = (!world || world.inventoryExact === false) && Number.isInteger(external.args.count);
          this.frames.push({ id: randomUUID(), label: externalTask.name || external.tool, actions: [external], index: 0, status: unverified ? 'blocked' : 'saved', error: unverified ? 'Check the unverified inventory before explicitly resuming.' : undefined, returnTo: ['chop_tree', 'gather_blocks', 'craft_item', 'resume_build'].includes(external.tool) ? externalTask.site : null });
        }
        if (following && actions[0]?.tool !== 'follow_player') this.frames.push({ id: randomUUID(), label: `following ${following}`, actions: [{ tool: 'follow_player', args: { player: following, distance: this.store.settings().followDistance || 3 } }], index: 0, status: 'saved' });
        this.frames.push({ id: randomUUID(), label: label.slice(0, 140), actions: structuredClone(actions), index: 0, status: 'queued' });
        this.held = false; this.save();
      } finally { this.switching = false; }
      this.start();
    });
    this.mutations = operation; return operation;
  }
  async resume() {
    if (!this.runtime.isActive()) throw new Error('Resume companion before resuming saved work.');
    if (this.worker && !this.held) return;
    await this.runtime.waitForIdle?.();
    const frame = this.frames.at(-1);
    if (frame) { frame.status = 'queued'; delete frame.error; }
    this.held = false; this.save(); this.start();
  }
  async discard(id) {
    const frame = this.frames.find(value => value.id === id);
    if (!frame) throw new Error('Saved task not found.');
    if (frame.status === 'running' || this.switching) throw new Error('Stop or pause the current task before discarding it.');
    this.frames = this.frames.filter(value => value.id !== id); this.save();
  }
  start() {
    if (this.worker || this.switching || this.held || !this.frames.length || !this.runtime.isActive()) return;
    this.worker = this.drain().catch(error => { this.held = true; this.notify(`I hit a snag: ${error.message}`, 'blocked'); })
      .finally(() => { this.worker = null; this.save(); });
  }
  async drain() {
    while (!this.held && !this.switching && this.runtime.isActive() && this.frames.length) {
      const frame = this.frames.at(-1), action = frame.actions[frame.index];
      if (frame.status === 'blocked') { this.held = true; this.save(); return; }
      if (!action) {
        this.frames.pop(); this.save();
        const autoResume = this.runtime.teammate?.preferences().resumeAfterHelp !== false;
        this.notify(`${frame.summary || `Done with ${frame.label}.`}${this.frames.length ? autoResume ? ` Back to ${this.frames.at(-1).label}.` : ' Previous work is saved.' : ''}`, 'completed');
        if (this.frames.length && !autoResume) { this.held = true; this.save(); return; }
        continue;
      }
      if (frame.returnTo) {
        frame.status = 'running'; this.save();
        const anchor = frame.returnTo, world = this.runtime.snapshot().world;
        if (world?.dimension !== anchor.dimension || this.store.settings().realmId !== anchor.realmId) { frame.status = 'blocked'; frame.error = 'The saved work location is in another Realm or dimension.'; this.held = true; this.save(); return; }
        try { await this.runtime.execute('goto', { ...anchor.position, tolerance: 2 }); }
        catch (error) {
          if (this.held || this.switching || !this.runtime.isActive()) { frame.status = 'saved'; this.save(); return; }
          frame.status = 'blocked'; frame.error = `Could not return to the job site: ${error.message}`; this.held = true; this.save(); this.notify(frame.error, 'blocked'); return;
        }
        if (this.held || this.switching || !this.runtime.isActive() || !this.frames.includes(frame)) return;
        delete frame.returnTo;
      }
      const initialWorld = this.runtime.snapshot().world;
      frame.anchor = initialWorld ? { position: initialWorld.position, dimension: initialWorld.dimension, realmId: this.store.settings().realmId } : null;
      frame.status = 'running'; this.save();
      const before = counts(this.runtime.snapshot().world);
      frame.beforeInventory = before; this.save();
      let result, error;
      try { result = await this.runtime.execute(action.tool, action.args); } catch (caught) { error = caught; }
      if (!this.frames.includes(frame)) return;
      if (this.switching || this.held || !this.runtime.isActive()) {
        const world = this.runtime.snapshot().world;
        if (world?.inventoryExact !== false && world) {
          const remaining = remainingAction(action, before, counts(world));
          if (remaining) frame.actions[frame.index] = remaining; else frame.index++;
        } else if (['craft_item', 'drop_item', 'give_items_to_player', 'bring_items'].includes(action.tool)) {
          frame.status = 'blocked'; frame.error = 'Inventory transfer was unverified; inspect inventory before explicitly resuming this step.';
        }
        if (frame.status !== 'blocked') frame.status = 'saved';
        delete frame.beforeInventory; delete frame.observedRemaining;
        if (frame.anchor && ['chop_tree', 'gather_blocks', 'craft_item', 'resume_build'].includes(action.tool)) frame.returnTo = frame.anchor;
        this.save(); return;
      }
      if (error || result?.success === false || result?.isError) {
        const world = this.runtime.snapshot().world;
        if (world && world.inventoryExact !== false) {
          const remaining = remainingAction(action, before, counts(world));
          if (remaining) frame.actions[frame.index] = remaining; else frame.index++;
        }
        frame.status = 'blocked'; frame.error = error?.message || result?.summary || 'The step could not be completed.';
        delete frame.beforeInventory; delete frame.observedRemaining;
        this.held = true; this.save(); this.notify(`I’m stuck on ${frame.label}: ${frame.error} Saved work is waiting; say “resume previous task” when it’s sorted.`, 'blocked'); return;
      }
      delete frame.beforeInventory; delete frame.observedRemaining;
      frame.summary = result?.summary; frame.index++; this.save();
    }
  }
}
