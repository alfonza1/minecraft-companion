import { setTimeout as delay } from 'node:timers/promises';
import { EMPTY, placementSupport, placeAdaptedBlock, fullCube } from './placement.js';
import { approach, occupied, abortableWait, digConstructionBlock } from './site.js';
import { vector, positionKey } from './construction-plan.js';
import { equipFastestTool, waitForMiningFooting } from '../../src/mining.js';
import { confirmInventory } from '../skill-executor/items.js';

export function createScaffoldController({ project, bot, signal, save, ensureMaterials }) {
  const state = project.construction, entries = state?.scaffolds ?? [];
  const material = state?.policy.scaffoldMaterial;
  const expected = { name: material, properties: {} };
  const removing = new Set();
  const accessStandingPosition = feet => {
    const { origin } = state, { x: width, z: depth } = project.blueprint.dimensions;
    const outside = feet.x < origin.x - 1 || feet.x > origin.x + width || feet.z < origin.z - 1 || feet.z > origin.z + depth;
    return outside || entries.some(entry => entry.status === 'placed' && positionKey(entry.position) === positionKey(feet.offset(0, -1, 0)));
  };
  const persist = phase => { state.phase = phase; save(project); };
  const ownedState = (entry, observed) => observed?.name === (entry.observedName ?? material) && observed.stateId === entry.stateId;
  const observeChanges = (old, observed) => {
    const entry = entries.find(value => value.status === 'placed' && positionKey(value.position) === positionKey(observed.position));
    if (!entry || ownedState(entry, observed) || (EMPTY.has(observed.name) && removing.has(positionKey(entry.position)))) return;
    if (EMPTY.has(observed.name)) entry.status = 'removed';
    // Dirt can grow grass while the bot is away gathering. Accept only a
    // continuously observed direct transition of an acknowledged owned block.
    // Breaking/replacing it passes through air and immediately loses ownership.
    else if (ownedState(entry, old) && old.name === 'dirt' && observed.name === 'grass_block') {
      entry.observedName = observed.name; entry.stateId = observed.stateId;
    } else entry.status = 'uncertain';
    persist(state.phase);
  };
  bot.on('blockUpdate', observeChanges);
  async function reconcile() {
    for (const entry of entries) {
      signal.throwIfAborted();
      const observed = bot.blockAt(vector(entry.position));
      if (!observed) throw new Error('A recorded scaffold is unloaded; move close enough to observe the worksite before resuming.');
      if (entry.status === 'intent') {
        if (EMPTY.has(observed.name)) entry.status = 'planned';
        else { entry.status = 'uncertain'; persist('needs scaffold inspection'); throw new Error(`Unconfirmed scaffold at ${positionKey(entry.position)} after interruption. Inspect/remove that temporary block before resuming; ownership is not assumed.`); }
      }
      if (entry.status === 'uncertain' && EMPTY.has(observed.name)) entry.status = 'planned';
      if (entry.status === 'uncertain') throw new Error(`Scaffold ownership is unverified at ${positionKey(entry.position)}. Inspect/remove it before resuming.`);
      if (entry.status === 'placed' && EMPTY.has(observed.name)) entry.status = 'removed';
      if (entry.status === 'placed' && !ownedState(entry, observed)) throw new Error(`Recorded scaffold changed at ${positionKey(entry.position)}. I will not remove someone else's replacement.`);
    }
    persist(state.phase);
  }
  async function place(entry) {
    const p = vector(entry.position);
    const current = bot.blockAt(p);
    if (!current || !EMPTY.has(current.name)) throw new Error(`Scaffold site changed at ${p}. No terrain will be cleared.`);
    if (!placementSupport(bot, p, expected)) return false;
    const pendingCount = entries.filter(value => value.status !== 'placed').length;
    await ensureMaterials(expected, 1, signal, { temporaryDemand: pendingCount });
    // Closing a low perimeter from inside can strand the bot behind a two-block
    // ledge. Work from outside or atop acknowledged access blocks instead.
    await approach(bot, p, signal, 2, entry.kind === 'access' ? accessStandingPosition : undefined);
    signal.throwIfAborted();
    const item = bot.inventory.items().find(item => item.name === material && !item.customName && !item.enchants?.length);
    if (!item) throw new Error(`Need ${material} for the reviewed scaffold plan.`);
    await bot.equip(item, 'hand'); signal.throwIfAborted();
    const support = placementSupport(bot, p, expected);
    if (!support || !EMPTY.has(bot.blockAt(p)?.name) || occupied(bot, p, 2)) throw new Error('Scaffold position/support changed or is occupied.');
    entry.status = 'intent'; persist('placing scaffolds');
    let packetSent = false;
    // Record the observed acknowledgement before pause/disconnect unwinds the
    // async caller. An unacknowledged intent is never treated as owned on resume.
    const acknowledged = (_old, value) => {
      if (packetSent && entry.status === 'intent' && value?.position.equals(p) && value.name === material) {
        entry.status = 'placed'; entry.stateId = value.stateId; entry.observedName = value.name;
        entry.order = (state.lastScaffoldOrder ?? 0) + 1; state.lastScaffoldOrder = entry.order;
        persist('placing scaffolds');
      }
    };
    bot.on('blockUpdate', acknowledged);
    try {
      await abortableWait(localSignal => placeAdaptedBlock(bot, expected, p, support, localSignal, () => {
        if (!EMPTY.has(bot.blockAt(p)?.name) || occupied(bot, p, 2) || !fullCube(bot.blockAt(support.reference.position))) throw new Error('Scaffold site changed while aiming.');
      }, () => { packetSent = true; }), signal, bot);
      signal.throwIfAborted();
      if (entry.status !== 'placed') throw new Error('Scaffold placement has no observed acknowledgement.');
      await confirmInventory(bot);
    } finally {
      bot.removeListener('blockUpdate', acknowledged);
      if (!packetSent && entry.status === 'intent') { entry.status = 'planned'; persist('placing scaffolds'); }
    }
    return true;
  }
  async function build(kind = 'access') {
    await reconcile();
    let pending = entries.filter(entry => entry.kind === kind && entry.status !== 'placed');
    while (pending.length) {
      let madeProgress = false;
      for (const entry of pending) if (await place(entry)) madeProgress = true;
      pending = pending.filter(entry => entry.status !== 'placed');
      if (!madeProgress) {
        if (kind === 'brace') return;
        throw new Error('Automatic scaffold path has no reachable support. Check the saved worksite plan; no terrain was cleared.');
      }
    }
  }
  async function cleanup() {
    await reconcile(); persist('removing scaffolds');
    for (const entry of entries.filter(entry => entry.status === 'placed').sort((a, b) => b.order - a.order)) {
      signal.throwIfAborted();
      const p = vector(entry.position);
      const observed = bot.blockAt(p);
      if (EMPTY.has(observed?.name)) { entry.status = 'removed'; persist('removing scaffolds'); continue; }
      await approach(bot, p, signal, 3);
      await waitForMiningFooting(bot, signal);
      await equipFastestTool(bot, observed, signal); signal.throwIfAborted();
      const current = bot.blockAt(p), above = bot.blockAt(p.offset(0, 1, 0));
      if (!ownedState(entry, current) || occupied(bot, p, 3)) throw new Error(`Scaffold changed or supports an entity at ${p}; cleanup paused. Observed ${current?.name}:${current?.stateId}, expected ${entry.observedName ?? material}:${entry.stateId}, bot at ${bot.entity.position}.`);
      if (!above || (!EMPTY.has(above.name) && !entries.some(value => value.status === 'placed' && positionKey(value.position) === positionKey(above.position)))) throw new Error(`A new block rests on scaffold ${p}. Cleanup will not disturb it.`);
      for (const [x, y, z] of [[1,0,0],[-1,0,0],[0,0,1],[0,0,-1]]) {
        const neighbor = bot.blockAt(p.offset(x, y, z));
        if (!neighbor || /water|lava|torch|ladder|button|lever|sign|rail|vine|tripwire_hook/.test(neighbor.name)) throw new Error(`Scaffold ${p} has an attachment or liquid beside it. Cleanup stopped safely.`);
      }
      removing.add(positionKey(p));
      try { await digConstructionBlock(bot, current, signal); }
      finally { removing.delete(positionKey(p)); }
      if (!EMPTY.has(bot.blockAt(p)?.name)) throw new Error(`Scaffold removal at ${p} was not confirmed.`);
      entry.status = 'removed'; persist('removing scaffolds');
    }
    await delay(100, undefined, { signal }); await confirmInventory(bot);
    persist('scaffolds removed');
  }
  return { build, cleanup, reconcile, close: () => bot.removeListener('blockUpdate', observeChanges) };
}
