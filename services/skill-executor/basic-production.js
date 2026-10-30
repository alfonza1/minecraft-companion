import {terrainFrontiers} from './terrain.js';
import { randomUUID } from 'node:crypto';
import { Vec3 } from 'vec3';
import { requireNaturalTree } from './index.js';
import { uniqueTreeLogs } from './tree-targets.js';
import { collect } from '../../src/tools/play.js';
import { confirmInventory } from './items.js';
import { navigateWithRecovery } from './navigation.js';
import { approach,occupied,abortableWait } from '../build-executor/site.js';
import { EMPTY,fullCube,placeAdaptedBlock } from '../build-executor/placement.js';

const BASIC=/^(chest|crafting_table|stick|bread|wooden_axe|wooden_sword|furnace|[a-z_]+_planks)$/;
export const freeBasic=(service,name)=>service.runtime.bot.inventory.items().some(item=>item.name===name&&(item.customName||item.enchants?.length))?0:Math.max(0,service.runtime.bot.inventory.items().filter(item=>item.name===name&&!item.customName&&!item.enchants?.length).reduce((n,item)=>n+item.count,0)-service.reserved(name));
function outsideBuilds(service,p){
  return !(service.store?.get('projects')??[]).some(project=>{
    const scope=project.construction??project.checkpoint;
    return scope?.realmId===service.store.settings().realmId&&scope.dimension===service.runtime.bot.game.dimension&&project.blueprint&&p.x>=scope.origin.x-1&&p.x<=scope.origin.x+project.blueprint.dimensions.x&&p.z>=scope.origin.z-1&&p.z<=scope.origin.z+project.blueprint.dimensions.z;
  });
}
export function emptyUtilitySites(bot,anchor,radius=8){
  const points=[];
  for(let x=-radius;x<=radius;x++)for(let z=-radius;z<=radius;z++)for(let y=-Math.min(radius,16);y<=Math.min(radius,16);y++){
    const p=new Vec3(Math.floor(anchor.x)+x,Math.floor(anchor.y)+y,Math.floor(anchor.z)+z);
    if(/chest|barrel|furnace|crafting_table|bed|hopper|dispenser|dropper|farmland|magma|fire|cactus/.test(bot.blockAt(p.offset(0,-1,0))?.name??''))continue;
    if(p.distanceTo(new Vec3(anchor.x,anchor.y,anchor.z))>radius||occupied(bot,p,2)||!EMPTY.has(bot.blockAt(p)?.name)||!EMPTY.has(bot.blockAt(p.offset(0,1,0))?.name)||!fullCube(bot.blockAt(p.offset(0,-1,0))))continue;
    if([[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dz])=>/chest|door|bed|furnace/.test(bot.blockAt(p.offset(dx,0,dz))?.name??'')))continue;
    points.push(p);
  }
  return points.sort((a,b)=>a.distanceTo(bot.entity.position)-b.distanceTo(bot.entity.position));
}
export async function placeUtility(service,name,p,signal,validate=()=>{}){
  const bot=service.runtime.bot,realmId=service.store.settings().realmId,dimension=bot.game.dimension;
  await approach(bot,p,signal,2);signal.throwIfAborted();
  const item=bot.inventory.items().find(item=>item.name===name&&!item.customName&&!item.enchants?.length);
  if(!item||freeBasic(service,name)<1)throw new Error(`Need an unreserved ${name}.`);
  await bot.equip(item,'hand');signal.throwIfAborted();
  const record={id:randomUUID(),name,realmId,dimension,position:{x:p.x,y:p.y,z:p.z},status:'intent',at:new Date().toISOString()};service.store.put('utilityBlocks',record);
  let sent=false;
  const acknowledged=(_old,block)=>{if(sent&&block?.position.equals(p)&&block.name===name){record.status='placed';service.store.put('utilityBlocks',record);}};
  bot.on('blockUpdate',acknowledged);
  try{
    await abortableWait(scoped=>placeAdaptedBlock(bot,{name},p,{reference:bot.blockAt(p.offset(0,-1,0)),face:new Vec3(0,1,0)},scoped,()=>{
      signal.throwIfAborted();
      validate();
      if(!outsideBuilds(service,p))throw new Error('Utility site overlaps a saved construction project.');
      if(service.store.settings().realmId!==realmId||bot.game.dimension!==dimension||!EMPTY.has(bot.blockAt(p)?.name)||!EMPTY.has(bot.blockAt(p.offset(0,1,0))?.name)||!fullCube(bot.blockAt(p.offset(0,-1,0)))||occupied(bot,p,2))throw new Error('Utility placement site changed.');
      sent=true;
    }),signal,bot);
    if(record.status!=='placed')throw new Error('Utility placement has no server acknowledgement.');
    await confirmInventory(bot);signal.throwIfAborted();return record;
  }finally{bot.removeListener('blockUpdate',acknowledged);}
}
export async function ensureBasicItem(service,name,target,signal,depth=0){
  const bot=service.runtime.bot;
  signal.throwIfAborted();if(freeBasic(service,name)>=target)return;
  if(depth>5||!BASIC.test(name))throw new Error(`No automatic basic production route for ${name}.`);
  let table=null;
  if(!['crafting_table','stick'].includes(name)&&!name.endsWith('_planks')){
    table=bot.findBlock({matching:bot.registry.blocksByName.crafting_table.id,maxDistance:24});
    if(!table){await ensureBasicItem(service,'crafting_table',1,signal,depth+1);const site=emptyUtilitySites(bot,bot.entity.position,5).find(p=>outsideBuilds(service,p));if(!site)throw new Error('No clear workbench site nearby.');await placeUtility(service,'crafting_table',site,signal);table=bot.blockAt(site);}
  }
  const recipes=bot.recipesAll(bot.registry.itemsByName[name].id,null,Boolean(table));
  let preferred=bot.inventory.items().find(item=>/_(?:log|planks)$/.test(item.name)&&freeBasic(service,item.name)>0)?.name.replace(/_(?:log|planks)$/,'');
  if(!preferred&&!name.endsWith('_planks')&&!['bread','furnace'].includes(name)){
    const anchor=bot.entity.position.clone(),visited=[];
    for(let scout=0;scout<3&&!preferred;scout++){
      signal.throwIfAborted();
      try{preferred=requireNaturalTree(bot).name.replace('_log','');}
      catch(error){
        const next=terrainFrontiers(bot,anchor,16,visited)[0];if(!next)break;
        await navigateWithRecovery(bot,next,0,signal);visited.push(next.toString());
      }
    }
  }
  const ingredientStock=ingredient=>freeBasic(service,ingredient)+(ingredient.endsWith('_planks')?4*freeBasic(service,ingredient.replace('_planks','_log')):0);
  recipes.sort((a,b)=>{
    const missing=recipe=>recipe.delta.filter(value=>value.count<0).reduce((sum,value)=>{
      const input=bot.registry.items[value.id].name;
      return sum+Math.max(0,-value.count-ingredientStock(input))+(preferred&&input.endsWith('_planks')&&input!==`${preferred}_planks`?16:0);
    },0);
    return missing(a)-missing(b);
  });
  const recipe=recipes.find(value=>value.delta.filter(input=>input.count<0).every(input=>{
    const ingredient=bot.registry.items[input.id]?.name;return ingredient&&(ingredient.endsWith('_log')||ingredient.endsWith('_planks')||ingredient==='stick'||freeBasic(service,ingredient)>=-input.count);
  }));
  if(!recipe)throw new Error(`Missing basic recipe or ingredients for ${name}.`);
  const repetitions=Math.min(8,Math.ceil((target-freeBasic(service,name))/recipe.result.count));
  // Intermediate recipes can consume an earlier ingredient (sticks use planks).
  // Reconcile the actual stock before the final recipe instead of assuming all
  // previously prepared ingredients are still available.
  for(let pass=0;pass<3;pass++)for(const input of recipe.delta.filter(value=>value.count<0)){
    const ingredient=bot.registry.items[input.id].name,needed=-input.count*repetitions;
    if(ingredient.endsWith('_log')){
      for(let trip=0;freeBasic(service,ingredient)<needed&&trip<4;trip++){
        signal.throwIfAborted();let root;
        try{root=requireNaturalTree(bot,ingredient.replace('_log',''));}
        catch(error){
          const next=terrainFrontiers(bot,bot.entity.position,16,[])[0];
          if(!next)throw error;
          await navigateWithRecovery(bot,next,0,signal);continue;
        }
        const result=await collect(bot,uniqueTreeLogs(bot,root,Math.min(4,needed-freeBasic(service,ingredient))),signal);
        if(!result.mined)throw new Error('No confirmed wood gathering progress.');await confirmInventory(bot);
      }
    }else if(freeBasic(service,ingredient)<needed)await ensureBasicItem(service,ingredient,needed,signal,depth+1);
  }
  if(recipe.requiresTable)await navigateWithRecovery(bot,table.position,2,signal);
  signal.throwIfAborted();
  if(!recipe.delta.filter(value=>value.count<0).every(value=>freeBasic(service,bot.registry.items[value.id].name)>=-value.count*repetitions))throw new Error('Basic ingredients changed or are reserved.');
  const originalClick=bot.clickWindow;
  bot.clickWindow=async(...args)=>{signal.throwIfAborted();await originalClick(...args);await bot.waitForTicks(2);signal.throwIfAborted();await confirmInventory(bot,bot.currentWindow??bot.inventory);};
  try{await bot.craft(recipe,repetitions,recipe.requiresTable?table:null);}finally{bot.clickWindow=originalClick;}
  await confirmInventory(bot);signal.throwIfAborted();if(freeBasic(service,name)<target)throw new Error(`No confirmed ${name} production.`);
}
