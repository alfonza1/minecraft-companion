import { acquisitionAdvice } from '../../services/resource-ledger/acquisition.js';
import { constructionSatisfaction } from '../../services/resource-ledger/construction-credit.js';

export const WORLD_STALE_MS = 15_000;
export const STORAGE_STALE_MS = 5 * 60_000;
const label = value => String(value || '').replaceAll('_', ' ');
const counts = items => (items || []).reduce((result, item) => { result[item.name] = (result[item.name] || 0) + item.count; return result; }, {});
const fresh = (at, now, maxAge) => Boolean(at) && Number.isFinite(Date.parse(at)) && now - Date.parse(at) >= 0 && now - Date.parse(at) <= maxAge;
export const minecraftDescriptor = Object.freeze({
  apiVersion: 1, id: 'minecraft-survival', name: 'Minecraft Survival', status: 'early-access', playable: true,
  capabilities: ['Observed inventory', 'Voice conversation', 'Bounded survival skills', 'Approved construction', 'Shared resource plans'],
  requirements: ['Minecraft Java bot account', 'Realm invitation', 'Windows for secure account login and desktop voice'],
  widgets: ['minecraft-inventory', 'minecraft-vitals', 'minecraft-build-studio'],
  actions: ['chop_tree', 'gather_blocks', 'craft_item', 'follow_player', 'goto', 'find_resource', 'resume_approved_build'],
  safety: ['One body, one active execution controller', 'Approved terrain and build plans', 'Pause gates new gameplay and inference', 'Only loaded world observations are known'],
});

function validVerified(project) {
  if (project.checkpoint?.revision !== project.revision) return [];
  const blocks = project.blueprint?.blocks || [];
  return [...new Set(project.checkpoint.verified || [])].filter(index => Number.isInteger(index) && index >= 0 && index < blocks.length);
}

function consumedItem(block) {
  if (block.properties?.half === 'upper' || (block.name.endsWith('_bed') && block.properties?.part === 'head')) return null;
  const name = block.name.replace(/^wall_torch$/, 'torch').replace(/^soul_wall_torch$/, 'soul_torch').replace(/^redstone_wall_torch$/, 'redstone_torch').replace(/_wall_sign$/, '_sign').replace(/_wall_hanging_sign$/, '_hanging_sign');
  return { name, count: block.name.endsWith('_slab') && block.properties?.type === 'double' ? 2 : 1 };
}

function reservationAllocator(projects, stock) {
  const free={...stock},reserved=new Map();
  // Protect every owner's reservation once before assigning unreserved stock.
  // Deducting other reservations from a shrinking pool would count them twice.
  for(const project of projects){
    const own={};
    for(const [name,quantity] of Object.entries(project.reservations || {})){
      const held=Math.min(free[name] || 0,Number.isSafeInteger(quantity)?Math.max(0,quantity):0);
      own[name]=held;free[name]=(free[name] || 0)-held;
    }
    reserved.set(project.id,own);
  }
  return (projectId,name,demand)=>{
    const own=reserved.get(projectId),protectedStock=Math.min(demand,own?.[name] || 0);
    const sharedStock=Math.min(Math.max(0,demand-protectedStock),free[name] || 0);
    if(own)own[name]=(own[name] || 0)-protectedStock;
    free[name]=(free[name] || 0)-sharedStock;
    return protectedStock+sharedStock;
  };
}

export function projectResources(state, context = {}) {
  const projects = [...(state.projects || [])].sort((a,b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')) || a.id.localeCompare(b.id));
  const exact = Boolean(state.world && fresh(state.world.observedAt,context.now ?? Date.now(),WORLD_STALE_MS) && state.world.inventoryExact !== false && !state.connection?.projected && state.connection?.status === 'connected');
  const stock = counts(exact ? state.world.inventory : []), allocatePlacement=reservationAllocator(projects,stock),allocateRaw=reservationAllocator(projects,stock),rows = [];
  const stores = context.storage || [];
  for (const project of projects) {
    const consumed = counts(validVerified(project).map(index => consumedItem(project.blueprint.blocks[index])).filter(Boolean));
    const requirements = project.materials?.craftedItems || project.materials?.placed || [];
    for (const requirement of requirements) {
      const name = requirement.name, required = requirement.quantity;
      const verifiedPlaced = Math.min(required, consumed[name] || 0), remainingToPlace = Math.max(0, required - verifiedPlaced);
      const reservedElsewhere = projects.filter(other => other.id !== project.id).reduce((sum, other) => sum + (other.reservations?.[name] || 0), 0);
      const availableForProject = exact ? allocatePlacement(project.id,name,remainingToPlace) : null;
      const relevantStores = stores.filter(chest => chest.realmId === state.settings?.realmId && chest.dimension === state.world?.dimension && chest.approved !== false && (chest.allowedItems || []).includes(name));
      const storage = relevantStores.reduce((sum, chest) => sum + (counts(chest.inventory)[name] || 0), 0);
      const storageObservedAt = relevantStores.map(chest => chest.observedAt).filter(Boolean).sort()[0] || null;
      const assignment = project.assignments?.find(value => value.material === name), advice = acquisitionAdvice(name),responsibility=project.materialResponsibilities?.[name];
      rows.push({ id: `${project.id}:placement:${name}`, kind:'placement', projectId: project.id, projectName: project.name, name, required, inventory: exact ? stock[name] || 0 : null,
        storage, storageObservedAt, reservedElsewhere, verifiedPlaced, remainingToPlace, availableForProject,
        missing: availableForProject === null ? null : Math.max(0, remainingToPlace - availableForProject),
        userAssigned: assignment?.userRequired || (responsibility?.owner==='player'?responsibility.quantity:0), agentAssigned: assignment?.aiRequired || (responsibility?.owner==='companion'?responsibility.quantity:0), userReported: assignment?.userProgress || 0,
        agentAllocated: assignment?.aiProgress || 0, source: project.materials?.accuracy || 'unresolved', difficulty: advice.difficulty, reason: advice.reason,
        gathering: Boolean(state.currentTask && (state.currentTask.descriptor?.args?.item === name || state.currentTask.descriptor?.args?.block === name || state.currentTask.descriptor?.tool === 'chop_tree' && name.endsWith('_log'))),
      });
    }
    const credit=constructionSatisfaction(project);
    for(const requirement of project.materials?.raw || []){
      const name=requirement.name,required=requirement.quantity,verifiedPlaced=Math.min(required,credit[name]||0),remainingToPlace=Math.max(0,required-verifiedPlaced);
      const assignment=project.assignments?.find(value=>value.material===name),advice=acquisitionAdvice(name);
      const reservedElsewhere=projects.filter(other=>other.id!==project.id).reduce((sum,other)=>sum+(other.reservations?.[name]||0),0);
      const availableForProject=exact?allocateRaw(project.id,name,remainingToPlace):null;
      const storesForItem=stores.filter(chest=>chest.realmId===state.settings?.realmId&&chest.dimension===state.world?.dimension&&chest.approved!==false&&(chest.allowedItems||[]).includes(name));
      rows.push({id:`${project.id}:raw:${name}`,kind:'raw',projectId:project.id,projectName:project.name,name,required,inventory:exact?stock[name]||0:null,
        storage:storesForItem.reduce((sum,chest)=>sum+(counts(chest.inventory)[name]||0),0),storageObservedAt:storesForItem.map(chest=>chest.observedAt).filter(Boolean).sort()[0]||null,
        reservedElsewhere,verifiedPlaced,remainingToPlace,availableForProject,
        missing:availableForProject===null?null:Math.max(0,remainingToPlace-availableForProject),userAssigned:assignment?.userRequired||0,agentAssigned:assignment?.aiRequired||0,userReported:assignment?.userProgress||0,agentAllocated:assignment?.aiProgress||0,
        source:'recipe-derived-raw',difficulty:advice.difficulty,reason:advice.reason,gathering:Boolean(state.currentTask&&(state.currentTask.descriptor?.args?.item===name||state.currentTask.descriptor?.args?.block===name||state.currentTask.descriptor?.tool==='chop_tree'&&name.endsWith('_log')))});
    }
  }
  return rows;
}

export function activityProgress(state,now=Date.now()) {
  const task = state.currentTask, descriptor = task?.descriptor;
  if (!descriptor || !Number.isSafeInteger(descriptor.args?.count) || !state.world || !fresh(state.world.observedAt,now,WORLD_STALE_MS) || state.world.inventoryExact === false || state.connection?.projected || state.connection?.status !== 'connected') return null;
  const total = descriptor.args.count, current = counts(state.world.inventory), before = task.baselineInventory;
  if (!before || total < 1) return null;
  let names = [];
  if (descriptor.tool === 'chop_tree') names = Object.keys(current).filter(name => descriptor.args.species ? name === `${descriptor.args.species.replace(/_log$/, '')}_log` : name.endsWith('_log'));
  if (descriptor.tool === 'craft_item') names = [descriptor.args.item];
  if (descriptor.tool === 'gather_blocks') names = [({stone:'cobblestone',deepslate:'cobbled_deepslate',grass_block:'dirt'})[descriptor.args.block] || descriptor.args.block];
  if (!names.length) return null;
  const completed = Math.min(total, names.reduce((sum, name) => sum + Math.max(0, (current[name] || 0) - (before[name] || 0)), 0));
  return { completed, total, unit: 'items', basis: 'Net observed inventory increase during this action; transfers can affect this count.' };
}

function activity(state, assistance,now) {
  const frame = state.taskStack?.frames?.at(-1), task = state.currentTask;
  const tool = task?.descriptor?.tool || task?.tool || null;
  let status = 'idle', detail = 'Ready for a conversation or an approved goal.';
  if (state.state === 'DISCONNECTED') status = 'disconnected';
  else if (state.state === 'PAUSED') status = 'paused';
  else if (state.connection?.status === 'reconnecting') status = 'recovering';
  else if (state.ai?.modelState?.active) status = 'planning';
  else if (task) {
    status = /chop|gather|hunt|find_food/.test(tool) ? 'gathering' : /craft|cook|prepare|gear/.test(tool) ? 'crafting' : /build/.test(tool) ? 'building' : /explore|find_resource/.test(tool) ? 'exploring' : /goto|follow|visit|return/.test(tool) ? 'navigating' : 'executing';
    detail = task.summary || label(tool);
  } else if (frame?.status === 'blocked' || state.state === 'ERROR') { status = 'blocked'; detail = frame?.error || state.connection?.error || 'A task needs attention.'; }
  else if (frame?.owner === 'player' || frame?.status === 'deferred') { status = 'waiting for player'; detail = frame.owner==='player'?`You claimed ${frame.label}. Transfer it back before asking the companion to resume.`:`${frame.label} is deferred. Resume explicitly when you are ready.`; }
  else if (assistance.some(request => request.status === 'accepted' && request.owner === 'player')) { status = 'waiting for player'; detail = 'An accepted help request is waiting for your supplies or instructions.'; }
  const next = frame?.actions?.slice(frame.step || 1).map(action => label(action.tool)) || [];
  return { state: status, label: task ? label(task.name || tool) : label(status), detail, tool, progress: activityProgress(state,now), next };
}

export const minecraftAdapter = {
  descriptor: minecraftDescriptor,
  project(state, context = {}) {
    const now = context.now ?? Date.now(), assistance = context.assistance || [];
    const resources = projectResources(state, context), current = activity(state, assistance,now);
    const project = (state.projects || []).find(value => ['building','blocked','paused'].includes(value.status)) || state.projects?.[0];
    const blocks = project?.blueprint?.blocks || [], verified = new Set(project ? validVerified(project) : []), sections = new Map();
    blocks.forEach((block,index) => { const key = block.section || 'Structure'; const section = sections.get(key) || { name:key, verified:0, total:0 }; section.total++; if (verified.has(index)) section.verified++; sections.set(key,section); });
    const frame = state.taskStack?.frames?.at(-1);
    const buildIsActive=/build/.test(current.tool || '');
    const activeGoal=frame ? {id:frame.id,title:frame.label,status:frame.status,progress:current.progress,sections:[],verifiedAt:null} : state.currentTask ? {id:state.currentTask.id,title:label(state.currentTask.name || current.tool),status:state.currentTask.status,progress:current.progress,sections:[],verifiedAt:null} : null;
    const projectGoal=project ? { id:project.id,title:project.name,status:project.status,progress:blocks.length?{completed:verified.size,total:blocks.length,unit:'placements',basis:'Last verified checkpoint for this blueprint revision; unseen changes require reinspection.'}:null,sections:[...sections.values()],verifiedAt:project.checkpoint?.updatedAt || null } : null;
    const mission=buildIsActive?projectGoal || activeGoal:activeGoal || projectGoal;
    const frames = (state.taskStack?.frames || []).map(value => ({id:value.id,title:value.label,status:value.status,owner:value.owner||'companion',revision:value.revision||0,error:value.error,actions:value.actions || [],step:value.step,steps:value.steps}));
    const seen = new Set(frames.map(value => value.id));
    const tasks = [...frames,...(state.tasks || []).filter(value => !seen.has(value.id)).slice(-30).reverse().map(value => ({id:value.id,title:label(value.name||value.tool),status:value.status,owner:'companion',error:value.summary,actions:value.descriptor?[value.descriptor]:[]}))];
    return {schemaVersion:1,game:structuredClone(minecraftDescriptor),
      session:{id:`minecraft-survival:${state.settings?.realmId || 'offline'}`,gameId:'minecraft-survival',status:state.connection?.status || 'offline',connected:state.connection?.status==='connected',observedAt:state.world?.observedAt || null,stale:!fresh(state.world?.observedAt,now,WORLD_STALE_MS)},
      companion:{name:context.companionName || state.connection?.username || 'Companion',status:current.state},activity:current,mission,resources,assistance,tasks,
      environment:{position:state.world?.position||null,dimension:state.world?.dimension||null,health:state.world?.health??null,food:state.world?.food??null,observedAt:state.world?.observedAt||null},
      storage:(context.storage || []).map(chest=>({id:chest.id,name:chest.name,observedAt:chest.observedAt||null,stale:!fresh(chest.observedAt,now,STORAGE_STALE_MS),inventory:chest.inventory||[],realmId:chest.realmId,dimension:chest.dimension})),
    };
  },
};
