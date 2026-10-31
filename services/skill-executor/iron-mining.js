import {prepareMining,miningPick,preparationPhase} from './mining-preparation.js';
import {freeBasic} from './basic-production.js';
import {requireSafeWork,cookFood,storeSurplus} from './survival.js';
import {findResource} from './resource-search.js';
import {protectedCookingSource} from './cooking-preparation.js';
import {clearFooting,observedTerrainPath} from './terrain.js';
import {collect} from '../../src/tools/play.js';
import {confirmInventory} from './items.js';
import {GEAR_LIMITS} from './gear-policy.js';

const ORES=['iron_ore','deepslate_iron_ore'];
const NEIGHBORS=[[1,0,0],[-1,0,0],[0,0,1],[0,0,-1],[0,1,0],[0,-1,0]];
const unfinished=m=>m&&!['complete','cancelled'].includes(m.status);
export function reservedMiningMaterials(service,name){
  return service.store.get('miningMissions').filter(m=>unfinished(m)&&m.realmId===service.store.settings().realmId&&m.dimension===service.runtime.bot?.game.dimension).reduce((n,m)=>n+Math.max(0,m.reservations?.[name]??0),0);
}
export function safeIronSource(service,block,{visible=true}={}){
  const bot=service.runtime.bot,p=block?.position;
  if(!p||!ORES.includes(block.name)||protectedCookingSource(service,p)||p.y<Math.floor(bot.entity.position.y)||(visible&&!bot.canSeeBlock(block)))return false;
  const neighbors=NEIGHBORS.map(([x,y,z])=>bot.blockAt(p.offset(x,y,z)));
  return neighbors.every(Boolean)&&neighbors.some(b=>b.boundingBox==='empty')&&!neighbors.some(b=>/lava|water|tnt|fire/.test(b.name))&&neighbors.filter(b=>['stone','deepslate',...ORES].includes(b.name)).length>=2;
}
function visibleFrom(bot,block,stance){
  if(!bot.world?.raycast)return bot.canSeeBlock(block);
  const eye=stance.offset(.5,bot.entity.eyeHeight??1.62,.5),direction=block.position.offset(.5,.5,.5).minus(eye),distance=direction.norm();
  return bot.world.raycast(eye,direction.scaled(1/distance),distance+.1)?.position.equals(block.position)??false;
}
export function ironStance(service,block){
  const bot=service.runtime.bot,here=bot.entity.position.floored();
  if(bot.canDigBlock(block)&&bot.canSeeBlock(block)&&clearFooting(bot,here))return here;
  const candidates=[];
  for(let x=-2;x<=2;x++)for(let z=-2;z<=2;z++)for(const y of [0,-1]){
    const p=block.position.offset(x,y,z);
    if(p.distanceTo(block.position)>3||!clearFooting(bot,p)||!visibleFrom(bot,block,p))continue;
    candidates.push(p);
  }
  return candidates.sort((a,b)=>a.distanceTo(bot.entity.position)-b.distanceTo(bot.entity.position)).find(p=>observedTerrainPath(bot,p));
}
async function harvestVein(service,root,needed,signal,{travel,origin,radius}){
  const bot=service.runtime.bot,matching=ORES.map(name=>bot.registry.blocksByName[name].id),before=freeBasic(service,'raw_iron');
  for(let attempt=0;attempt<needed*2+4&&freeBasic(service,'raw_iron')-before<needed;attempt++){
    requireSafeWork(service,signal,{roam:true});
    if(bot.inventory.emptySlotCount()===0&&!bot.inventory.items().some(i=>i.name==='raw_iron'&&!i.customName&&i.count<(i.stackSize??64)))throw new Error('My inventory has no room for more iron. I am returning with the loot I have.');
    const targets=bot.findBlocks({matching,maxDistance:32,count:64}).map(p=>bot.blockAt(p)).filter(b=>b&&b.position.distanceTo(root.position)<=6&&b.position.distanceTo(origin)<=radius&&safeIronSource(service,b,{visible:false})).sort((a,b)=>a.position.distanceTo(bot.entity.position)-b.position.distanceTo(bot.entity.position));
    const block=targets.find(b=>ironStance(service,b));if(!block)break;
    const stance=ironStance(service,block);await travel(stance,false,{tolerance:0});
    const tool=miningPick(bot,{minimumUses:GEAR_LIMITS.minimumDurability});
    if(!tool)throw new Error('My mining pick needs replacement. The iron and return route are saved.');
    await bot.equip(tool,'hand');signal.throwIfAborted();
    if(!safeIronSource(service,bot.blockAt(block.position)))continue;
    const beforePickup=freeBasic(service,'raw_iron');
    const result=await collect(bot,[bot.blockAt(block.position)],signal,{pickupRadius:1.25,toolFilter:item=>!item?.enchants?.some(e=>e.name==='silk_touch')});await confirmInventory(bot);
    if(!result.mined)break;
    if(freeBasic(service,'raw_iron')<=beforePickup)throw new Error('The ore broke but its raw iron pickup was not confirmed. I am returning rather than leaving more loot behind.');
  }
  return freeBasic(service,'raw_iron')-before;
}
export async function getIron(base,{count=8,radius=256},signal){
  const bot=requireSafeWork(base,signal),realmId=base.store.settings().realmId,dimension=bot.game.dimension;
  const previous=base.store.get('miningMissions').find(m=>m.id==='iron');
  if(unfinished(previous)&&(previous.realmId!==realmId||previous.dimension!==dimension))throw new Error('An unfinished iron trip belongs to another Realm/dimension. Its materials and route remain saved.');
  const mission=unfinished(previous)&&previous.target===count?previous:{id:'iron',realmId,dimension,target:count,delivered:0,reservations:{},receipts:[],status:'preparing'};
  const service=Object.create(base);
  service.reserved=name=>Math.max(0,base.reserved(name)-(mission.reservations?.[name]??0));
  const owned=()=>freeBasic(service,'iron_ingot')+freeBasic(service,'raw_iron');
  const scope=()=>{signal.throwIfAborted();if(base.runtime.bot!==bot||base.store.settings().realmId!==realmId||bot.game.dimension!==dimension)throw new Error('Iron-trip scope changed; its checkpoint remains saved.');};
  const save=patch=>{
    Object.assign(mission,patch);
    if(!bot.companionInventoryUnverified)mission.reservations=Object.fromEntries(['raw_iron','iron_ingot'].map(name=>[name,Math.min(Math.max(0,count-mission.delivered),freeBasic(service,name))]));
    if(['complete','cancelled'].includes(mission.status))mission.reservations={};
    mission.updatedAt=new Date().toISOString();base.store.put('miningMissions',mission);base.publish();
  };
  service.onDeposit=receipt=>{
    if(receipt.name!=='iron_ingot')return;
    mission.delivered+=receipt.count;mission.receipts=[...(mission.receipts??[]),receipt].slice(-64);save({status:'depositing'});
  };
  async function smeltAndStore(){
    scope();save({status:'smelting'});preparationPhase(service,'smelting-iron');
    for(let batch=0;batch<8;batch++){
      const pending=service.store.get('furnaceJobs').some(j=>j.category==='iron-trip'&&j.realmId===realmId&&j.dimension===dimension&&['cooking','needs-check'].includes(j.status));
      if(!pending&&freeBasic(service,'raw_iron')<1)break;
      await cookFood(service,{count:8},signal,{recipes:{raw_iron:'iron_ingot'},category:'iron-trip'});scope();save({status:'smelting'});
    }
    if(freeBasic(service,'iron_ingot')>0){save({status:'depositing'});await storeSurplus(service,signal);scope();}
  }
  save({status:mission.status==='depositing'?'depositing':'preparing'});
  try{
    const unfinished=service.store.get('expeditions').find(t=>t.id==='resource-search'&&!['returned','complete'].includes(t.status));
    if(unfinished)await findResource(service,{item:'iron_ingot',radius},signal);
    if(owned()>0||service.store.get('furnaceJobs').some(j=>j.category==='iron-trip'&&['cooking','needs-check'].includes(j.status)&&j.realmId===realmId&&j.dimension===dimension))await smeltAndStore();
    if(mission.delivered<count){
      await prepareMining(service,signal);scope();save({status:'searching'});preparationPhase(service,'searching-iron');
      const result=await findResource(service,{item:'iron_ingot',radius},signal,{
        acceptSource:block=>safeIronSource(service,block)&&Boolean(ironStance(service,block)),
        onSource:async(block,route)=>{
          scope();save({status:'mining'});preparationPhase(service,'mining-iron');
          await harvestVein(service,block,Math.max(0,count-mission.delivered-owned()),signal,{...route,radius});scope();save({status:'searching'});
          return mission.delivered+owned()>=count;
        },
      });
      save({status:'returning',searchSummary:result.summary});await smeltAndStore();
    }
    const success=mission.delivered>=count;save({status:success?'complete':'blocked'});preparationPhase(service,success?'complete':'blocked');
    return {success,delivered:mission.delivered,requested:count,summary:success?`Stored ${mission.delivered} confirmed iron ingots at Home/spawn. I prepared my kit, mined reachable exposed ore and smelted it myself.`:`Stored ${mission.delivered} iron ingots; the kit is kept for the next trip. ${mission.searchSummary??'No safe reachable exposed ore was found.'}`};
  }catch(error){
    const cancelled=signal.aborted&&(/Task cancelled/i.test(error.message)||(base.runtime.state==='DISCONNECTED'&&/Companion paused or stopped/i.test(error.message)));
    save({status:cancelled?'cancelled':signal.aborted?'paused':'blocked',reason:error.message});throw error;
  }
}
