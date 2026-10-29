import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Vec3 } from 'vec3';
import { dataFor } from '../packages/minecraft-data/index.js';
import { validateBlueprint, blueprintHash } from '../services/build-planner/blueprint.js';
import { reviseProject, registerBuildRoutes } from '../services/build-planner/index.js';
import { planScaffolding, prepareConstruction, assertConstructionScope, outstandingScaffolds } from '../services/build-executor/construction-plan.js';
import { createScaffoldController } from '../services/build-executor/scaffolds.js';
import { createRawGatherer, rawTargets, protectedResourcePosition } from '../services/build-executor/raw-materials.js';
import { digConstructionBlock, approach } from '../services/build-executor/site.js';
import Fastify from 'fastify';

const version = '1.21.11', origin = { x: 0, y: 64, z: 0 };
const pos = p => `${p.x},${p.y},${p.z}`;
const block = (name, position) => ({ name, position, stateId: name === 'dirt' ? 10 : 0, boundingBox: name === 'air' ? 'empty' : 'block', shapes: name === 'air' ? [] : [[0,0,0,1,1,1]], getProperties: () => ({}) });
function fixture() {
  const world = new Map(), registry = dataFor(version), collections = new Map();
  const bot = new EventEmitter(); Object.assign(bot, { _client: new EventEmitter(), version, registry, health: 20, food: 20, game: { dimension: 'overworld' }, time: { timeOfDay: 1000 }, entity: { position: new Vec3(3,64,0), eyeHeight: 1.62, onGround: true }, entities: {},
    inventory: { items: () => [{ name: 'dirt', count: 64 }], emptySlotCount: () => 30 },
    blockAt: p => world.get(pos(p)) ?? block(p.y < 64 ? 'stone' : 'air', p), findBlock: () => null,
    pathfinder: { goto: async () => {}, stop() {}, setGoal() {} }, equip: async () => {}, lookAt: async () => {}, waitForTicks: async () => {},
    supportFeature: () => true, _syncWindow: async () => {},
  });
  const blueprint = validateBlueprint({ version, provenance: 'reconstructed', dimensions: { x: 4, y: 8, z: 4 }, blocks: Array.from({ length: 8 }, (_, y) => ({ x: 0, y, z: 0, name: 'oak_planks' })) });
  const project = { id: 'project', version, revision: 1, approvedRevision: 1, approvedHash: blueprintHash(blueprint), blueprint, assignments: [], reservations: {} };
  const store = { settings: () => ({ realmId: 1 }), get: name => [...(collections.get(name)?.values() ?? [])], put(name, value) { if (!collections.has(name)) collections.set(name, new Map()); collections.get(name).set(value.id, structuredClone(value)); } };
  project.construction = prepareConstruction(project, origin, bot, 1, { scaffolding: true, gatherMaterials: true, takeOverShares: false });
  store.put('projects', project);
  return { bot, project, store, world, save: p => store.put('projects', p) };
}

test('scaffold plan provides connected temporary access outside the blueprint with bounded cost', () => {
  const { project } = fixture(); const cells = project.construction.scaffolds;
  assert.ok(cells.length > 20 && cells.length <= 512);
  const positions = new Set(cells.map(entry => pos(entry.position)));
  assert.equal(positions.size, cells.length);
  assert.ok(cells.every(entry => entry.position.x < origin.x || entry.position.x >= origin.x + 4 || entry.position.z < origin.z || entry.position.z >= origin.z + 4));
  const reached = new Set(), queue = cells.filter(entry => entry.position.y === origin.y).map(entry => entry.position);
  while (queue.length) {
    const p = queue.shift(); if (reached.has(pos(p))) continue; reached.add(pos(p));
    for (const [x,y,z] of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]) {
      const neighbor = new Vec3(p.x+x,p.y+y,p.z+z); if (positions.has(pos(neighbor))) queue.push(neighbor);
    }
  }
  assert.equal(reached.size, cells.length, 'Every temporary block is connected to the grounded ramp');
});

test('worksite planning rejects occupied/unloaded terrain and excessive size before mutation', () => {
  const f = fixture(), first = f.project.construction.scaffolds[0].position;
  f.world.set(pos(first), block('diamond_block', new Vec3(first.x,first.y,first.z)));
  assert.throws(() => planScaffolding(f.project.blueprint, origin, f.bot), /occupied/);
  f.bot.blockAt = () => null; assert.throws(() => planScaffolding(f.project.blueprint, origin, f.bot), /entrance/);
  assert.throws(() => planScaffolding({ ...f.project.blueprint, dimensions: { x: 64, y: 8, z: 4 } }, origin, f.bot), /32/);
});

test('existing scaffold ownership prevents losing cleanup records through revision or site changes', () => {
  const f = fixture(); f.project.construction.scaffolds[0].status = 'placed';
  assert.throws(() => reviseProject(f.project, f.project.blueprint), /Clean up/);
  assert.throws(() => assertConstructionScope(f.project, { ...origin, x: 1 }, f.bot, 1), /another/);
  assert.throws(() => assertConstructionScope(f.project, origin, f.bot, 2), /another/);
  assert.equal(outstandingScaffolds(f.project).length, 1);
});

test('an unrelated block arriving while aiming is never claimed as an owned scaffold', async () => {
  const f = fixture(), p = new Vec3(0,64,0);
  f.bot.entity.position = new Vec3(-2,64,0);
  f.project.construction.scaffolds = [{ position: { x:0,y:64,z:0 }, kind:'access', status:'planned' }];
  let sent = 0;
  f.bot.waitForTicks = async () => { const placed = block('dirt',p); f.world.set(pos(p),placed); f.bot.emit('blockUpdate',block('air',p),placed); };
  f.bot._genericPlace = async () => sent++;
  const controller = createScaffoldController({ ...f, signal: new AbortController().signal, ensureMaterials: async () => {} });
  await assert.rejects(controller.build(), /changed while aiming/);
  assert.equal(sent,0); assert.equal(outstandingScaffolds(f.project).length,0); assert.equal(f.bot.blockAt(p).name,'dirt');
});

test('unacknowledged scaffold intents and replaced owned blocks cannot be cleaned up', async () => {
  const f = fixture(), p = new Vec3(0,64,0);
  f.project.construction.scaffolds = [{ position:{x:0,y:64,z:0}, kind:'access', status:'intent' }];
  f.world.set(pos(p),block('dirt',p));
  const controller=createScaffoldController({...f,signal:new AbortController().signal,ensureMaterials:async()=>{}});
  await assert.rejects(controller.cleanup(), /Unconfirmed/);
  assert.equal(f.project.construction.scaffolds[0].status,'uncertain');
  f.project.construction.scaffolds[0].status='placed';f.project.construction.scaffolds[0].stateId=10;
  f.world.set(pos(p),block('diamond_block',p));await assert.rejects(controller.cleanup(),/replacement/);
});

test('construction digging cannot start after cancellation while aiming', async () => {
  const f = fixture(), controller = new AbortController(); let digs = 0;
  f.bot.waitForTicks = async () => controller.abort(new Error('Paused while aiming'));
  f.bot.dig = async () => digs++;
  await assert.rejects(digConstructionBlock(f.bot, block('dirt', new Vec3(0,64,0)), controller.signal), /Paused/);
  assert.equal(digs, 0);
});

test('construction approach recomputes a bounded route after a transient navigation failure', async () => {
  const f=fixture();f.bot.entity.position=new Vec3(20,64,20);let attempts=0;
  f.bot.pathfinder.goto=async goal=>{
    if(++attempts===1)throw new Error('Path stalled');
    const target=goal.goals[0]; f.bot.entity.position=new Vec3(target.x+.5,target.y,target.z+.5);
  };
  await approach(f.bot,new Vec3(0,64,0),new AbortController().signal,1);
  assert.equal(attempts,2);
});

test('scaffold ownership follows observed grass growth but never a break and replacement', async () => {
  const f = fixture(), p = new Vec3(0,64,0), dirt = block('dirt',p), grass = block('grass_block',p);
  f.project.construction.scaffolds = [{ position:{x:0,y:64,z:0},kind:'access',status:'placed',stateId:dirt.stateId }];
  f.world.set(pos(p),dirt);
  const controller=createScaffoldController({...f,signal:new AbortController().signal,ensureMaterials:async()=>{}});
  f.world.set(pos(p),grass); f.bot.emit('blockUpdate',dirt,grass);
  await controller.reconcile();
  assert.equal(f.project.construction.scaffolds[0].observedName,'grass_block');
  const air=block('air',p); f.world.set(pos(p),air); f.bot.emit('blockUpdate',grass,air);
  f.world.set(pos(p),grass); f.bot.emit('blockUpdate',air,grass);
  assert.equal(outstandingScaffolds(f.project).length,0,'Replacement is not owned');
  await assert.rejects(controller.build(),/occupied|changed/);
  controller.close(); assert.equal(f.bot.listenerCount('blockUpdate'),0);
});

test('unobserved grass conversion cannot silently inherit scaffold ownership after reconnect', async () => {
  const f=fixture(),p=new Vec3(0,64,0);
  f.project.construction.scaffolds=[{position:{x:0,y:64,z:0},kind:'access',status:'placed',stateId:10}];
  f.world.set(pos(p),block('grass_block',p));
  const controller=createScaffoldController({...f,signal:new AbortController().signal,ensureMaterials:async()=>{}});
  await assert.rejects(controller.reconcile(),/replacement/); controller.close();
});

test('construction digging cancels the actual active mining operation', async () => {
  const f = fixture(), controller = new AbortController(), target = block('dirt', new Vec3(0,64,0)); let stops = 0;
  f.world.set(pos(target.position), target);
  f.bot.stopDigging = () => stops++;
  f.bot.dig = async () => { controller.abort(new Error('Paused while mining')); return new Promise(() => {}); };
  await assert.rejects(digConstructionBlock(f.bot, target, controller.signal), /Paused/);
  assert.equal(stops, 1);
});

test('construction mining waits for server removal rather than optimistic client air', async () => {
  const f=fixture(),p=new Vec3(0,64,0),target=block('dirt',p); f.world.set(pos(p),target);
  f.bot.dig=async()=>{f.world.set(pos(p),block('air',p));}; f.bot.stopDigging=()=>{};
  let finished=false;
  const digging=digConstructionBlock(f.bot,target,new AbortController().signal).then(()=>finished=true);
  await new Promise(resolve=>setTimeout(resolve,40)); assert.equal(finished,false);
  f.bot._client.emit('block_change',{location:p,type:f.bot.registry.blocksByName.air.minStateId});
  await digging; assert.equal(finished,true); assert.equal(f.bot._client.listenerCount('block_change'),0);
});

test('raw gathering requires the correct Realm mining area and protects all build footprints', () => {
  const f=fixture();f.bot.findBlocks=()=>[];
  assert.throws(()=>rawTargets(f.bot,f.store,f.project,'dirt',4),/Approve a mining area/);
  f.store.put('workAreas',{id:'mining',realmId:2,dimension:'overworld',position:{x:20,y:64,z:0},radius:8});
  assert.throws(()=>rawTargets(f.bot,f.store,f.project,'dirt',4),/Approve a mining area/);
  assert.equal(protectedResourcePosition(f.store,f.project,new Vec3(1,64,1)),true);
  assert.equal(protectedResourcePosition(f.store,f.project,new Vec3(20,64,0)),false);
  f.store.put('locations',{id:'home',name:'base',realmId:1,dimension:'overworld',position:{x:20,y:64,z:0}});
  assert.equal(protectedResourcePosition(f.store,f.project,new Vec3(20,64,0)),true);
});

test('gathering respects shares, existing stock credits, pause and poor survival conditions', async () => {
  const f=fixture(), gather=createRawGatherer(f), signal=new AbortController().signal;
  f.project.assignments=[{material:'oak_log',aiRequired:4,total:8,userProgress:0}];f.store.put('projects',f.project);
  f.project.construction.startingAssignedStock={oak_log:4};
  await assert.rejects(gather('oak_log',4,signal),/assigned share/);
  f.bot.health=4;await assert.rejects(gather('oak_log',4,signal),/six hearts/);
  const stopped=new AbortController();stopped.abort(new Error('Paused'));await assert.rejects(gather('oak_log',4,stopped.signal),/Paused/);
});

test('raw search filters buried and protected blocks before the library candidate limit', () => {
  const f = fixture(), source = block('stone',new Vec3(20,64,0));
  f.store.put('workAreas',{id:'mining',realmId:1,dimension:'overworld',position:{x:20,y:64,z:0},radius:8});
  f.world.set(pos(source.position),source);
  f.bot.findBlocks = options => {
    assert.equal(options.useExtraInfo(block('stone',new Vec3(20,63,0))),false);
    assert.equal(options.useExtraInfo(block('stone',new Vec3(0,64,0))),false);
    assert.equal(options.useExtraInfo(source),true);
    return [source.position];
  };
  assert.deepEqual(rawTargets(f.bot,f.store,f.project,'cobblestone',1),[source]);
});


test('construction plan API preserves approval and rejects paused planning and forged policy', async t => {
  const f=fixture(),runtime=new EventEmitter();let active=false;
  runtime.bot=f.bot;runtime.isActive=()=>active;runtime.snapshot=()=>({state:active?'ACTIVE':'PAUSED',world:{inventory:[],inventoryExact:true,observedAt:'now'}});
  const app=Fastify();registerBuildRoutes(app,{store:f.store,runtime,publish(){}});t.after(()=>app.close());
  const url=`/api/projects/${f.project.id}/construction-plan`,payload={origin,policy:{scaffolding:true,gatherMaterials:true,takeOverShares:true}};
  assert.equal((await app.inject({method:'POST',url,payload})).statusCode,400);
  active=true;const response=await app.inject({method:'POST',url,payload});assert.equal(response.statusCode,200,response.body);
  assert.equal(response.json().approvedHash,f.project.approvedHash);assert.ok(response.json().construction.scaffolds.length);
  assert.equal((await app.inject({method:'POST',url,payload:{...payload,policy:{...payload.policy,scaffoldMaterial:'diamond_block'}}})).statusCode,400);
});
