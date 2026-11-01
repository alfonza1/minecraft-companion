import { calculateMaterials } from '../build-planner/materials.js';

const cache = new Map();
const MAX_CACHED_PROJECTS = 100;

// This is shared project demand satisfied by observed construction, never proof
// of who gathered an item. Recalculate remaining recipe batches to honor yields.
export function constructionSatisfaction(project) {
  const blueprint=project.blueprint,checkpoint=project.checkpoint;
  if(!blueprint?.version||!Array.isArray(blueprint.blocks)||!Array.isArray(project.materials?.raw)||checkpoint?.revision!==project.revision)return {};
  const verified=[...new Set(checkpoint.verified||[])].filter(index=>Number.isInteger(index)&&index>=0&&index<blueprint.blocks.length).sort((a,b)=>a-b);
  if(!verified.length)return {};
  const key=JSON.stringify([project.id,project.revision,blueprint.version,checkpoint.updatedAt,verified]);
  if(cache.has(key))return {...cache.get(key)};
  try{
    const indices=new Set(verified),remaining=calculateMaterials({...blueprint,blocks:blueprint.blocks.filter((_,index)=>!indices.has(index))});
    const needed=Object.fromEntries(remaining.raw.map(row=>[row.name,row.quantity]));
    const credit=Object.fromEntries(project.materials.raw.map(row=>[row.name,Math.max(0,row.quantity-(needed[row.name]||0))]));
    cache.set(key,credit);if(cache.size>MAX_CACHED_PROJECTS)cache.delete(cache.keys().next().value);
    return {...credit};
  }catch{return {};}
}
