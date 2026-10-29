import { z } from 'zod';
import { Vec3 } from 'vec3';
import { blueprintHash } from '../build-planner/blueprint.js';
import { EMPTY, fullCube, FACES, placementKind } from './placement.js';

export const CONSTRUCTION_LIMITS = Object.freeze({ height: 16, width: 32, depth: 32, scaffolds: 512, resourceRadius: 64, gatherBatch: 16 });
export const constructionPolicy = z.object({ scaffolding: z.boolean().default(false), gatherMaterials: z.boolean().default(false), takeOverShares: z.boolean().default(false), scaffoldMaterial: z.enum(['dirt', 'cobblestone']).default('dirt') }).strict();
export const positionKey = p => `${p.x},${p.y},${p.z}`;
export const vector = p => new Vec3(p.x, p.y, p.z);
export const outstandingScaffolds = project => (project.construction?.scaffolds ?? []).filter(entry => ['intent', 'placed', 'uncertain'].includes(entry.status));
export function assertConstructionEditable(project) {
  if (outstandingScaffolds(project).length) throw new Error('Clean up the recorded temporary scaffolds before revising or replacing this build. Their ownership records must be preserved.');
  if (project.construction?.rawIntent) throw new Error('Resume the interrupted resource trip to reconcile its mining checkpoint before replacing the plan.');
}
export function assertConstructionScope(project, origin, bot, realmId) {
  const saved = project.construction;
  if (!saved) return;
  if (saved.revision !== project.revision || saved.blueprintHash !== blueprintHash(project.blueprint) || saved.realmId !== realmId || saved.dimension !== bot.game.dimension || positionKey(saved.origin) !== positionKey(origin)) throw new Error('Automatic construction plan belongs to another revision, site, Realm or dimension. Prepare a new plan after cleanup.');
}

export function planScaffolding(blueprint, origin, bot) {
  const { x: width, y: height, z: depth } = blueprint.dimensions;
  if (width > CONSTRUCTION_LIMITS.width || depth > CONSTRUCTION_LIMITS.depth || height > CONSTRUCTION_LIMITS.height) throw new Error('Automatic scaffolds support builds up to 32 × 16 × 32 blocks. Split larger designs into smaller approved projects.');
  const base = vector(origin), planned = new Map(), blueprintPositions = new Map(blueprint.blocks.map(block => [positionKey(base.offset(block.x, block.y, block.z)), block]));
  const add = (p, kind) => {
    const key = positionKey(p);
    if (blueprintPositions.has(key)) throw new Error(`Temporary scaffold would overlap the approved design at ${key}.`);
    if (!EMPTY.has(bot.blockAt(p)?.name)) throw new Error(`Scaffold space ${key} is occupied or unloaded. Existing terrain is protected; choose a clear site.`);
    if (!planned.has(key)) planned.set(key, { position: { x: p.x, y: p.y, z: p.z }, kind, status: 'planned' });
    if (planned.size > CONSTRUCTION_LIMITS.scaffolds) throw new Error('Automatic scaffold plan exceeds 512 temporary blocks. Split the build into sections.');
  };
  const levels = [];
  const highest = Math.max(...blueprint.blocks.map(block => block.y), 0);
  const top = highest >= 4 ? highest - 2 : -1;
  if (top >= 0) {
    for (let level = top; level >= 1; level -= 3) levels.unshift(level);
    // A normal walkable stair ramp, never a jump-tower. All access stays outside
    // the design; full cubes have no gravity and can form cantilevered walkways.
    const entrance = base.offset(-2, -1, -top - 2);
    if (!fullCube(bot.blockAt(entrance)) || /magma|cactus/.test(bot.blockAt(entrance).name)) throw new Error('Scaffold ramp needs an observed solid, safe ground entrance northwest of the build.');
    for (let y = 0; y <= top; y++) {
      const p = base.offset(-2, y, -top - 2 + y);
      if (y) add(p.offset(0, -1, 0), 'access');
      add(p, 'access');
    }
    for (const y of levels) {
      for (let z = -top - 2 + y; z <= -1; z++) add(base.offset(-1, y, z), 'access');
      for (let x = 0; x <= width; x++) add(base.offset(x, y, -1), 'access');
      for (let z = 0; z <= depth; z++) add(base.offset(width, y, z), 'access');
      for (let x = width - 1; x >= -1; x--) add(base.offset(x, y, depth), 'access');
      for (let z = depth - 1; z >= 0; z--) add(base.offset(-1, y, z), 'access');
    }
  }
  // Top slabs/stairs and horizontal pillars sometimes need a temporary side
  // face. Plan those braces now so no unreviewed extra worksite appears later.
  for (const expected of blueprint.blocks) {
    const kind = placementKind(expected, blueprint.version), properties = expected.properties ?? {};
    if (!(kind === 'axis' && ['x', 'z'].includes(properties.axis)) && !(kind === 'slab' && properties.type === 'top') && !(kind === 'stairs' && properties.half === 'top')) continue;
    const position = base.offset(expected.x, expected.y, expected.z);
    const faces = FACES.filter(face => kind === 'axis' ? Math.abs(face[properties.axis]) === 1 : face.y === 0);
    const permanentSupport = p => {
      const design = blueprintPositions.get(positionKey(p));
      return fullCube(bot.blockAt(p)) || (design && (['cube', 'axis'].includes(placementKind(design, blueprint.version)) || (design.name.endsWith('_slab') && design.properties?.type === 'double')));
    };
    if (faces.some(face => permanentSupport(position.minus(face)))) continue;
    let column;
    for (const face of faces) {
      const candidate = [], topPosition = position.minus(face);
      let supported = false;
      for (let y = topPosition.y; y >= origin.y - 1; y--) {
        const p = new Vec3(topPosition.x, y, topPosition.z);
        if (permanentSupport(p)) { supported = true; break; }
        if (blueprintPositions.has(positionKey(p)) || !EMPTY.has(bot.blockAt(p)?.name)) break;
        candidate.push(p);
      }
      if (supported) { column = candidate.reverse(); break; }
    }
    if (!column) throw new Error(`No safe temporary brace for ${expected.name} at ${position}. Change its support or site before construction.`);
    for (const p of column) add(p, 'brace');
  }
  // Leave two blocks of headroom over the access walkways. Existing structures
  // are not cleared merely because their cells are absent from the blueprint.
  for (const entry of planned.values()) if (entry.kind === 'access') for (const dy of [1, 2]) {
    const p = vector(entry.position).offset(0, dy, 0);
    if (!EMPTY.has(bot.blockAt(p)?.name)) throw new Error(`Scaffold headroom is obstructed at ${p}. No automatic clearing is allowed.`);
  }
  return [...planned.values()].sort((a, b) => a.position.y - b.position.y);
}

export function prepareConstruction(project, origin, bot, realmId, policy) {
  assertConstructionEditable(project);
  policy = constructionPolicy.parse(policy);
  const scaffolds = policy.scaffolding ? planScaffolding(project.blueprint, origin, bot) : [];
  let workbench = null;
  if (policy.gatherMaterials && !bot.findBlock({ point: vector(origin), matching: bot.registry.blocksByName.crafting_table.id, maxDistance: 32 })) {
    const p = vector(origin).offset(-3, 0, 1);
    if (!EMPTY.has(bot.blockAt(p)?.name) || !fullCube(bot.blockAt(p.offset(0, -1, 0)))) throw new Error('The automatic workbench needs a clear, grounded spot three blocks west of the build. Choose a clear site or provide a nearby crafting table.');
    workbench = { position: { x: p.x, y: p.y, z: p.z }, status: 'planned', extraPlanks: 4 };
  }
  const old = project.construction;
  const sameWorksite = old && old.blueprintHash === blueprintHash(project.blueprint) && old.realmId === realmId && old.dimension === bot.game.dimension && positionKey(old.origin) === positionKey(origin);
  const startingAssignedStock = Object.fromEntries((project.assignments ?? []).map(assignment => [assignment.material, Math.min(assignment.aiRequired, assignment.aiProgress ?? 0)]));
  return { origin, realmId, dimension: bot.game.dimension, revision: project.revision, blueprintHash: blueprintHash(project.blueprint), policy, scaffolds, workbench, gathered: sameWorksite ? old.gathered : {}, mined: sameWorksite ? old.mined : {}, supportGathered: sameWorksite ? old.supportGathered : {}, supportMined: sameWorksite ? old.supportMined : {}, startingAssignedStock: sameWorksite ? old.startingAssignedStock : startingAssignedStock, preparedAt: new Date().toISOString(), phase: 'prepared' };
}
