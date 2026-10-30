import {ensureStorage} from './automatic-storage.js';
import {terrainFrontiers} from './terrain.js';
import pathfinder from 'mineflayer-pathfinder';
import {abortableWait} from '../build-executor/site.js';
import {Vec3} from 'vec3';
import {setTimeout as delay} from 'node:timers/promises';
import {inventoryCounts} from '../../src/actions.js';
import {collect} from '../../src/tools/play.js';
import {confirmInventory} from './items.js';
import {navigateWithRecovery} from './navigation.js';
import {storageAnchor,HOME_STORAGE_RADIUS} from './storage-policy.js';

export const CROPS={wheat:{age:7,seed:'wheat_seeds'},carrots:{age:7,seed:'carrot'},potatoes:{age:7,seed:'potato'},beetroots:{age:3,seed:'beetroot_seeds'}};
export const MEAT={cow:'beef',pig:'porkchop',sheep:'mutton',chicken:'chicken'};
export const COOKED={beef:'cooked_beef',porkchop:'cooked_porkchop',mutton:'cooked_mutton',chicken:'cooked_chicken',potato:'baked_potato'};
export const cookingFuel=bot=>bot.inventory.items().find(item=>['coal','charcoal'].includes(item.name))||bot.inventory.items().find(item=>item.name.endsWith('_planks'));
export const VALUABLE=/diamond|netherite|emerald|ancient_debris|raw_iron|iron_ingot|raw_gold|gold_ingot|lapis|redstone|totem|elytra|trident|nether_star/;
export const valuableCargo=bot=>bot.inventory.items().some(item=>VALUABLE.test(item.name)&&!/_pickaxe$|_axe$|_sword$|_shovel$|_hoe$|_helmet$|_chestplate$|_leggings$|_boots$/.test(item.name));
const FOOD=['cooked_beef','cooked_porkchop','cooked_mutton','cooked_chicken','bread','baked_potato','carrot','beetroot','apple','beef','porkchop','mutton'];
const toolRank=name=>['wooden','golden','stone','iron','diamond','netherite'].indexOf(name.split('_')[0]);
export const foodCount=bot=>bot.inventory.items().filter(item=>FOOD.includes(item.name)).reduce((sum,item)=>sum+item.count,0);
export const vector=p=>new Vec3(p.x,p.y,p.z);

export function requireSafeWork(service,signal,{roam=false}={}){
  signal.throwIfAborted();const bot=service.runtime.bot;
  if(!bot?.minenessReady||bot.companionTransport?.projected||bot.companionInventoryUnverified)throw new Error('Wait for a native connection and confirmed inventory before survival work.');
  if(bot.health<(roam?18:14)||bot.food<(roam?14:6)||bot.entity.isInWater||bot.entity.isInLava||service.threats(bot.entity.position,12).length)throw new Error('Conditions are unsafe. I need food, healing or a clear area before working.');
  return bot;
}

export function keptSupplies(service){
  const bot=service.runtime.bot,items=bot.inventory.items(),keep={torch:32,coal:16,charcoal:16,crafting_table:1,water_bucket:1,shield:1,cobblestone:32,wheat:12,wheat_seeds:16,beetroot_seeds:16,potato:1};
  let food=12;
  for(const name of FOOD){const owned=inventoryCounts(bot)[name]||0;keep[name]=Math.min(owned,food);food-=keep[name];}
  keep.carrot=Math.max(1,keep.carrot||0);
  for(const family of ['pickaxe','axe','sword','shovel','hoe','helmet','chestplate','leggings','boots']){
    const best=items.filter(item=>item.name.endsWith('_'+family)).sort((a,b)=>toolRank(b.name)-toolRank(a.name)||(a.durabilityUsed||0)-(b.durabilityUsed||0))[0];if(best)keep[best.name]=1;
  }
  for(const item of items){if(/_(?:log|planks)$/.test(item.name))keep[item.name]=Math.min(16,item.count);keep[item.name]=Math.max(keep[item.name]||0,service.reserved(item.name));}
  return keep;
}
export function depositPlan(service){
  const bot=service.runtime.bot,keep=keptSupplies(service),totals=inventoryCounts(bot);
  // A type-based transfer cannot distinguish protected variants of the same item.
  const protectedNames=new Set(bot.inventory.items().filter(item=>item.customName||item.enchants?.length).map(item=>item.name));
  return Object.entries(totals).filter(([name,count])=>!protectedNames.has(name)&&count>(keep[name]||0)).map(([name,count])=>({name,count:count-(keep[name]||0)}));
}
export function approvedStores(service){
  const bot=service.runtime.bot,anchor=storageAnchor(service);
  if(!anchor)return [];
  return service.store.get('supplyChests').filter(chest=>chest.approved&&chest.depositAllowed&&chest.realmId===service.store.settings().realmId&&chest.dimension===bot.game.dimension&&vector(chest.position).distanceTo(vector(anchor.position))<=HOME_STORAGE_RADIUS&&vector(chest.position).distanceTo(bot.entity.position)<=64).sort((a,b)=>vector(a.position).distanceTo(vector(anchor.position))-vector(b.position).distanceTo(vector(anchor.position)));
}
export async function storeSurplus(service,signal){
  const deposited={};
  for(let attempt=0;attempt<3;attempt++){
    await ensureStorage(service,signal);
    const candidates=approvedStores(service);let needsExpansion=false;
    for(const chest of candidates){
      const result=await depositInChest(service,chest,signal);
      for(const [name,count] of Object.entries(result.deposited))deposited[name]=(deposited[name]??0)+count;
      if(!depositPlan(service).length)return {success:true,deposited,summary:'Stored surplus at Home/spawn and kept my useful kit.'};
      needsExpansion=true;
    }
    if(needsExpansion)await ensureStorage(service,signal,{forceNew:true});
  }
  throw new Error('Storage expanded but some surplus remains. Check capacity before trying again.');
}
async function depositInChest(service,chest,signal){
  const bot=requireSafeWork(service,signal);
  if(!chest)throw new Error('Approve a nearby chest for loot deposits at Home/Base, or at server spawn if no home is set (within 32 blocks). Return within 64 blocks of that storage first. If spawn is unknown, reconnect to observe it. I will keep my loot until then.');
  await navigateWithRecovery(bot,chest.position,2,signal);requireSafeWork(service,signal);
  if(!approvedStores(service).some(value=>value.id===chest.id))throw new Error('Home/spawn storage or its deposit permission changed. Deposit stopped.');
  const block=bot.blockAt(vector(chest.position));if(!block||!['chest','barrel'].includes(block.name))throw new Error('The approved storage is unloaded or missing.');
  const container=await bot.openContainer(block),deposited={};
  bot.companionInventorySyncing=true;
  const record=()=>{const current=service.store.get('supplyChests').find(value=>value.id===chest.id);if(current)service.store.put('supplyChests',{...current,inventory:container.containerItems().map(item=>({name:item.name,count:item.count})),provenance:'observed-container',observedAt:new Date().toISOString()});};
  try{
    for(const item of depositPlan(service)){
      requireSafeWork(service,signal);
      if(!approvedStores(service).some(value=>value.id===chest.id))throw new Error('Deposit permission or Home/spawn storage changed.');
      const before=container.items().filter(value=>value.name===item.name).reduce((sum,value)=>sum+value.count,0);
      const slots=container.slots?.slice(0,container.inventoryStart);
      const capacity=slots?slots.reduce((n,slot)=>n+(!slot?(bot.registry.itemsByName[item.name].stackSize??64):slot.name===item.name&&!slot.customName&&!slot.enchants?.length?Math.max(0,slot.stackSize-slot.count):0),0):item.count;
      const amount=Math.min(item.count,capacity);if(!amount)continue;
      try{await container.deposit(bot.registry.itemsByName[item.name].id,null,amount);} catch(error){record();throw new Error(`Storage could not accept ${item.name}. My remaining items stay in inventory.`);}
      await confirmInventory(bot,container);signal.throwIfAborted();
      const moved=before-container.items().filter(value=>value.name===item.name).reduce((sum,value)=>sum+value.count,0);if(moved>0)deposited[item.name]=moved;record();
    }
  }finally{record();container.close();try{await confirmInventory(bot);}finally{bot.companionInventorySyncing=false;bot.emit('companionInventoryConfirmed');service.publish();}}
  return {success:true,deposited,summary:`Stored ${Object.entries(deposited).map(([name,count])=>`${count} ${name}`).join(', ')||'nothing extra'}. Kept food, useful tools and reserved project materials.`};
}

export function farmArea(service){return service.store.get('workAreas').find(area=>area.id==='farm'&&area.realmId===service.store.settings().realmId&&area.dimension===service.runtime.bot.game.dimension);}
export function pendingFarmRepairs(service){const area=farmArea(service);if(!area)return [];return service.store.get('cropRepairs').filter(record=>record.status==='pending'&&record.realmId===service.store.settings().realmId&&record.dimension===service.runtime.bot.game.dimension&&vector(record.position).distanceTo(vector(area.position))<=area.radius&&vector(record.position).distanceTo(service.runtime.bot.entity.position)<=32);}
export function matureCrops(service){
  const bot=service.runtime.bot,area=farmArea(service);if(!area)return [];
  return bot.findBlocks({point:vector(area.position),maxDistance:area.radius,count:128,matching:block=>CROPS[block.name]&&Number(block.getProperties().age)===CROPS[block.name].age}).map(p=>bot.blockAt(p)).filter(block=>block&&vector(area.position).distanceTo(block.position)<=area.radius&&bot.entity.position.distanceTo(block.position)<=32);
}
async function observed(predicate,signal,label,timeout=5000){const start=Date.now();while(!predicate()){signal.throwIfAborted();if(Date.now()-start>timeout)throw new Error(`${label} was not confirmed by the server.`);await delay(50,undefined,{signal});}}
export async function tendFarm(service,{count=4},signal){
  const bot=requireSafeWork(service,signal);if(!farmArea(service))throw new Error('Stand near your farm and approve it in Companion → Survival work before harvesting.');
  const before=inventoryCounts(bot);let replanted=0,harvested=0;
  for(const repair of pendingFarmRepairs(service)){
    requireSafeWork(service,signal);if(!farmArea(service))throw new Error('Farm permission was revoked.');
    const p=vector(repair.position),block=bot.blockAt(p),soil=bot.blockAt(p.offset(0,-1,0));
    if(block?.name===repair.crop){service.store.put('cropRepairs',{...repair,status:'verified'});continue;}
    if(!block||!['air','cave_air'].includes(block.name)||soil?.name!=='farmland')throw new Error('An interrupted farm spot changed. Inspect it before more harvesting.');
    const seed=bot.inventory.items().find(item=>item.name===CROPS[repair.crop]?.seed&&item.count>service.reserved(item.name));if(!seed)throw new Error('A previous crop needs replanting. Bring seeds before harvesting more.');
    await navigateWithRecovery(bot,p,2,signal);signal.throwIfAborted();if(!farmArea(service))throw new Error('Farm permission was revoked.');
    await bot.equip(seed,'hand');await bot.placeBlock(soil,new Vec3(0,1,0));await observed(()=>bot.blockAt(p)?.name===repair.crop,signal,'Repair planting');service.store.put('cropRepairs',{...repair,status:'replanted'});replanted++;
  }
  for(const target of matureCrops(service).slice(0,count)){
    requireSafeWork(service,signal);if(!farmArea(service))throw new Error('Farm permission was revoked.');const crop=CROPS[target.name];
    if((inventoryCounts(bot)[crop.seed]||0)-service.reserved(crop.seed)<1)continue;
    await navigateWithRecovery(bot,target.position,2,signal);
    const live=bot.blockAt(target.position),soil=bot.blockAt(target.position.offset(0,-1,0));
    if(live?.name!==target.name||Number(live.getProperties().age)!==crop.age||soil?.name!=='farmland')continue;
    if(!farmArea(service))throw new Error('Farm permission was revoked.');
    const repair={id:`${service.store.settings().realmId}:${bot.game.dimension}:${target.position}`,realmId:service.store.settings().realmId,dimension:bot.game.dimension,position:{x:target.position.x,y:target.position.y,z:target.position.z},crop:target.name,status:'pending'};service.store.put('cropRepairs',repair);
    await collect(bot,[live],signal);requireSafeWork(service,signal);
    harvested++;
    if(!['air','cave_air'].includes(bot.blockAt(target.position)?.name))throw new Error('Harvested crop space changed; planting stopped.');
    const seed=bot.inventory.items().find(item=>item.name===crop.seed);if(!seed)throw new Error('No seed remained to replant. Check the farm before continuing.');
    await bot.equip(seed,'hand');await bot.placeBlock(soil,new Vec3(0,1,0));
    await observed(()=>bot.blockAt(target.position)?.name===target.name,signal,'Replanting');replanted++;service.store.put('cropRepairs',{...repair,status:'replanted'});
  }
  await confirmInventory(bot);const after=inventoryCounts(bot),gained=Object.fromEntries(Object.entries(after).map(([name,n])=>[name,n-(before[name]||0)]).filter(([,n])=>n>0));
  return {success:replanted>0,replanted,harvested,gained,summary:replanted?`Harvested ${harvested} mature crops and replanted ${replanted} spots, including interrupted repairs.`:'No ripe crops with spare replanting seeds were available.'};
}

export function huntableAnimals(service,maxDistance=24){
  const bot=service.runtime.bot,area=farmArea(service),homes=service.store.get('locations').filter(place=>/^(home|base)$/i.test(place.name)&&place.realmId===service.store.settings().realmId&&place.dimension===bot.game.dimension);
  return Object.values(bot.entities).filter(entity=>{
    if(!Object.hasOwn(MEAT,entity.name)||entity.isValid===false||entity.customName||entity.username||entity.leashHolder||entity.vehicle||entity.passengers?.length||entity.position.distanceTo(bot.entity.position)>maxDistance)return false;
    const keys=bot.registry.entitiesByName[entity.name]?.metadataKeys||[],baby=keys.indexOf('baby'),health=keys.indexOf('health'),custom=keys.indexOf('custom_name');
    if(baby<0||health<0||!Number.isFinite(entity.metadata?.[health])||entity.metadata?.[baby]===true||entity.metadata?.[custom])return false;
    if(area&&entity.position.distanceTo(vector(area.position))<area.radius+8)return false;
    if(homes.some(home=>entity.position.distanceTo(vector(home.position))<24))return false;
    if(bot.findBlocks({point:entity.position,maxDistance:5,count:1,matching:block=>/_(?:fence|fence_gate)$/.test(block.name)}).length)return false;
    if(bot.blockAt(entity.position.offset(0,3,0).floored())?.boundingBox==='block')return false;
    return true;
  }).sort((a,b)=>a.position.distanceTo(bot.entity.position)-b.position.distanceTo(bot.entity.position));
}
export async function huntFood(service,{count=1},signal){
  const bot=requireSafeWork(service,signal),before=inventoryCounts(bot);let killed=0;
  if(bot.time?.timeOfDay>13000&&bot.time.timeOfDay<23000)throw new Error('Hunting waits for daylight. I can check supplies or cook instead.');
  const weapon=bot.inventory.items().filter(item=>/_sword$|_axe$/.test(item.name)).sort((a,b)=>toolRank(b.name)-toolRank(a.name))[0];
  if(!weapon)throw new Error('I need an axe or sword before hunting.');await bot.equip(weapon,'hand');
  for(const target of huntableAnimals(service).slice(0,count)){
    let dead=false;const death=entity=>{if(entity.id===target.id)dead=true;};bot.on('entityDead',death);
    try{
      for(let hit=0;hit<16&&!dead&&target.isValid!==false;hit++){
        requireSafeWork(service,signal);if(!huntableAnimals(service).some(entity=>entity.id===target.id))break;
        await navigateWithRecovery(bot,target.position,2,signal);requireSafeWork(service,signal);
        if(target.position.distanceTo(bot.entity.position)>3.1)continue;
        await bot.lookAt(target.position.offset(0,.5,0),true);bot.attack(target);await delay(750,undefined,{signal});
      }
      if(!dead)continue;killed++;await delay(250,undefined,{signal});
      const drops=Object.values(bot.entities).filter(entity=>entity.name==='item'&&entity.isValid!==false&&entity.position.distanceTo(target.position)<4).slice(0,8);
      for(const drop of drops){
        requireSafeWork(service,signal);
        try{await abortableWait(()=>bot.pathfinder.goto(new pathfinder.goals.GoalFollow(drop,0)),signal,bot);}
        catch(error){signal.throwIfAborted();if(drop.isValid!==false&&bot.entities[drop.id])throw error;}
        finally{bot.pathfinder.setGoal(null);}
        await delay(250,undefined,{signal});
      }
    }finally{bot.removeListener('entityDead',death);}
  }
  await confirmInventory(bot);const after=inventoryCounts(bot),gained=Object.fromEntries(Object.entries(after).map(([name,n])=>[name,n-(before[name]||0)]).filter(([,n])=>n>0));
  return {success:killed>0,killed,gained,summary:`Hunted ${killed} observed wild adult animals; collected ${Object.entries(gained).map(([name,n])=>`${n} ${name}`).join(', ')||'no confirmed drops'}. Named animals, young animals, farms and nearby pens are excluded.`};
}

export async function cookFood(service,{count=2},signal){
  const bot=requireSafeWork(service,signal),raw=bot.inventory.items().find(item=>COOKED[item.name]&&item.count-service.reserved(item.name)>0),fuel=bot.inventory.items().find(item=>(['coal','charcoal'].includes(item.name)||item.name.endsWith('_planks'))&&item.count-service.reserved(item.name)>0);
  if(!raw||!fuel)throw new Error('Cooking needs owned raw food and unreserved coal, charcoal or planks.');
  const block=bot.findBlock({matching:bot.registry.blocksByName.furnace.id,maxDistance:16});if(!block)throw new Error('No furnace is visible nearby.');
  await navigateWithRecovery(bot,block.position,2,signal);const furnace=await bot.openFurnace(block),amount=Math.min(count,raw.count-service.reserved(raw.name)),fuelNeeded=fuel.name.endsWith('_planks')?Math.ceil(amount/1.5):1;
  bot.companionInventorySyncing=true;
  const id=`${service.store.settings().realmId}:${bot.game.dimension}:${block.position}`;let started=false;
  try{
    if(furnace.inputItem()||furnace.fuelItem()||furnace.outputItem())throw new Error('The furnace already contains items. I will not mix with or take someone else’s work.');
    if(fuel.count-service.reserved(fuel.name)<fuelNeeded)throw new Error('Not enough unreserved fuel to finish cooking.');
    service.store.put('furnaceJobs',{id,position:{x:block.position.x,y:block.position.y,z:block.position.z},input:raw.name,count:amount,status:'preparing',at:new Date().toISOString()});
    started=true;await furnace.putFuel(fuel.type,null,fuelNeeded);signal.throwIfAborted();await furnace.putInput(raw.type,null,amount);
    await observed(()=>furnace.outputItem()?.name===COOKED[raw.name]&&furnace.outputItem().count>=amount,signal,'Cooking',amount*10_000+5000);
    requireSafeWork(service,signal);if(furnace.outputItem().count!==amount||furnace.inputItem())throw new Error('Furnace contents changed unexpectedly. Check it before collecting.');
    const before=furnace.items().filter(item=>item.name===COOKED[raw.name]).reduce((sum,item)=>sum+item.count,0);await furnace.takeOutput();await confirmInventory(bot,furnace);
    const cooked=furnace.items().filter(item=>item.name===COOKED[raw.name]).reduce((sum,item)=>sum+item.count,0)-before;if(cooked!==amount)throw new Error('Cooked food transfer was not confirmed.');
    service.store.put('furnaceJobs',{id,status:'complete',cooked,at:new Date().toISOString()});return {success:true,cooked,item:COOKED[raw.name],summary:`Cooked ${cooked} ${COOKED[raw.name]}.`};
  }catch(error){if(started)service.store.put('furnaceJobs',{id,status:'needs-check',input:raw.name,count:amount,position:{x:block.position.x,y:block.position.y,z:block.position.z},at:new Date().toISOString()});throw error;}
  finally{furnace.close();try{await confirmInventory(bot);}finally{bot.companionInventorySyncing=false;bot.emit('companionInventoryConfirmed');service.publish();}}
}

export function explorationSteps(bot,anchor,radius,visited=[]){
  if(bot.pathfinder?.getPathTo&&bot.pathfinder.movements)return terrainFrontiers(bot,anchor,radius,visited);
  const p=bot.entity.position.floored(),seen=new Set(visited),points=[];
  for(const [dx,dz] of [[8,0],[0,8],[-8,0],[0,-8],[6,6],[-6,6],[6,-6],[-6,-6]]){
    const next=p.offset(dx,0,dz);if(next.distanceTo(anchor)>radius||seen.has(next.toString()))continue;
    const feet=bot.blockAt(next),head=bot.blockAt(next.offset(0,1,0)),floor=bot.blockAt(next.offset(0,-1,0));
    if(!feet||!head||!floor||feet.boundingBox!=='empty'||head.boundingBox!=='empty'||floor.boundingBox!=='block'||/water|lava|fire|magma|cactus|powder_snow/.test([feet.name,head.name,floor.name].join(' ')))continue;
    points.push(next);
  }
  return points;
}
export async function exploreNearby(service,{radius=24,steps=3},signal){
  const bot=requireSafeWork(service,signal,{roam:true});if(bot.game.dimension!=='overworld')throw new Error('Autonomous exploration currently supports the Overworld surface only.');
  if(valuableCargo(bot))throw new Error('I need to store my valuables before exploring.');
  if(bot.time?.timeOfDay>13000&&bot.time.timeOfDay<23000)throw new Error('Surface exploration waits for daylight.');
  const anchor=bot.entity.position.clone(),visited=[],known=service.store.get('exploration').filter(value=>value.realmId===service.store.settings().realmId&&value.dimension===bot.game.dimension&&Date.now()-Date.parse(value.at)<600000).map(value=>vector(value.position).toString());
  for(let step=0;step<steps;step++){
    requireSafeWork(service,signal,{roam:true});const next=explorationSteps(bot,anchor,radius,[...known,...visited])[0];if(!next)break;
    await navigateWithRecovery(bot,next,1,signal);visited.push(next.toString());
    service.store.put('exploration',{id:`${service.store.settings().realmId}:${bot.game.dimension}:${next}`,position:{x:next.x,y:next.y,z:next.z},dimension:bot.game.dimension,realmId:service.store.settings().realmId,provenance:'observed',at:new Date().toISOString()});
  }
  requireSafeWork(service,signal,{roam:true});await navigateWithRecovery(bot,anchor,1,signal);service.publish();
  return {success:visited.length>0,visited:visited.length,summary:`Scouted ${visited.length} safe loaded surface waypoints and returned. No tunneling, portals or unseen-world claims.`};
}
