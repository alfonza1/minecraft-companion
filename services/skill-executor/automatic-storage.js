import {randomUUID} from 'node:crypto';
import {storageAnchor,HOME_STORAGE_RADIUS} from './storage-policy.js';
import {emptyUtilitySites,ensureBasicItem,placeUtility} from './basic-production.js';
import {requireSafeWork,approvedStores} from './survival.js';

export const MAX_AUTOMATIC_CHESTS = 12;
const LEGACY_SUPPLIES=['bread','cooked_beef','cooked_porkchop','cooked_chicken','cooked_mutton','carrot','baked_potato','oak_log','spruce_log','birch_log','oak_planks','spruce_planks','birch_planks','stick','coal','charcoal','cobblestone','torch','crafting_table','wooden_axe','stone_axe','iron_axe'];
export const AUTOMATIC_SUPPLIES=[...LEGACY_SUPPLIES,'wooden_pickaxe','stone_pickaxe','iron_pickaxe','furnace','iron_ingot','raw_iron'];
export function upgradeAutomaticSupplies(store){
  for(const chest of store.get('supplyChests')){
    // Preserve manually changed permissions; only migrate our exact old default.
    if(chest.automatic&&chest.approved&&!chest.supplyPolicyVersion&&chest.allowedItems?.length===LEGACY_SUPPLIES.length&&LEGACY_SUPPLIES.every(name=>chest.allowedItems.includes(name)))store.put('supplyChests',{...chest,allowedItems:AUTOMATIC_SUPPLIES,supplyPolicyVersion:2});
  }
}
export async function ensureStorage(service,signal,{forceNew=false}={}){
  const bot=requireSafeWork(service,signal),anchor=storageAnchor(service);
  if(!anchor)throw new Error('Home/spawn is not known in this dimension yet.');
  if(!forceNew&&approvedStores(service).length)return {success:true,summary:'Home/spawn storage is available.'};
  const existing=service.store.get('supplyChests').filter(chest=>chest.automatic&&chest.realmId===anchor.realmId&&chest.dimension===anchor.dimension&&Math.hypot(chest.position.x-anchor.position.x,chest.position.y-anchor.position.y,chest.position.z-anchor.position.z)<=HOME_STORAGE_RADIUS);
  if(existing.length>=MAX_AUTOMATIC_CHESTS)throw new Error('Automatic storage reached 12 chests at this home. Empty some storage before expanding it further.');
  const chooseSite=()=>emptyUtilitySites(bot,anchor.position,16).find(p=>!service.store.get('projects').some(project=>{
    const scope=project.construction??project.checkpoint;if(scope?.realmId!==anchor.realmId||scope.dimension!==anchor.dimension||!project.blueprint)return false;
    return p.x>=scope.origin.x-1&&p.x<=scope.origin.x+project.blueprint.dimensions.x&&p.z>=scope.origin.z-1&&p.z<=scope.origin.z+project.blueprint.dimensions.z;
  }));
  let site=chooseSite();
  if(!site)throw new Error('No clear observed chest site at Home/spawn. I will not clear existing structures.');
  await ensureBasicItem(service,'chest',1,signal);requireSafeWork(service,signal);
  const current=storageAnchor(service);
  if(!current||current.realmId!==anchor.realmId||current.dimension!==anchor.dimension||JSON.stringify(current.position)!==JSON.stringify(anchor.position))throw new Error('Storage destination changed while preparing the chest.');
  site=chooseSite();if(!site)throw new Error('Chest site changed while crafting.');
  const placed=await placeUtility(service,'chest',site,signal,()=>{
    const live=storageAnchor(service);
    if(!live||live.realmId!==anchor.realmId||live.dimension!==anchor.dimension||JSON.stringify(live.position)!==JSON.stringify(anchor.position))throw new Error('Home/spawn changed before chest placement.');
  });
  service.store.put('supplyChests',{id:randomUUID(),name:`Companion storage ${existing.length+1}`,position:placed.position,realmId:anchor.realmId,dimension:anchor.dimension,approved:true,depositAllowed:true,automatic:true,allowedItems:AUTOMATIC_SUPPLIES,supplyPolicyVersion:2,inventory:[],observedAt:placed.at,provenance:'companion-placed'});
  service.publish();return {success:true,created:true,position:placed.position,summary:`Made and placed a new chest at ${anchor.kind==='home'?'Home':'spawn'}.`};
}
