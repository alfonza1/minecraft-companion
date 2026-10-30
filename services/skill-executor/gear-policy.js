export const GEAR_LIMITS=Object.freeze({minimumDurability:16,replacementFraction:.08,wearSyncMargin:2,maxCrafts:8,supplyRadius:64,supplyMaxAgeMs:300000});
export const TOOL_FAMILIES=['pickaxe','axe','sword','shovel','hoe'];
export const ARMOR_SLOTS={helmet:'head',chestplate:'torso',leggings:'legs',boots:'feet'};
export const GEAR_PRIORITY=['pickaxe','chestplate','leggings','helmet','boots','axe','sword','shovel'];
const TIERS=['wooden','stone','leather','chainmail','iron','diamond','netherite'];
export const gearFamily=name=>name?.match(/_(pickaxe|axe|sword|shovel|hoe|helmet|chestplate|leggings|boots)$/)?.[1];
export const gearRank=name=>TIERS.indexOf(name?.split('_')[0]);
export const protectedGear=item=>Boolean(item?.customName||item?.enchants?.length);
export function remainingDurability(bot,item){
  const maximum=bot.registry?.itemsByName[item?.name]?.maxDurability;
  return maximum?maximum-(item.durabilityUsed??0):Infinity;
}
export function replacementThreshold(bot,item){return Math.max(GEAR_LIMITS.minimumDurability,Math.ceil((bot.registry?.itemsByName[item?.name]?.maxDurability??0)*GEAR_LIMITS.replacementFraction));}
export const wornGear=(bot,item)=>remainingDurability(bot,item)<=replacementThreshold(bot,item);
export function familyItems(bot,family){
  const equipped=Object.values(ARMOR_SLOTS).map(slot=>bot.inventory.slots?.[bot.getEquipmentDestSlot?.(slot)]).filter(Boolean);
  return [...new Map([...bot.inventory.items(),...equipped].map(item=>[item.slot??item,item])).values()].filter(item=>gearFamily(item.name)===family);
}
export function bestOwnedGear(bot,family){
  return familyItems(bot,family).filter(item=>remainingDurability(bot,item)>=GEAR_LIMITS.minimumDurability)
    .sort((a,b)=>Number(wornGear(bot,a))-Number(wornGear(bot,b))||gearRank(b.name)-gearRank(a.name)||remainingDurability(bot,b)-remainingDurability(bot,a))[0];
}
