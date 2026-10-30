import {setTimeout as delay} from 'node:timers/promises';
import pathfinder from 'mineflayer-pathfinder';
import {ensureBasicItem,freeBasic,emptyUtilitySites,placeUtility,commonWoodSpecies} from './basic-production.js';
import {requireSafeWork,vector} from './survival.js';
import {storageAnchor} from './storage-policy.js';
import {terrainFrontiers} from './terrain.js';
import {navigateWithRecovery} from './navigation.js';
import {waitForMiningFooting} from '../../src/mining.js';
import {digConstructionBlock,abortableWait} from '../build-executor/site.js';
import {confirmInventory} from './items.js';

export const COOKING_LIMITS=Object.freeze({stone:8,sourceRadius:32,scoutRadius:48,scoutSteps:4,maxMined:12,batch:8});
export function protectedCookingSource(service,p){
  const bot=service.runtime.bot,realmId=service.store.settings().realmId,anchor=storageAnchor(service);
  if(anchor&&vector(anchor.position).distanceTo(p)<8)return true;
  if(service.store.get('supplyChests').some(chest=>chest.realmId===realmId&&chest.dimension===bot.game.dimension&&vector(chest.position).distanceTo(p)<6))return true;
  return service.store.get('projects').some(project=>{
    const scope=project.construction??project.checkpoint;
    return scope?.realmId===realmId&&scope.dimension===bot.game.dimension&&project.blueprint&&p.x>=scope.origin.x-4&&p.x<=scope.origin.x+project.blueprint.dimensions.x+4&&p.z>=scope.origin.z-4&&p.z<=scope.origin.z+project.blueprint.dimensions.z+4;
  });
}
export function cookingStoneTargets(service){
  const bot=service.runtime.bot;
  return bot.findBlocks({matching:bot.registry.blocksByName.stone.id,maxDistance:COOKING_LIMITS.sourceRadius,count:64,useExtraInfo:block=>block.position.y>=Math.floor(bot.entity.position.y)&&!protectedCookingSource(service,block.position)})
    .map(p=>bot.blockAt(p)).filter(block=>block?.name==='stone'&&block.position.y>=Math.floor(bot.entity.position.y)&&!protectedCookingSource(service,block.position)&&[[1,0,0],[-1,0,0],[0,0,1],[0,0,-1],[0,1,0]].some(([x,y,z])=>bot.blockAt(block.position.offset(x,y,z))?.boundingBox==='empty'))
    .sort((a,b)=>a.position.distanceTo(bot.entity.position)-b.position.distanceTo(bot.entity.position));
}
async function gatherFurnaceStone(service,signal){
  const bot=requireSafeWork(service,signal),origin=bot.entity.position.clone(),visited=[],realmId=service.store.settings().realmId,dimension=bot.game.dimension;
  if(bot.game.dimension!=='overworld')throw new Error('Automatic furnace quarrying stays on observed Overworld surface rock.');
  const observedSources=cookingStoneTargets(service).map(block=>block.position.clone());
  const usablePick=()=>bot.inventory.items().find(item=>item.name.endsWith('_pickaxe')&&!item.customName&&!item.enchants?.some(e=>e.name==='silk_touch')&&freeBasic(service,item.name)>0&&(bot.registry.itemsByName[item.name].maxDurability-(item.durabilityUsed??0))>=16);
  if(!usablePick())await ensureBasicItem(service,'wooden_pickaxe',1,signal);
  // Crafting may move us to a workbench outside the source's scan radius.
  // Keep the observed quarry location instead of forgetting it and wandering.
  if(!cookingStoneTargets(service).length&&observedSources.length)await navigateWithRecovery(bot,observedSources[0],3,signal);
  let mined=0;
  for(let scout=0;scout<=COOKING_LIMITS.scoutSteps&&freeBasic(service,'cobblestone')<COOKING_LIMITS.stone;scout++){
    const targets=cookingStoneTargets(service);
    for(const block of targets){
      requireSafeWork(service,signal);if(mined>=COOKING_LIMITS.maxMined||freeBasic(service,'cobblestone')>=COOKING_LIMITS.stone)break;
      await navigateWithRecovery(bot,block.position,3,signal);await waitForMiningFooting(bot,signal);
      const actual=bot.blockAt(block.position),tool=usablePick();
      if(actual?.name!=='stone'||actual.position.y<Math.floor(bot.entity.position.y)||protectedCookingSource(service,actual.position))continue;
      if(!tool)throw new Error('No usable non-Silk-Touch pickaxe remains for the furnace.');
      const movements=bot.pathfinder.movements,previous=movements.canDig;let safe;
      try{movements.canDig=true;safe=movements.safeToBreak(actual);}finally{movements.canDig=previous;}
      if(!safe)continue;
      await bot.equip(tool,'hand');requireSafeWork(service,signal);
      if(service.store.settings().realmId!==realmId||bot.game.dimension!==dimension||protectedCookingSource(service,actual.position))throw new Error('Cooking quarry scope or protected site changed.');
      await digConstructionBlock(bot,actual,signal);mined++;
      await delay(200,undefined,{signal});
      for(const drop of Object.values(bot.entities).filter(e=>e.name==='item'&&e.isValid!==false&&e.position.distanceTo(actual.position)<3)){
        try{await abortableWait(()=>bot.pathfinder.goto(new pathfinder.goals.GoalFollow(drop,0)),signal,bot);}
        catch(error){signal.throwIfAborted();if(drop.isValid!==false&&bot.entities[drop.id])throw error;}
        finally{bot.pathfinder.setGoal(null);}
      }
      await confirmInventory(bot);
    }
    if(freeBasic(service,'cobblestone')>=COOKING_LIMITS.stone||mined>=COOKING_LIMITS.maxMined)break;
    requireSafeWork(service,signal,{roam:true});const next=terrainFrontiers(bot,origin,COOKING_LIMITS.scoutRadius,visited)[0];if(!next)break;
    await navigateWithRecovery(bot,next,0,signal);visited.push(next.toString());
  }
  if(freeBasic(service,'cobblestone')<COOKING_LIMITS.stone)throw new Error('I could not collect eight confirmed cobblestone from safe exposed rock. I will keep the food and equipment; I need another surface route.');
}
export function availableCookingFuel(service,amount){
  return service.runtime.bot.inventory.items().find(item=>{
    const capacity=['coal','charcoal'].includes(item.name)?8:item.name.endsWith('_planks')?1.5:0;
    return capacity&&freeBasic(service,item.name)>=Math.ceil(amount/capacity);
  });
}
export async function prepareCooking(service,amount,signal){
  const bot=requireSafeWork(service,signal);
  // Prefer an empty observed furnace; an interrupted job may reuse only its own
  // matching station, never somebody else's active smelt.
  const candidates=bot.findBlocks({matching:bot.registry.blocksByName.furnace.id,maxDistance:24,count:4});
  let block;
  for(const p of candidates){
    signal.throwIfAborted();await navigateWithRecovery(bot,p,2,signal);const station=await bot.openFurnace(bot.blockAt(p));
    try{
      const own=service.store.get('furnaceJobs').find(job=>job.status==='complete'&&job.realmId===service.store.settings().realmId&&job.dimension===bot.game.dimension&&job.position&&vector(job.position).equals(p));
      const leftover=station.fuelItem();
      if(!station.inputItem()&&!station.outputItem()&&leftover&&own?.fuelName===leftover.name&&leftover.count<=own.fuelAdded){await station.takeFuel();await confirmInventory(bot,station);signal.throwIfAborted();}
      if(!station.inputItem()&&!station.fuelItem()&&!station.outputItem()){block=bot.blockAt(p);break;}
    }
    finally{station.close();await confirmInventory(bot);}
  }
  if(!block){
    if(freeBasic(service,'furnace')<1){if(freeBasic(service,'cobblestone')<8)await gatherFurnaceStone(service,signal);await ensureBasicItem(service,'furnace',1,signal);}
    const anchor=storageAnchor(service),site=emptyUtilitySites(bot,anchor?.position??bot.entity.position,16)[0];
    if(!site)throw new Error('No clear observed site for a furnace at Home/spawn.');
    await placeUtility(service,'furnace',site,signal);block=bot.blockAt(site);
  }
  if(!availableCookingFuel(service,amount)){
    const wood=await commonWoodSpecies(service,signal);
    await ensureBasicItem(service,`${wood}_planks`,Math.ceil(amount/1.5),signal);
  }
  requireSafeWork(service,signal);return {block,fuel:availableCookingFuel(service,amount)};
}
