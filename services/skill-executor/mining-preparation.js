import {ensureBasicItem,freeBasic,commonWoodSpecies} from './basic-production.js';
import {gatherSurfaceStone} from './cooking-preparation.js';
import {requireSafeWork,cookFood,valuableCargo,storeSurplus} from './survival.js';
import {findFood} from './food-search.js';
import {requireNaturalTree} from './index.js';
import {uniqueTreeLogs} from './tree-targets.js';
import {collect} from '../../src/tools/play.js';
import {confirmInventory} from './items.js';
import {remainingDurability} from './gear-policy.js';

export const MINING_LIMITS=Object.freeze({food:8,torches:16,toolUses:32,foodAttempts:6,woodTrips:8,actionMs:1200000});
export const MINING_FOOD=['cooked_beef','cooked_porkchop','cooked_mutton','cooked_chicken','bread','baked_potato','carrot','apple'];
export const miningFoodCount=service=>MINING_FOOD.reduce((n,name)=>n+freeBasic(service,name),0);
export function miningPick(bot){
  const harvest=bot.registry.blocksByName?.iron_ore?.harvestTools;
  return bot.inventory.items().find(item=>item.name.endsWith('_pickaxe')&&remainingDurability(bot,item)>=MINING_LIMITS.toolUses&&!item.enchants?.some(e=>e.name==='silk_touch')&&(harvest?Boolean(harvest[item.type]):/^(stone|iron|diamond|netherite)_/.test(item.name)));
}
export function preparationPhase(service,phase,detail={}){
  const bot=service.runtime.bot;
  if(service.runtime.connection?.realmId!=null&&service.runtime.connection.realmId!==service.store.settings().realmId)throw new Error('Reconnect to the selected Realm before preparing mining supplies.');
  service.store.put('miningPreparation',{id:'current',realmId:service.store.settings().realmId,dimension:bot.game.dimension,phase,...detail,at:new Date().toISOString()});service.publish();
}
async function withdrawTarget(service,name,target,signal){
  if(freeBasic(service,name)<target)await service.withdraw([{name,count:target+service.reserved(name)}],signal);
}
export async function gatherCommonLogs(service,target,signal){
  const count=()=>service.runtime.bot.inventory.items().filter(i=>i.name.endsWith('_log')).reduce((n,i)=>n+freeBasic(service,i.name),0);
  for(let trip=0;trip<MINING_LIMITS.woodTrips&&count()<target;trip++){
    requireSafeWork(service,signal);const bot=service.runtime.bot;
    await commonWoodSpecies(service,signal);
    const root=requireNaturalTree(bot);
    await collect(bot,uniqueTreeLogs(bot,root,Math.min(8,target-count())),signal);await confirmInventory(bot);
  }
  if(count()<target)throw new Error('I tried gathering common wood but could not confirm enough logs on this route.');
}
export async function ensureMiningTorches(service,target,signal){
  const bot=service.runtime.bot;
  if(freeBasic(service,'torch')>=target)return;
  await withdrawTarget(service,'torch',target,signal);
  for(const name of ['coal','charcoal']){
    const missingFuel=Math.max(0,Math.ceil((target-freeBasic(service,'torch'))/4)-freeBasic(service,'coal')-freeBasic(service,'charcoal'));
    if(missingFuel)await withdrawTarget(service,name,freeBasic(service,name)+missingFuel,signal);
  }
  while(freeBasic(service,'torch')<target){
    requireSafeWork(service,signal);
    if(freeBasic(service,'coal')+freeBasic(service,'charcoal')<1){
      preparationPhase(service,'making-charcoal');
      const pending=service.store.get('furnaceJobs').some(job=>job.category==='mining-fuel'&&['cooking','needs-check'].includes(job.status)&&job.realmId===service.store.settings().realmId&&job.dimension===bot.game.dimension);
      const batch=Math.min(8,Math.ceil((target-freeBasic(service,'torch'))/4));
      if(!pending)await gatherCommonLogs(service,batch,signal);
      const recipes=Object.fromEntries(Object.keys(bot.registry.itemsByName).filter(name=>name.endsWith('_log')).map(name=>[name,'charcoal']));
      await cookFood(service,{count:batch},signal,{recipes,category:'mining-fuel'});
    }
    preparationPhase(service,'crafting-torches');
    const before=freeBasic(service,'torch');
    // One recipe at a time can combine partial coal and charcoal stacks.
    await ensureBasicItem(service,'torch',before+4,signal);
    if(freeBasic(service,'torch')<=before)throw new Error('Torch crafting made no confirmed progress.');
  }
}
export async function prepareMining(service,signal,{food=MINING_LIMITS.food,torches=MINING_LIMITS.torches}={}){
  const bot=requireSafeWork(service,signal);
  try{
    if(valuableCargo(bot)){preparationPhase(service,'storing-valuables');await storeSurplus(service,signal);if(valuableCargo(bot))throw new Error('Protected valuables still need safe storage before a mining trip.');}
    preparationPhase(service,'checking-chests');
    for(const name of MINING_FOOD){if(miningFoodCount(service)>=food)break;await withdrawTarget(service,name,freeBasic(service,name)+food-miningFoodCount(service),signal);}
    await service.withdraw([{name:'torch',count:torches},{name:'stone_pickaxe',count:1}],signal);
    for(const [name,target] of [['cobblestone',3],['stick',8],['crafting_table',1],['furnace',1]])await withdrawTarget(service,name,target,signal);
    if(!bot.inventory.items().some(i=>/_(log|planks)$/.test(i.name)&&freeBasic(service,i.name)>0))for(const name of ['oak_log','spruce_log','birch_log']){await withdrawTarget(service,name,8,signal);if(freeBasic(service,name))break;}
    for(let attempt=0;attempt<MINING_LIMITS.foodAttempts&&(miningFoodCount(service)<food||bot.food<18);attempt++){
      preparationPhase(service,'getting-food');
      if(bot.food<18){const meal=bot.inventory.items().find(i=>MINING_FOOD.includes(i.name)&&freeBasic(service,i.name)>0);if(meal){await bot.equip(meal,'hand');await bot.consume();await confirmInventory(bot);signal.throwIfAborted();}}
      if(miningFoodCount(service)>=food&&bot.food>=18)break;
      const before=miningFoodCount(service),result=await findFood(service,signal);
      if(!result.success&&miningFoodCount(service)<=before)break;
    }
    if(miningFoodCount(service)<food||bot.food<16)throw new Error('I checked supplies and tried safe food gathering, but still lack the food reserve for mining. I kept the prepared kit.');
    if(!miningPick(bot)){
      preparationPhase(service,'making-pickaxe');
      await gatherSurfaceStone(service,3,signal);
      await ensureBasicItem(service,'stone_pickaxe',1,signal,0,{stock:()=>miningPick(bot)?1:0});
    }
    await ensureMiningTorches(service,torches,signal);
    requireSafeWork(service,signal);if(!miningPick(bot))throw new Error('No confirmed iron-capable pickaxe is available.');
    await bot.equip(miningPick(bot),'hand');await confirmInventory(bot);
    preparationPhase(service,'ready',{food:miningFoodCount(service),torches:freeBasic(service,'torch')});
    return {success:true,summary:'Mining kit ready. I checked remembered approved chests and prepared missing food, a pickaxe and torches myself.'};
  }catch(error){preparationPhase(service,signal.aborted?'paused':'blocked',{reason:error.message});throw error;}
}
