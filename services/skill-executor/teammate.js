import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { SEARCH_LIMITS } from './search-route.js';
import { findResource } from './resource-search.js';
import { Vec3 } from 'vec3';
import { setTimeout as delay } from 'node:timers/promises';
import { inventoryCounts } from '../../src/actions.js';
import { dropInventoryItem, confirmInventory } from './items.js';
import { collect } from '../../src/tools/play.js';
import { requireNaturalTree } from './index.js';
import { uniqueTreeLogs } from './tree-targets.js';
import { navigateWithRecovery } from './navigation.js';
import {tendFarm,huntFood,cookFood,exploreNearby,storeSurplus,foodCount,matureCrops,huntableAnimals,COOKED,cookingFuel} from './survival.js';

const item = z.string().regex(/^[a-z][a-z0-9_]*$/).max(80);
export const locationSchema = z.object({ name: z.string().trim().min(1).max(60), source: z.enum(['companion', 'player']).default('companion') }).strict();
export const supplySchema = z.object({ name: item, count: z.number().int().min(1).max(64) }).strict();
export const routineSchema = z.object({ id: z.enum(['mining', 'building', 'travel']), label: z.string().trim().min(1).max(60), supplies: z.array(supplySchema).min(1).max(12) }).strict();
export const teammateSettingsSchema = z.object({ autoRestock: z.boolean().optional(), busyMode:z.boolean().optional(),autoDeposit:z.boolean().optional(), updates: z.enum(['quiet', 'useful', 'chatty']).optional(), resumeAfterHelp: z.boolean().optional() }).strict();
export const DEFAULT_ROUTINES = [
  { id: 'mining', label: 'Get ready to mine', supplies: [{ name: 'bread', count: 8 }, { name: 'torch', count: 32 }, { name: 'stone_pickaxe', count: 1 }] },
  { id: 'building', label: 'Get ready to build', supplies: [{ name: 'bread', count: 8 }, { name: 'torch', count: 16 }, { name: 'stone_axe', count: 1 }] },
  { id: 'travel', label: 'Get ready to travel', supplies: [{ name: 'bread', count: 8 }, { name: 'torch', count: 16 }] },
];
export const TEAMMATE_ACTIONS = {
  hunt_food:z.object({count:z.number().int().min(1).max(2).default(1)}).strict(),
  tend_farm:z.object({count:z.number().int().min(1).max(8).default(4)}).strict(),
  cook_food:z.object({count:z.number().int().min(1).max(3).default(2)}).strict(),
  explore_nearby:z.object({radius:z.number().int().min(8).max(48).default(24),steps:z.number().int().min(1).max(4).default(3)}).strict(),
  store_surplus:z.object({}).strict(),
  restock_food:z.object({}).strict(),
  find_food:z.object({}).strict(),
  resume_approved_build:z.object({projectId:z.string().uuid().optional()}).strict(),
  find_resource:z.object({item, radius:z.number().int().min(8).max(SEARCH_LIMITS.radius).default(SEARCH_LIMITS.radius),steps:z.number().int().min(1).max(SEARCH_LIMITS.steps).default(SEARCH_LIMITS.steps)}).strict(),
  rescue_player: z.object({}).strict(),
  bring_items: z.object({ item, count: z.number().int().min(1).max(64), player: z.string().regex(/^[A-Za-z0-9_]{1,16}$/) }).strict(),
  prepare_routine: z.object({ routine: z.enum(['mining', 'building', 'travel']) }).strict(),
  restock_supplies: z.object({ routine: z.enum(['mining', 'building', 'travel']).default('mining') }).strict(),
  visit_location: z.object({ name: z.string().trim().min(1).max(60) }).strict(),
  recover_items: z.object({ deathId: z.string().uuid().optional() }).strict(),
};
export const PLAYER_LOCATION_MAX_AGE_MS = 5 * 60_000;
export const MIN_TOOL_DURABILITY = 16;
export const SUPPLY_SEARCH_RADIUS = 64;
export const CHEST_APPROVAL_RADIUS = 6;
export const MAX_RECOVERY_DROPS = 12;
export { MAX_NAVIGATION_ATTEMPTS, navigateWithRecovery } from './navigation.js';
const HOSTILES = new Set(['zombie', 'skeleton', 'spider', 'drowned', 'husk', 'stray', 'witch', 'pillager', 'phantom', 'creeper', 'warden', 'blaze', 'hoglin', 'piglin_brute']);
const DANGEROUS = new Set(['creeper', 'warden', 'witch', 'piglin_brute']);
const RARE = /(?:diamond|netherite|emerald|ancient_debris|enchanted|golden_apple|totem|elytra|nether_star|dragon_egg|beacon|shulker|heart_of_the_sea|trident|mace|heavy_core)/;
export const isProtectedSupply = name => RARE.test(name);
const now = () => new Date().toISOString();
const position = value => ({ x: value.x, y: value.y, z: value.z });
const dimension = bot => bot.game?.dimension || 'unknown';
const gearFamily = name => name.match(/_(pickaxe|axe|sword|shovel|hoe)$/)?.[1];
const rank = name => ['wooden', 'golden', 'stone', 'iron', 'diamond', 'netherite'].indexOf(name.split('_')[0]);
const usableTool = (bot, value) => !bot.registry.itemsByName[value.name]?.maxDurability || bot.registry.itemsByName[value.name].maxDurability - (value.durabilityUsed || 0) >= MIN_TOOL_DURABILITY;

export function supplyOwned(bot, requirement) {
  const family = gearFamily(requirement.name);
  return bot.inventory.items().filter(value => family ? gearFamily(value.name) === family && rank(value.name) >= rank(requirement.name) &&
    usableTool(bot, value) : value.name === requirement.name)
    .reduce((sum, value) => sum + value.count, 0);
}


export class TeammateService {
  constructor({ runtime, store, publish }) {
    Object.assign(this, { runtime, store, publish }); this.lastObservedAt = null; this.alerts = new Map();
    runtime.teammate = this; this.schemas = TEAMMATE_ACTIONS;
    runtime.on('change', () => this.observe());
    runtime.on('companion-death', event => this.recordDeath(event));
  }
  preferences() { return { autoRestock: false, busyMode:false,autoDeposit:true, updates: this.store.settings().alertFrequency === 'quiet' ? 'quiet' : 'useful', resumeAfterHelp: true, ...this.store.settings().teammate }; }
  routines() { return DEFAULT_ROUTINES.map(base => this.store.get('routines').find(value => value.id === base.id) || base); }
  snapshot() { const trip=this.store.get('expeditions').find(value=>value.id==='resource-search'); return { expedition:trip?{item:trip.item,status:trip.status,home:trip.home,returnTarget:trip.returnTarget,remainingWaypoints:trip.route.length,reason:trip.reason}:null, locations: this.store.get('locations'), supplies: this.store.get('supplyChests'), routines: this.routines(), deaths: this.store.get('deaths').slice(-10), preferences: this.preferences(),workAreas:this.store.get('workAreas'),idleWork:this.runtime.idleWork?.snapshot() }; }
  notice(text, kind = 'useful', key = text) {
    const cooldown = kind === 'danger' ? 30_000 : 120_000;
    if (Date.now() - (this.alerts.get(key) || 0) < cooldown) return;
    const mode = this.preferences().updates;
    if (mode === 'quiet' && !['danger', 'blocked'].includes(kind)) return;
    this.alerts.set(key, Date.now());
    if (this.alerts.size > 200) this.alerts.delete(this.alerts.keys().next().value);
    this.store.put('conversation', { id: randomUUID(), role: 'companion', text: text.slice(0, 1500), kind, at: now() });
    this.publish();
  }
  observe() {
    const world = this.runtime.world;
    if (!world || world.observedAt === this.lastObservedAt) return;
    this.lastObservedAt = world.observedAt;
    const player = world.nearbyPlayers.find(value => value.name === this.store.settings().playerName);
    if (player) this.store.put('playerLocations', { id: player.name, position: player.position, realmId: this.store.settings().realmId, dimension: world.dimension, observedAt: world.observedAt, provenance: 'previously-observed' });
    if (!this.runtime.isActive()) return;
    if (world.health <= 8) this.notice('I’m hurt pretty bad. Can you give me a hand?', 'danger', 'low-health');
    if (world.food < 8) this.notice('I’m running low on food.', 'danger', 'low-food');
    if (this.preferences().updates === 'chatty' && !this.runtime.currentTask && !this.runtime.taskStack?.frames.length) this.notice('I’m free if you want a hand gathering or building.', 'useful', 'idle-suggestion');
  }
  saveLocation({ name, source }) {
    const world = this.runtime.world;
    if (!world) throw new Error('Connect and observe the world before saving a place.');
    const player = source === 'player' ? world.nearbyPlayers.find(value => value.name === this.store.settings().playerName) : null;
    if (source === 'player' && !player) throw new Error('I can’t currently see your location. Move into view or save my position.');
    const id = name.toLowerCase();
    const record = { id, name, position: position(player?.position || world.position), dimension: world.dimension, realmId: this.store.settings().realmId, provenance: 'observed', observedAt: world.observedAt };
    this.store.put('locations', record); this.publish(); return record;
  }
  playerDestination() {
    const bot = this.runtime.bot, player = this.store.settings().playerName;
    const visible = bot.players?.[player]?.entity;
    if (visible) return { position: visible.position, current: true };
    const last = this.store.get('playerLocations').find(value => value.id === player);
    if (!last || last.realmId !== this.store.settings().realmId || last.dimension !== dimension(bot) || Date.now() - Date.parse(last.observedAt) > PLAYER_LOCATION_MAX_AGE_MS) throw new Error('I can’t see you and don’t have a recent location in this Realm and dimension. Tell me where you are or come into view.');
    return { position: new Vec3(last.position.x, last.position.y, last.position.z), current: false };
  }
  threats(center, radius = 8) { return Object.values(this.runtime.bot.entities || {}).filter(entity => entity.isValid !== false && HOSTILES.has(entity.name) && entity.position.distanceTo(center) <= radius); }
  reserved(name) { return this.store.get('projects').reduce((sum, project) => sum + (project.reservations?.[name] || 0), 0); }
  async withdraw(supplies, signal) {
    const bot = this.runtime.bot;
    if (bot.companionTransport?.projected || bot.companionInventoryUnverified) throw new Error('Restocking requires confirmed native inventory.');
    const approved = this.store.get('supplyChests').filter(chest => chest.approved && chest.realmId === this.store.settings().realmId && chest.dimension === dimension(bot));
    for (const chest of approved) {
      signal.throwIfAborted();
      if (!supplies.some(supply => supplyOwned(bot, supply) < supply.count && chest.allowedItems.includes(supply.name))) continue;
      const p = new Vec3(chest.position.x, chest.position.y, chest.position.z);
      if (bot.entity.position.distanceTo(p) > SUPPLY_SEARCH_RADIUS) continue;
      await navigateWithRecovery(bot, p, 2, signal);
      const block = bot.blockAt(p);
      if (!block || !['chest', 'barrel'].includes(block.name)) throw new Error(`Supply chest ${chest.name} is unloaded or no longer a chest/barrel.`);
      const container = await bot.openContainer(block);
      try {
        const recordStock = () => {
          const current = this.store.get('supplyChests').find(value => value.id === chest.id);
          if (current) this.store.put('supplyChests', { ...current, inventory: container.containerItems().map(value => ({ name: value.name, count: value.count })), provenance: 'observed-container', observedAt: now() });
        };
        recordStock();
        for (const supply of supplies) {
          signal.throwIfAborted();
          const permission = this.store.get('supplyChests').find(value => value.id === chest.id && value.approved);
          if (!permission) throw new Error('Supply chest permission was revoked. Restocking stopped.');
          const missing = Math.max(0, supply.count - supplyOwned(bot, supply));
          if (!missing || !permission.allowedItems.includes(supply.name) || isProtectedSupply(supply.name)) continue;
          const stacks = container.containerItems().filter(value => value.name === supply.name);
          // Type-based container transfers cannot select around a protected stack.
          // Skip mixed stock instead of accidentally taking somebody's named gear.
          if (stacks.some(value => value.enchants?.length || value.customName || (gearFamily(value.name) && !usableTool(bot, value)))) continue;
          const available = stacks.reduce((sum, value) => sum + value.count, 0);
          if (available) { await container.withdraw(bot.registry.itemsByName[supply.name].id, null, Math.min(missing, available)); signal.throwIfAborted(); recordStock(); }
        }
      } finally { container.close(); }
      await confirmInventory(bot); signal.throwIfAborted();
    }
    this.publish();
    return supplies.map(supply => ({ ...supply, available: supplyOwned(bot, supply), missing: Math.max(0, supply.count - supplyOwned(bot, supply)) }));
  }
  async routine(id, signal) {
    const routine = this.routines().find(value => value.id === id), bot = this.runtime.bot;
    const supplies = await this.withdraw(routine.supplies, signal);
    const missing = supplies.filter(value => value.missing);
    if (missing.length) return { success: false, missing, summary: `Still need ${missing.map(value => `${value.missing} ${value.name}`).join(', ')}. I checked approved nearby supply chests; I won’t take unapproved materials.` };
    const family = id === 'mining' ? 'pickaxe' : id === 'building' ? 'axe' : null;
    const tool = family && bot.inventory.items().filter(value => gearFamily(value.name) === family && usableTool(bot, value)).sort((a, b) => rank(b.name) - rank(a.name))[0];
    if (tool) { await bot.equip(tool, 'hand'); await confirmInventory(bot); }
    signal.throwIfAborted();
    return { success: true, supplies, summary: `Ready for ${id}. Food, tools and supplies checked against your routine.` };
  }
  async rescue(signal) {
    const bot = this.runtime.bot, target = this.playerDestination();
    if (bot.health < 10 || bot.food < 6) throw new Error('I’m too hurt or hungry to rescue you safely. I need help too.');
    await navigateWithRecovery(bot, target.position, 2, signal);
    const live = bot.players?.[this.store.settings().playerName]?.entity;
    if (!live) return { success: false, summary: 'I reached your last observed location but can’t see you. Where did you go?' };
    if (live.position.distanceTo(bot.entity.position) > 4) return { success: false, summary: 'You moved while I was coming over. Stay nearby or give me your new location.' };
    const threats = this.threats(live.position);
    if (threats.some(entity => DANGEROUS.has(entity.name)) || threats.length > 3) return { success: false, summary: 'There’s too much danger here. Head toward me and let’s retreat together.' };
    if (this.store.settings().combat === 'defend' && threats.length) {
      const weapon = bot.inventory.items().filter(value => /_sword$/.test(value.name)).sort((a, b) => rank(b.name) - rank(a.name))[0];
      if (weapon) await bot.equip(weapon, 'hand');
      for (let tick = 0; tick < 6; tick++) {
        signal.throwIfAborted();
        if (bot.health < 10) throw new Error('I’m getting hurt. We need to retreat.');
        const nearby = this.threats(bot.entity.position, 3).find(entity => !DANGEROUS.has(entity.name));
        if (!nearby) break;
        await bot.lookAt(nearby.position.offset(0, 1, 0), true); bot.attack(nearby);
        await delay(1000, undefined, { signal });
      }
    }
    if (this.threats(live.position).length) return { success: false, summary: 'There are still mobs near you. Let’s clear them or retreat before I go back to work.' };
    const food = bot.inventory.items().find(value => ['bread', 'cooked_beef', 'cooked_porkchop', 'baked_potato', 'cooked_chicken'].includes(value.name) && value.count - this.reserved(value.name) > 2);
    let handoff;
    if (food && !this.threats(bot.entity.position, 4).length) handoff = await dropInventoryItem(bot, { item: food.name, count: 2, player: this.store.settings().playerName }, signal);
    return { success: true, handoff, summary: `I’m with you.${handoff?.dropped ? ` Dropped ${handoff.dropped} food items toward you; pickup isn’t verified.` : ''} ${this.store.settings().combat === 'defend' ? 'I checked nearby threats.' : 'Your combat setting is retreat, so I’m keeping out of fights.'}` };
  }
  recordDeath({ bot, world }) {
    const record = { id: randomUUID(), at: now(), realmId: this.store.settings().realmId, dimension: dimension(bot), position: position(bot.entity.position), inventory: world?.inventory || [], inventoryProvenance: 'last-observed-before-death', status: 'unrecovered', warning: 'Items may not have dropped (keepInventory), may be destroyed, picked up, or despawn after five loaded minutes. Ownership of nearby drops cannot be verified.' };
    this.store.put('deaths', record); this.notice('I died. I saved the location and last inventory. Resume when you’re ready, then ask me to recover my items.', 'danger', `death:${record.id}`); this.publish();
  }
  async recover(deathId, signal) {
    const death = deathId ? this.store.get('deaths').find(value => value.id === deathId) : this.store.get('deaths').filter(value => value.status !== 'recovered').at(-1), bot = this.runtime.bot;
    if (!death) throw new Error('There’s no saved death location to recover.');
    if (death.realmId !== this.store.settings().realmId || death.dimension !== dimension(bot)) throw new Error('The saved death is in another Realm or dimension.');
    if (bot.health < 14 || bot.food < 12 || this.threats(new Vec3(death.position.x, death.position.y, death.position.z)).some(value => DANGEROUS.has(value.name))) throw new Error('Recovery looks unsafe. Heal, eat, or clear the danger first.');
    const before = inventoryCounts(bot);
    await navigateWithRecovery(bot, death.position, 2, signal);
    if (this.threats(bot.entity.position).length) throw new Error('There are hostiles at the death site. Clear them before recovery.');
    const drops = Object.values(bot.entities).filter(entity => entity.name === 'item' && entity.isValid && entity.position.distanceTo(new Vec3(death.position.x, death.position.y, death.position.z)) < 8).slice(0, MAX_RECOVERY_DROPS);
    for (const drop of drops) { signal.throwIfAborted(); if (this.threats(bot.entity.position).length || bot.health < 14) throw new Error('Recovery interrupted by danger.'); await navigateWithRecovery(bot, drop.position, 0.5, signal); await delay(200, undefined, { signal }); }
    await confirmInventory(bot); signal.throwIfAborted();
    const after = inventoryCounts(bot), gained = Object.fromEntries(Object.entries(after).map(([name, quantity]) => [name, quantity - (before[name] || 0)]).filter(([, quantity]) => quantity > 0));
    const observed = Object.keys(gained).length > 0;
    this.store.put('deaths', { ...death, status: observed ? 'recovery-attempted' : 'not-found', gained, checkedAt: now() }); this.publish();
    return { success: observed, gained, summary: observed ? `Picked up ${Object.entries(gained).map(([name, quantity]) => `${quantity} ${name}`).join(', ')}. I can’t confirm that every lost item was recovered.` : 'I checked the death site but didn’t observe any recovered items. They may be gone or outside loaded view.' };
  }
  async execute(name, args, signal) {
    const bot = this.runtime.bot;
    if(name==='find_resource')return findResource(this,args,signal);
    if(name==='store_surplus')return storeSurplus(this,signal);
    if(name==='tend_farm')return tendFarm(this,args,signal);
    if(name==='hunt_food')return huntFood(this,args,signal);
    if(name==='cook_food')return cookFood(this,args,signal);
    if(name==='explore_nearby')return exploreNearby(this,args,signal);
    if(name==='restock_food'){
      const supplies=['cooked_beef','cooked_porkchop','cooked_mutton','cooked_chicken','bread','baked_potato','carrot'].filter(name=>this.store.get('supplyChests').some(chest=>chest.approved&&chest.allowedItems.includes(name)));
      if(!supplies.length)throw new Error('No approved food supply is configured.');
      for(const name of supplies){if(foodCount(bot)>=8)break;await this.withdraw([{name,count:(inventoryCounts(bot)[name]||0)+8-foodCount(bot)}],signal);}
      return {success:foodCount(bot)>0,summary:`Checked approved supplies; carrying ${foodCount(bot)} food items.`};
    }
    if(name==='find_food'){
      if(foodCount(bot)>=8)return {success:true,summary:`Already carrying ${foodCount(bot)} food items.`};
      if(bot.inventory.items().some(item=>COOKED[item.name])&&cookingFuel(bot)&&bot.findBlock({matching:bot.registry.blocksByName.furnace.id,maxDistance:16}))return cookFood(this,{count:2},signal);
      const stock=await this.execute('restock_food',{},signal).catch(error=>{signal.throwIfAborted();return null;});if(stock?.success)return stock;
      if(matureCrops(this).length){
        const result=await tendFarm(this,{count:3},signal),table=bot.findBlock({matching:bot.registry.blocksByName.crafting_table.id,maxDistance:16}),recipe=table&&bot.recipesFor(bot.registry.itemsByName.bread.id,null,1,table)[0];
        if(recipe&&(inventoryCounts(bot).wheat||0)-this.reserved('wheat')>=3){await navigateWithRecovery(bot,table.position,2,signal);await bot.craft(recipe,1,table);await confirmInventory(bot);}
        return {...result,summary:`${result.summary} Carrying ${foodCount(bot)} food items.`};
      }
      if(huntableAnimals(this).length)return huntFood(this,{count:1},signal);
      return {success:false,summary:'No safe food source is currently visible. Approve a farm or supply chest, or help me reach wild animals.'};
    }
    if (name === 'rescue_player') return this.rescue(signal);
    if (name === 'prepare_routine' || name === 'restock_supplies') return this.routine(args.routine, signal);
    if (name === 'recover_items') return this.recover(args.deathId, signal);
    if (name === 'visit_location') {
      const place = this.store.get('locations').find(value => value.id === args.name.toLowerCase());
      if (!place) throw new Error(`I don’t have a saved place called ${args.name}.`);
      if (place.realmId !== this.store.settings().realmId || place.dimension !== dimension(bot)) throw new Error('That place is in another Realm or dimension.');
      await navigateWithRecovery(bot, place.position, 2, signal); return { success: true, summary: `Reached ${place.name}.` };
    }
    if (name === 'bring_items') {
      const free = Math.max(0, (inventoryCounts(bot)[args.item] || 0) - this.reserved(args.item));
      if (free < args.count) await this.withdraw([{ name: args.item, count: args.count + this.reserved(args.item) }], signal);
      let missing = args.count + this.reserved(args.item) - (inventoryCounts(bot)[args.item] || 0);
      for (let tree = 0; missing > 0 && /^[a-z_]+_log$/.test(args.item) && tree < 16; tree++) {
        signal.throwIfAborted();
        const root = requireNaturalTree(bot, args.item.replace(/_log$/, ''));
        if (!bot.inventory.emptySlotCount() && !bot.inventory.items().some(value => value.name === args.item && value.count < value.stackSize)) throw new Error('My inventory is full. Make room before gathering handoff supplies.');
        const result = await collect(bot, uniqueTreeLogs(bot, root, missing), signal);
        const nextMissing = args.count + this.reserved(args.item) - (inventoryCounts(bot)[args.item] || 0);
        if (!result.success || nextMissing >= missing) break;
        missing = nextMissing;
      }
      const owned = (inventoryCounts(bot)[args.item] || 0) - this.reserved(args.item);
      if (owned < args.count) return { success: false, summary: `I have ${Math.max(0, owned)} unreserved ${args.item}; need ${args.count}. I won’t hand off materials reserved for a build.`, missing: args.count - Math.max(0, owned) };
      const result = await dropInventoryItem(bot, args, signal); return { ...result, success: result.dropped >= args.count };
    }
    throw new Error('Unsupported teammate skill.');
  }
}
