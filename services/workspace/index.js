import { createGameRegistry } from '../../packages/game-adapters/index.js';
import { minecraftAdapter, WORLD_STALE_MS } from '../../packages/game-adapters/minecraft.js';

const human = value => String(value || '').replaceAll('_', ' ');
const now = () => new Date().toISOString();
const failure = (message, statusCode = 409) => Object.assign(new Error(message), { statusCode });

function assistanceSources(raw, store) {
  const projects = store.get('projects'), sources = [];
  for (const request of store.get('materialRequests')) {
    const project = projects.find(value => value.id === request.projectId);
    const current = project && project.revision === request.revision;
    sources.push({id:`material:${request.id}`,type:'materials',title:`${request.count} ${human(request.item)} needed`,detail:request.reason || 'Materials are needed before this section can continue.',
      projectId:request.projectId,projectRevision:request.revision,item:request.item,count:request.count,priority:'normal',realmId:request.realmId,dimension:request.dimension,
      sourceStatus:!current?'superseded':request.status==='supplied'?'resolved':'pending',
      actions:['player','companion','replan','defer'],sourceAt:request.at});
  }
  const frames = raw.taskStack?.frames || store.get('taskStack').find(value=>value.id==='active')?.frames || [];
  for (const frame of frames.filter(value => value.status === 'blocked')) {
    if (sources.some(source => source.sourceStatus === 'pending' && frame.error?.includes(human(source.item)))) continue;
    sources.push({id:`task:${frame.id}`,type:'recovery',title:`Help with ${frame.label || 'saved work'}`,detail:frame.error || 'Saved work is blocked. Review the situation before retrying.',taskId:frame.id,priority:'normal',sourceStatus:'pending',actions:['replan','defer'],sourceAt:frame.at || null});
  }
  return sources;
}

function sourceFingerprint(source) {
  return JSON.stringify([source.title,source.detail,source.count,source.projectRevision,source.sourceStatus,source.realmId,source.dimension]);
}

function mergeRequest(source, record) {
  const changed = record && record.sourceFingerprint !== sourceFingerprint(source);
  const resolved = source.sourceStatus !== 'pending';
  return { ...source, id:source.id, revision:record ? record.revision + (changed ? 1 : 0) : 0,
    status:resolved?'resolved':changed?'pending':record?.status || 'pending',
    owner:changed?undefined:record?.owner, updatedAt:changed || !record ? source.sourceAt || now() : record.updatedAt,
    resolution:resolved?(source.sourceStatus==='superseded'?'The source project revision was replaced or removed.':'Supplies were observed by the construction controller.'):changed?undefined:record?.resolution,
    sourceFingerprint:sourceFingerprint(source),
    lastAction:changed?undefined:record?.lastAction,
  };
}

function publicRequest(record) {
  const {sourceFingerprint:_,sourceStatus:_status,sourceAt:_at,projectRevision:_revision,...request}=record;
  return {...request,actions:record.status==='resolved'?[]:request.actions};
}

export function createWorkspaceService({runtime,store,teammate,publish=()=>{},clock=Date.now}) {
  const registry = createGameRegistry([minecraftAdapter]);
  let mutations = Promise.resolve();
  function sync() {
    const sources=assistanceSources(runtime.snapshot(),store), ids=new Set(sources.map(source=>source.id));
    const records=store.get('assistance'),byId=new Map(records.map(record=>[record.id,record]));
    for(const source of sources){
      const previous=byId.get(source.id),next=mergeRequest(source,previous);
      if(!previous || JSON.stringify(next)!==JSON.stringify(previous))store.put('assistance',next);
    }
    for(const record of records)if(!ids.has(record.id)&&record.status!=='resolved')store.put('assistance',{...record,revision:record.revision+1,status:'resolved',resolution:'The originating task no longer needs this request.',updatedAt:now()});
  }
  function requests(raw) {
    const persisted=store.get('assistance'),sources=assistanceSources(raw,store),ids=new Set(sources.map(source=>source.id));
    return [...sources.map(source=>mergeRequest(source,persisted.find(record=>record.id===source.id))),...persisted.filter(record=>!ids.has(record.id))].map(publicRequest).sort((a,b)=>a.status==='resolved'?1:b.status==='resolved'?-1:String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0,100);
  }
  function snapshot(raw) {
    const observations={state:raw.state,connection:raw.connection,world:raw.world,currentTask:raw.currentTask,taskStack:raw.taskStack,tasks:raw.tasks,projects:raw.projects,settings:{realmId:raw.settings?.realmId},ai:{modelState:{active:Boolean(raw.ai?.modelState?.active)}}};
    return registry.project('minecraft-survival',observations,{storage:store.get('supplyChests'),assistance:requests(raw),companionName:store.get('companionProfile').find(value=>value.id==='profile')?.name});
  }
  function assignment(projectId,item,owner,expectedRevision,quantity) {
    const project=store.get('projects').find(value=>value.id===projectId);
    if(!project||project.revision!==expectedRevision)throw failure('This project changed. Review the latest material plan before assigning it.');
    const previous=project.materialResponsibilities?.[item];
    const requestedTransfer=previous?.revision===expectedRevision&&previous.owner===owner?Math.max(0,quantity-previous.quantity):quantity;
    const assignments=(project.assignments||[]).map(value=>{
      if(value.material!==item)return value;
      const transfer=Math.min(requestedTransfer,owner==='companion'?value.userRequired:value.aiRequired);
      return {...value,aiRequired:value.aiRequired+(owner==='companion'?transfer:-transfer),userRequired:value.userRequired+(owner==='player'?transfer:-transfer)};
    });
    store.put('projects',{...project,assignments,materialResponsibilities:{...project.materialResponsibilities,[item]:{owner,quantity,revision:expectedRevision}}});
    const request=store.get('materialRequests').find(value=>value.projectId===projectId&&value.revision===expectedRevision&&value.item===item);
    if(request)store.put('materialRequests',{...request,owner});
  }
  function currentRequest(request) {
    sync();
    const latest=store.get('assistance').find(value=>value.id===request.id);
    if(!latest||latest.status==='resolved'||latest.revision!==request.revision)throw failure('This request changed while work was being saved. Review its latest version.');
    return latest;
  }
  function requireGameplay(request) {
    const age=clock()-Date.parse(runtime.world?.observedAt);
    if(!runtime.isActive()||runtime.connection.status!=='connected'||!runtime.world||runtime.world.inventoryExact===false||runtime.connection.projected||!Number.isFinite(age)||age<0||age>WORLD_STALE_MS)throw failure('Resume a connected native game session with fresh observations before assigning gameplay.');
    if(request.realmId!=null&&String(request.realmId)!==String(store.settings().realmId)||request.dimension&&request.dimension!==runtime.world.dimension)throw failure('This request belongs to another Realm or dimension. Return there before assigning gameplay.');
  }
  async function act(id,{action,revision}) {
    sync();
    const request=store.get('assistance').find(value=>value.id===id);
    if(!request)throw failure('Assistance request not found.',404);
    if(request.status==='resolved')throw failure('This assistance request is already resolved.');
    if(request.revision!==revision)throw failure('This request changed. Review its latest version.');
    if(!request.actions.includes(action))throw failure('That response is not available for this request.');
    if(request.lastAction===action)return {request:publicRequest(request),outcome:request.resolution};
    const project=request.projectId?store.get('projects').find(value=>value.id===request.projectId):null;
    if(project&&project.revision!==request.projectRevision)throw failure('This project revision is no longer current.');
    let outcome='Response saved.',owner=request.owner,status='accepted';
    if(action==='defer'){status='deferred';outcome='Request deferred. The objective remains blocked; no supplies were assumed.';}
    if(action==='player'){
      const descriptor=runtime.currentTask?.descriptor;
      const matchingGather=descriptor?.tool==='chop_tree'&&request.item?.endsWith('_log')&&(!descriptor.args?.species||`${descriptor.args.species.replace(/_log$/,'')}_log`===request.item) || descriptor?.tool==='gather_blocks'&&descriptor.args?.block===request.item;
      if(matchingGather){runtime.taskStack?.hold();if(runtime.isActive())await runtime.suspendWork('Material gathering reassigned to the player.');}
      currentRequest(request);
      assignment(request.projectId,request.item,'player',request.projectRevision,request.count);owner='player';
      outcome='The requested material quantity is assigned to you. Report or deposit supplies when ready; accepting does not verify delivery.';
    }
    if(action==='replan'){
      runtime.taskStack?.hold();
      if(runtime.currentTask&&runtime.isActive())await runtime.suspendWork('Player requested a revised plan.');
      currentRequest(request);
      store.put('workspaceDecisions',{id:request.id,requestId:request.id,kind:'replan',detail:request.detail,at:now(),status:'awaiting-instructions'});
      outcome='Current work is held. Tell your companion how you want to change the plan; no model request was made.';
    }
    if(action==='companion'){
      requireGameplay(request);
      if(!runtime.taskStack)throw failure('Companion task service is not ready.');
      const log=request.item?.match(/^(oak|spruce|birch)_log$/);
      const operation=log?{tool:'chop_tree',args:{species:log[1],count:Math.min(64,request.count)}}:{tool:'find_resource',args:{item:request.item,radius:64,steps:3}};
      await runtime.taskStack.submit([operation],log?`Gather ${human(request.item)} for ${project.name}`:`Find a source of ${human(request.item)}`,{beforeEnqueue(){
        currentRequest(request);requireGameplay(request);
        if(log)assignment(request.projectId,request.item,'companion',request.projectRevision,request.count);
      }});
      if(log){owner='companion';outcome='A bounded gathering task was submitted. Previous work is saved; any remaining quantity stays in the project plan.';}
      else{owner='companion';outcome='A safe source-search task was submitted. Finding a source does not collect it; material ownership and delivery counts were not changed.';}
    }
    sync();
    const latest=store.get('assistance').find(value=>value.id===id);
    if(latest.revision!==request.revision||latest.status==='resolved'){publish();return {request:publicRequest(latest),outcome:`${outcome} The source request also changed; its latest state is preserved.`};}
    const saved=store.put('assistance',{...latest,status,owner,revision:latest.revision+1,updatedAt:now(),resolution:outcome,lastAction:action});
    teammate?.notice?.(outcome,'useful',`assistance:${id}:${saved.revision}`);publish();
    return {request:publicRequest(saved),outcome};
  }
  runtime.on('change',sync);sync();
  return {snapshot,sync,registry,
    respond(id,input){const operation=mutations.catch(()=>{}).then(()=>act(id,input));mutations=operation;return operation;},
    async manageTask(id,input){if(!runtime.taskStack?.manage)throw failure('Saved task service is not ready.');const result=await runtime.taskStack.manage(id,input);publish();return result;},
    close(){runtime.off('change',sync);},
  };
}
