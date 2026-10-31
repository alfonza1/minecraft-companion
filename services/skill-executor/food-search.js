import {requireSafeWork,foodCount,valuableCargo,storeSurplus,matureCrops,tendFarm,huntableAnimals,huntFood,cookFood,cookingFuel,COOKED,explorationSteps} from './survival.js';
import {ensureBasicItem} from './basic-production.js';
import {navigateWithRecovery} from './navigation.js';
import {observedTerrainPath,terrainFrontiers} from './terrain.js';

async function visibleFood(service,signal,context){
  const bot=service.runtime.bot;
  if(bot.inventory.items().some(item=>COOKED[item.name]&&item.count-service.reserved(item.name)>0))return cookFood(service,{count:8},signal);
  if(foodCount(bot)>=8)return {success:true,summary:`Carrying ${foodCount(bot)} food items.`};
  if(bot.inventory.items().some(item=>COOKED[item.name])&&cookingFuel(bot)&&bot.findBlock({matching:bot.registry.blocksByName.furnace.id,maxDistance:16}))return cookFood(service,{count:2},signal);
  if(!context.stockChecked&&service.store.get('supplyChests').some(chest=>chest.approved&&chest.realmId===service.store.settings().realmId&&chest.dimension===bot.game.dimension&&chest.allowedItems?.some(name=>bot.registry.foodsByName?.[name]))){
    context.stockChecked=true;
    const stock=await service.execute('restock_food',{},signal);if(stock.success&&foodCount(bot)>0)return stock;
  }
  if(matureCrops(service).length){const harvest=await tendFarm(service,{count:3},signal);if(foodCount(bot)>0)return harvest;}
  if(huntableAnimals(service).length){
    if(!bot.inventory.items().some(item=>/_sword$|_axe$/.test(item.name)))await ensureBasicItem(service,'wooden_axe',1,signal);
    return huntFood(service,{count:1},signal);
  }
  if(bot.inventory.items().some(item=>item.name==='wheat'&&item.count-service.reserved('wheat')>=3)){
    await ensureBasicItem(service,'bread',(bot.inventory.items().find(item=>item.name==='bread')?.count??0)+1,signal);return {success:true,summary:'Made bread from owned wheat.'};
  }
  return null;
}
export async function findFood(service,signal){
  const bot=requireSafeWork(service,signal),anchor=bot.entity.position.clone(),route=[],visited=[anchor.floored().toString()];
  if(valuableCargo(bot))await storeSurplus(service,signal);
  if(valuableCargo(bot))throw new Error('Protected or reserved valuables still need safe storage before food scouting.');
  let result,reason;const context={stockChecked:false};
  try{
    for(let step=0;step<=12;step++){
      requireSafeWork(service,signal);
      result=await visibleFood(service,signal,context);if(result?.success)break;
      if(bot.food<10||bot.health<16||bot.time?.timeOfDay>11000||step===12)break;
      const prey=huntableAnimals(service,64)[0];
      const candidates=bot.pathfinder?.getPathTo?terrainFrontiers(bot,anchor,64,visited,prey?.position):explorationSteps(bot,anchor,64,visited);
      if(prey)candidates.sort((a,b)=>a.distanceTo(prey.position)-b.distanceTo(prey.position));
      const next=candidates[0];if(!next){reason='No reachable observed surface route was available.';break;}
      route.push(bot.entity.position.floored());
      await navigateWithRecovery(bot,next,0,signal);visited.push(next.toString());
      service.store.put('foodScouting',{id:`${service.store.settings().realmId}:${bot.game.dimension}:${next}`,position:{x:next.x,y:next.y,z:next.z},at:new Date().toISOString()});
    }
  }finally{
    if(!signal.aborted){
      if(!route.length)route.push(anchor.floored());
      for(const p of route.reverse()){
        requireSafeWork(service,signal);
        if(!observedTerrainPath(bot,p))throw new Error('Food-search return route changed. I need help getting back.');
        await navigateWithRecovery(bot,p,0,signal);
      }
    }
  }
  if(result?.success&&bot.inventory.items().some(item=>COOKED[item.name]&&item.count-service.reserved(item.name)>0)){const cooked=await cookFood(service,{count:8},signal);return {...result,cooked:cooked.cooked,summary:`${result.summary} ${cooked.summary}`};}
  return result??{success:false,summary:`Searched ${visited.length-1} reachable surface waypoints for food. ${reason??'No eligible wild animals, approved ripe crops or food supplies were found on this route.'}`};
}
