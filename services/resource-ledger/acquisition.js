import {splitAssignments} from './index.js';

export function acquisitionAdvice(name){
  if(name==='scaffolding')return {difficulty:'player-recommended',aiPercent:0,reason:'Bamboo scaffolding needs bamboo and string. Bamboo is biome-specific and string can require hostile drops. Temporary building platforms use dirt or cobblestone instead; they do not need bamboo.'};
  if(['bamboo','jungle_log','cocoa_beans','mangrove_log','cherry_log','acacia_log','dark_oak_log'].includes(name))return {difficulty:'player-recommended',aiPercent:0,reason:'This can require a particular biome or a known planted source. I can search nearby loaded surface terrain when you explicitly ask, but cannot promise to locate a distant biome.'};
  if(['string','slime_ball','ender_pearl','blaze_rod'].includes(name))return {difficulty:'player-recommended',aiPercent:0,reason:'This may require hostile mobs, uncommon drops or dangerous travel. It is assigned to you by default; a search request never authorizes unsafe combat or portal travel.'};
  if(['glass','stone','stone_bricks','smooth_stone','terracotta'].includes(name))return {difficulty:'player-recommended',aiPercent:0,reason:'The build supply controller does not yet run this furnace production chain. Please bring finished items or provide them in an approved supply chest.'};
  if(['oak_log','spruce_log','birch_log'].includes(name))return {difficulty:'conditional',aiPercent:50,reason:'The companion can gather observed natural trees. A reachable forest, useful axe, safe conditions and approved storage are required.'};
  if(['cobblestone','cobbled_deepslate','dirt','sand','gravel'].includes(name))return {difficulty:'conditional',aiPercent:50,reason:'Gathering needs an approved mining area, suitable equipment and observed safe blocks. Assigned auto-gather currently supports logs; request mining explicitly.'};
  if(name==='wheat')return {difficulty:'conditional',aiPercent:50,reason:'The companion can harvest mature wheat in an approved existing farm and replant it. Availability must be observed.'};
  return {difficulty:'player-recommended',aiPercent:0,reason:'No validated automatic acquisition route for this material. You handle it by default; rare loot, special biomes, trading, hostile drops and untested production need human review.'};
}

export function assistedAssignments(materials,previous=[]){
  return materials.map(row=>{
    const advice=acquisitionAdvice(row.name);
    return {...splitAssignments([row],advice.aiPercent,previous)[0],acquisition:advice};
  });
}
