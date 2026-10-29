import {splitAssignments} from './index.js';

export function acquisitionAdvice(name){
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
