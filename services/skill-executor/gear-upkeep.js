import {ensureBasicItem,freeBasic} from './basic-production.js';
import {requireSafeWork,cookFood} from './survival.js';
import {confirmInventory} from './items.js';
import {Vec3} from 'vec3';
import {GEAR_LIMITS,GEAR_PRIORITY,ARMOR_SLOTS,gearFamily,gearRank,protectedGear,remainingDurability,replacementThreshold,wornGear,familyItems,bestOwnedGear} from './gear-policy.js';

const MATERIALS={wooden:'planks',stone:'cobblestone',leather:'leather',iron:'iron_ingot',diamond:'diamond'};
const MATERIAL_COST={pickaxe:3,axe:3,sword:2,shovel:1,hoe:2,helmet:5,chestplate:8,leggings:7,boots:4};
const isArmor=family=>Boolean(ARMOR_SLOTS[family]);
const plainCount=(bot,name)=>bot.inventory.items().filter(item=>item.name===name&&!protectedGear(item)).reduce((sum,item)=>sum+item.count,0);
const wornFamily=(bot,family)=>{const items=familyItems(bot,family);return items.length>0&&items.every(item=>wornGear(bot,item));};
function ingredientBudget(service,name,{storage=false}={}){
  let count=freeBasic(service,name);
  if(storage&&name!=='diamond')for(const chest of service.store.get('supplyChests')){
    if(chest.approved&&chest.realmId===service.store.settings().realmId&&chest.dimension===service.runtime.bot.game.dimension&&chest.position&&service.runtime.bot.entity.position.distanceTo(new Vec3(chest.position.x,chest.position.y,chest.position.z))<=GEAR_LIMITS.supplyRadius&&chest.allowedItems?.includes(name)&&chest.observedAt&&Date.now()-Date.parse(chest.observedAt)<GEAR_LIMITS.supplyMaxAgeMs)count+=(chest.inventory??[]).filter(item=>item.name===name&&!protectedGear(item)).reduce((n,item)=>n+item.count,0);
  }
  return count;
}
export function gearPlan(service,{family,storage=true}={}){
  const bot=service.runtime.bot;
  for(const part of family?[family]:GEAR_PRIORITY){
    const owned=familyItems(bot,part),best=bestOwnedGear(bot,part),needsReplacement=wornFamily(bot,part);
    const equipped=isArmor(part)?bot.inventory.slots?.[bot.getEquipmentDestSlot?.(ARMOR_SLOTS[part])]:bot.heldItem;
    if(equipped&&gearFamily(equipped.name)===part&&protectedGear(equipped)&&!wornGear(bot,equipped))continue;
    for(const tier of isArmor(part)?['diamond','iron','leather']:['diamond','iron','stone','wooden']){
      const name=`${tier}_${part}`;if(!bot.registry.itemsByName[name])continue;
      if(best&&!wornGear(bot,best)&&gearRank(best.name)>=gearRank(name))continue;
      // No spares unless the best owned member is actually wearing out.
      if(owned.some(item=>item.name===name&&!wornGear(bot,item)))continue;
      const material=MATERIALS[tier],needed=MATERIAL_COST[part];
      const available=tier==='wooden'?bot.inventory.items().filter(item=>item.name.endsWith('_planks')||item.name.endsWith('_log')).reduce((n,item)=>n+freeBasic(service,item.name)*(item.name.endsWith('_log')?4:1),0):ingredientBudget(service,material,{storage});
      if(available<needed)continue;
      // Mid-action repairs may use existing wood, but never start a nested
      // gathering job while an outer mining controller owns the route.
      if(family&&!isArmor(part)&&freeBasic(service,'stick')<(part==='sword'?1:2)&&!bot.inventory.items().some(item=>/_(log|planks)$/.test(item.name)&&freeBasic(service,item.name)>0))continue;
      return {item:name,family:part,material,cost:needed,replacement:needsReplacement};
    }
  }
  return null;
}
export function gearNeedsAttention(service){
  const bot=service.runtime.bot;
  if(!bot?.registry?.itemsByName)return false;
  if(gearPlan(service))return true;
  for(const family of GEAR_PRIORITY){
    const best=bestOwnedGear(bot,family);if(!best)continue;
    const current=isArmor(family)?bot.inventory.slots?.[bot.getEquipmentDestSlot?.(ARMOR_SLOTS[family])]:bot.heldItem;
    if(isArmor(family)&&(!current||(wornGear(bot,current)&&current.slot!==best.slot)||(!protectedGear(current)&&gearRank(best.name)>gearRank(current.name))))return true;
  }
  return service.store.get('furnaceJobs').some(job=>job.category==='gear'&&['cooking','needs-check'].includes(job.status)&&job.realmId===service.store.settings().realmId&&job.dimension===bot.game.dimension)||freeBasic(service,'raw_iron')>0&&GEAR_PRIORITY.some(family=>!bestOwnedGear(bot,family)||gearRank(bestOwnedGear(bot,family).name)<gearRank('iron_'+family));
}
async function equipOwned(service,signal,{family}={}){
  const bot=service.runtime.bot;
  for(const part of family?[family]:GEAR_PRIORITY){
    const best=bestOwnedGear(bot,part);if(!best)continue;
    const destination=ARMOR_SLOTS[part]??'hand';
    if(destination==='hand'&&gearFamily(bot.heldItem?.name)&&gearFamily(bot.heldItem.name)!==part)continue;
    const current=destination==='hand'?bot.heldItem:bot.inventory.slots[bot.getEquipmentDestSlot(destination)];
    if(current?.slot===best.slot||current&&protectedGear(current)&&!wornGear(bot,current))continue;
    if(current&&!wornGear(bot,current)&&gearRank(current.name)>=gearRank(best.name))continue;
    signal.throwIfAborted();await bot.equip(best,destination);await confirmInventory(bot);signal.throwIfAborted();
    const confirmed=destination==='hand'?bot.heldItem:bot.inventory.slots[bot.getEquipmentDestSlot(destination)];
    if(confirmed?.name!==best.name)throw new Error('Server did not confirm the gear change.');
  }
}
export async function maintainGear(service,signal,{family,smelt=true}={}){
  const bot=requireSafeWork(service,signal);
  if(service.runtime.connection?.realmId!=null&&service.runtime.connection.realmId!==service.store.settings().realmId)throw new Error('Gear upkeep belongs to the connected Realm.');
  const made=[];
  await equipOwned(service,signal,{family});
  if(!family&&smelt&&(freeBasic(service,'raw_iron')>0||service.store.get('furnaceJobs').some(job=>job.category==='gear'&&['cooking','needs-check'].includes(job.status)&&job.realmId===service.store.settings().realmId&&job.dimension===bot.game.dimension)))await cookFood(service,{count:8},signal,{recipes:{raw_iron:'iron_ingot'},category:'gear'});
  for(let craft=0;craft<(family?1:GEAR_LIMITS.maxCrafts);craft++){
    requireSafeWork(service,signal);const plan=gearPlan(service,{family,storage:!family});if(!plan)break;
    if(plan.material!=='diamond'&&plan.material!=='planks'&&freeBasic(service,plan.material)<plan.cost&&service.withdraw)await service.withdraw([{name:plan.material,count:plan.cost+service.reserved(plan.material)}],signal);
    if(plan.material!=='planks'&&freeBasic(service,plan.material)<plan.cost)break;
    const target=plainCount(bot,plan.item)+1;
    await ensureBasicItem(service,plan.item,target,signal,0,{stock:()=>plainCount(bot,plan.item)});
    made.push(plan.item);await equipOwned(service,signal,{family:plan.family});
  }
  service.publish();return {success:true,crafted:made,summary:made.length?`Made and equipped ${made.join(', ')}. Kept older gear for safe storage.`:'Checked tools, armor and available replacements.'};
}
export async function maintainMiningTool(service,block,signal){
  const bot=service.runtime.bot;if(bot.companionMaintainingGear||service.store.settings().teammate?.autoGear===false)return;
  const family=block.name.endsWith('_log')?'axe':['stone','deepslate'].includes(block.name)||block.name.includes('_ore')?'pickaxe':null;
  // Dig completion predicts the world before its durability packet arrives.
  // Confirm only near the replacement boundary, avoiding a sync on every log.
  if(family&&gearFamily(bot.heldItem?.name)===family&&remainingDurability(bot,bot.heldItem)<=replacementThreshold(bot,bot.heldItem)+GEAR_LIMITS.wearSyncMargin){await confirmInventory(bot);signal.throwIfAborted();}
  if(!family||!wornFamily(bot,family)||!gearPlan(service,{family,storage:false}))return;
  bot.companionMaintainingGear=true;
  try{await maintainGear(service,signal,{family,smelt:false});}
  finally{bot.companionMaintainingGear=false;}
}
