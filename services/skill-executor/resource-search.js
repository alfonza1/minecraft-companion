import { storageAnchor } from './storage-policy.js';
import { SEARCH_LIMITS, point, vector, safeSearchSegment, routeDistance } from './search-route.js';
import { requireSafeWork, valuableCargo, storeSurplus, explorationSteps, foodCount } from './survival.js';
import { navigateWithRecovery } from './navigation.js';

const SOURCE_BLOCKS = { scaffolding: ['bamboo'], string: ['cobweb'], glass: ['sand'], diamond: ['diamond_ore', 'deepslate_diamond_ore'], iron_ingot: ['iron_ore', 'deepslate_iron_ore'], coal: ['coal_ore', 'deepslate_coal_ore'], cocoa_beans: ['cocoa'] };
export async function findResource(service, { item, radius = SEARCH_LIMITS.radius, steps = SEARCH_LIMITS.steps }, signal, { navigate = navigateWithRecovery, now = Date.now } = {}) {
  const bot = requireSafeWork(service, signal);
  const names = SOURCE_BLOCKS[item] ?? [item.endsWith('_planks')?item.replace('_planks','_log'):item];
  const matching = names.map(name => bot.registry.blocksByName[name]?.id).filter(Number.isInteger);
  if (!matching.length) throw new Error(`I don't have a safe block-source search for ${item.replaceAll('_', ' ')}. That may need trading, mob drops or another production step.`);
  if (bot.game.dimension !== 'overworld') throw new Error('Resource scouting currently stays on the Overworld surface.');
  const realmId=service.store.settings().realmId,dimension=bot.game.dimension;
  const previous=service.store.get('expeditions').find(value=>value.id==='resource-search');
  if(previous&&!['returned','complete'].includes(previous.status)&&(previous.realmId!==realmId||previous.dimension!==dimension))throw new Error('An unfinished search belongs to another Realm or dimension. Return there to recover its route first.');
  const recovering=previous&&!['returned','complete'].includes(previous.status);
  if (!recovering) requireSafeWork(service,signal,{roam:true});
  if (!recovering && valuableCargo(bot)) { await storeSurplus(service, signal); if (valuableCargo(bot)) throw new Error('My valuables still need approved storage before scouting. Reserved or protected valuables must be stored or unreserved first.'); }
  const home=storageAnchor(service);
  const anchor=bot.entity.position.clone(),started=now();
  const trip=recovering?previous:{id:'resource-search',item,realmId,dimension,home:point(anchor.floored()),returnTarget:'departure',route:[point(anchor.floored())],status:'searching',startedAt:new Date().toISOString()};
  const save=()=>{trip.updatedAt=new Date().toISOString();service.store.put('expeditions',trip);};
  const scope=()=>{signal.throwIfAborted();if(service.store.settings().realmId!==realmId||bot.game.dimension!==dimension)throw new Error('Search scope changed. Its route is saved in the original Realm/dimension.');};
  const record=()=>{
    if(!bot.entity.onGround||trip.route.length>=2048)return;
    const p=bot.entity.position.floored();
    if(p.distanceTo(vector(trip.route.at(-1)))>=SEARCH_LIMITS.breadcrumbSpacing){trip.route.push(point(p));save();}
  };
  async function travel(target, returning=false) {
    scope();
    if(!safeSearchSegment(bot,bot.entity.position,target))throw new Error('The observed route is unloaded, obstructed or unsafe. I saved my position and need help instead of crossing it blindly.');
    const controller=new AbortController(),combined=AbortSignal.any([signal,controller.signal]);
    const halt=()=>{bot.pathfinder?.stop();bot.clearControlStates?.();};
    const timer=setTimeout(()=>controller.abort(new Error('Search route segment timed out.')),SEARCH_LIMITS.segmentMs);
    combined.addEventListener('abort',halt,{once:true});
    if(!returning)bot.on?.('physicsTick',record);
    try {await navigate(bot,vector(target),returning?0:1,combined);scope();}
    finally {clearTimeout(timer);combined.removeEventListener('abort',halt);if(!returning){bot.removeListener?.('physicsTick',record);record();}}
  }
  async function returnHome() {
    scope();trip.status='returning';save();
    while(trip.route.length){
      scope();requireSafeWork(service,signal);
      if(now()-started>SEARCH_LIMITS.totalMs)throw new Error('Return travel exceeded its time limit. The remaining route is saved; I need help.');
      const target=trip.route.at(-1);
      await travel(target,true);trip.route.pop();save();
    }
    if(!bot.entity.position.floored().equals(vector(trip.home)))throw new Error('Arrival at the saved return point could not be confirmed.');
    trip.status='returned';trip.returnedAt=new Date().toISOString();save();
  }
  if(recovering){
    try {await returnHome();}catch(error){trip.status=signal.aborted?'paused':'needs-help';save();throw error;}
    service.publish();return {success:true,returnedHome:trip.returnTarget==='home',summary:'Recovered my saved search route and returned. Ask me to search again when ready.'};
  }
  const extended=radius>64;
  let limitation=null;
  if(extended){
    if(!home)limitation='Save Home/Base or reconnect to observe server spawn before I search beyond 64 blocks.';
    else if(anchor.distanceTo(vector(home.position))>64||!safeSearchSegment(bot,anchor,home.position))limitation='Start the longer search near Home with an observed clear route to it.';
    else if(foodCount(bot)<SEARCH_LIMITS.food)limitation='I need at least eight food items for a longer search.';
    else {await travel(home.position);trip.home=point(bot.entity.position.floored());trip.returnTarget=home.kind;trip.route=[trip.home];}
  }
  if(limitation)service.notice?.(limitation+' I will check nearby terrain and return.','blocked','search-preparation');
  const origin=vector(trip.home),maxRadius=limitation?64:radius,visited=[origin.toString()];
  let found,reason=limitation;
  save();
  try {
    for(let step=0;step<=steps;step++){
      scope();
      // Walk farther only while there is daylight and enough reserve to retrace
      // the actual route at a conservative two blocks per second.
      const returnTicks=routeDistance(trip.route,bot.entity.position)*10+SEARCH_LIMITS.daylightMargin;
      const time=bot.time?.timeOfDay??24000;
      if(bot.health<18||bot.food<16||service.threats(bot.entity.position,16).length||time+returnTicks>=12000||now()-started>=SEARCH_LIMITS.outwardMs){reason='Turning back early to protect my health, food and daylight reserve.';break;}
      requireSafeWork(service,signal,{roam:true});
      const positions=bot.findBlocks({matching,point:bot.entity.position,maxDistance:32,count:64});
      found=positions.map(p=>bot.blockAt(p)).find(block=>block&&block.position.distanceTo(origin)<=maxRadius&&bot.canSeeBlock(block));
      if(found||step===steps)break;
      const searchRadius=Math.min(maxRadius,64*Math.pow(2,Math.floor(step/12)));
      const next=explorationSteps(bot,origin,searchRadius,visited).filter(p=>safeSearchSegment(bot,bot.entity.position,p)).sort((a,b)=>b.distanceTo(origin)-a.distanceTo(origin))[0];
      if(!next)break;
      await travel(next);visited.push(next.toString());
    }
    if(found){const {x,y,z}=found.position;service.store.put('resourceLocations',{id:`${realmId}:${dimension}:${found.name}:${x},${y},${z}`,item,block:found.name,position:{x,y,z},realmId,dimension,provenance:'observed',at:new Date().toISOString()});}
    await returnHome();service.publish();
    return {success:Boolean(found),returnedHome:trip.returnTarget==='home',requested:item,source:found?.name,position:found?point(found.position):null,visited:visited.length-1,radius:maxRadius,
      summary:found?`Found ${found.name.replaceAll('_',' ')} at ${found.position}. I saved the location and came back. I haven't harvested it or verified ownership.`:`I checked ${visited.length-1} safe surface waypoints, up to ${maxRadius} blocks from departure, and returned. ${reason||'No visible source found; I will need another route or your help.'}`};
  }catch(error){
    if(!signal.aborted){
      try {await returnHome();}catch(returnError){trip.status='needs-help';trip.reason=returnError.message;save();service.notice?.('My search route is blocked or unsafe. My position and remaining route are saved; can you help me get home?','danger','search-return');throw returnError;}
    }else {trip.status='paused';save();}
    throw error;
  }
}
