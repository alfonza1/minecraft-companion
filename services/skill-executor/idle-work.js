import {inventoryCounts} from '../../src/actions.js';
import {foodCount,depositPlan,approvedStores,matureCrops,huntableAnimals,COOKED,valuableCargo,cookingFuel,pendingFarmRepairs} from './survival.js';
import {requireNaturalTree} from './index.js';

export const IDLE_WORK_INTERVAL_MS=2000;
export const IDLE_RETRY_COOLDOWN_MS=120000;
export const STOCK_TARGETS={logs:64,cobblestone:96,food:16};

export function chooseIdleWork(service,blocked=new Set()){
  const bot=service.runtime.bot,prefs=service.preferences(),settings=service.store.settings();
  if(!prefs.busyMode||settings.autonomy==='instructions'||!bot?.minenessReady||!service.runtime.isActive())return {reason:'Automatic work is off.'};
  if(bot.companionTransport?.projected||bot.companionInventoryUnverified||bot.entity.isInWater||bot.entity.isInLava||bot.health<14||bot.food<6||service.threats(bot.entity.position,12).length)return {reason:'Waiting for safe health, food, terrain and clear surroundings.'};
  const candidates=[],counts=inventoryCounts(bot),stores=approvedStores(service),surplus=depositPlan(service),valuable=valuableCargo(bot);
  if(prefs.autoDeposit&&surplus.length&&stores.length)candidates.push({tool:'store_surplus',args:{},reason:'Putting surplus and valuables away.'});
  if(valuable||bot.inventory.emptySlotCount()<4)return candidates.find(value=>!blocked.has(value.tool))||{reason:'Loot needs safe storage. Use approved deposit storage at Home/Base, or server spawn when no home is set.'};
  if(pendingFarmRepairs(service).length)candidates.push({tool:'tend_farm',args:{count:1},reason:'Replanting a crop interrupted by the previous task.'});
  if(bot.food<14||foodCount(bot)<8){
    const raw=bot.inventory.items().some(item=>COOKED[item.name]),log=bot.inventory.items().find(item=>item.name.endsWith('_log')&&item.count>service.reserved(item.name));
    if(raw&&cookingFuel(bot)&&bot.findBlock({matching:bot.registry.blocksByName.furnace.id,maxDistance:16}))candidates.push({tool:'cook_food',args:{count:2},reason:'Cooking owned food.'});
    if(raw&&!cookingFuel(bot)&&log)candidates.push({tool:'craft_item',args:{item:log.name.replace(/_log$/,'_planks'),count:4},reason:'Preparing owned wood as cooking fuel.'});
    if(raw&&!cookingFuel(bot)&&!log){try{requireNaturalTree(bot);candidates.push({tool:'chop_tree',args:{count:2},reason:'Collecting a little wood for cooking fuel.'});}catch{}}
    if(stores.some(chest=>chest.allowedItems.some(name=>bot.registry.foodsByName?.[name])))candidates.push({tool:'restock_food',args:{},reason:'Checking approved food supplies.'});
    if((counts.wheat||0)>=3&&bot.findBlock({matching:bot.registry.blocksByName.crafting_table.id,maxDistance:16}))candidates.push({tool:'craft_item',args:{item:'bread',count:1},reason:'Turning owned wheat into food.'});
    if(matureCrops(service).length)candidates.push({tool:'tend_farm',args:{count:3},reason:'Harvesting and replanting the approved farm.'});
    if(bot.inventory.items().some(item=>/_sword$|_axe$/.test(item.name))&&huntableAnimals(service).length)candidates.push({tool:'hunt_food',args:{count:1},reason:'Hunting a nearby wild adult animal.'});
    return candidates.find(value=>!blocked.has(value.tool))||{reason:'Food is short. Need an approved stocked chest, ripe farm, or safe wild animals and a weapon.'};
  }
  const time=bot.time?.timeOfDay;
  if(time!==undefined&&time>13000&&time<23000)return candidates.find(value=>!blocked.has(value.tool))||{reason:'Nighttime: staying near supplies instead of roaming.'};
  if(!stores.length)return {reason:'Approve a loot-deposit chest at Home/Base, or server spawn when no home is set, before background gathering.'};
  const stock={...counts};for(const chest of stores){if(!chest.observedAt||Date.now()-Date.parse(chest.observedAt)>300000)continue;for(const item of chest.inventory||[])stock[item.name]=(stock[item.name]||0)+item.count;}
  const logs=Object.entries(stock).filter(([name])=>name.endsWith('_log')).reduce((sum,[,n])=>sum+n,0);
  if(logs<STOCK_TARGETS.logs){try{requireNaturalTree(bot);candidates.push({tool:'chop_tree',args:{count:Math.min(8,STOCK_TARGETS.logs-logs)},reason:'Topping up the shared wood supply.'});}catch{}}
  const mine=service.store.get('workAreas').find(area=>area.id==='mining'&&area.realmId===settings.realmId&&area.dimension===bot.game.dimension);
  if(mine&&settings.miningZone&&(stock.cobblestone||0)<STOCK_TARGETS.cobblestone&&bot.inventory.items().some(item=>/_pickaxe$/.test(item.name)))candidates.push({tool:'gather_blocks',args:{block:'stone',count:8},reason:'Mining common stone inside the approved area.'});
  if(matureCrops(service).length)candidates.push({tool:'tend_farm',args:{count:3},reason:'Keeping the approved farm productive.'});
  candidates.push({tool:'explore_nearby',args:{radius:settings.autonomy==='independent'?40:24,steps:2},reason:'Scouting nearby loaded surface terrain, then returning.'});
  return candidates.find(value=>!blocked.has(value.tool))||{reason:'Stock targets are met, or safe approved work is currently unavailable.'};
}

export class IdleWorkService{
  constructor({runtime,teammate,publish,timers=globalThis}){
    Object.assign(this,{runtime,teammate,publish,timers});this.failures=new Map();this.held=false;this.running=false;this.reason='Waiting for an active session.';runtime.idleWork=this;
    this.hold=()=>{this.held=true;};this.resume=()=>{this.held=false;this.failures.clear();};
    runtime.on('task-cancel',this.hold);runtime.on('resume',this.resume);runtime.on('connected',this.resume);
    this.timer=timers.setInterval(()=>{void this.tick();},IDLE_WORK_INTERVAL_MS);this.timer.unref?.();
  }
  snapshot(){return {held:this.held,reason:this.reason,running:this.running};}
  async tick(){
    if(this.running||this.held||!this.runtime.isActive()||this.runtime.state!=='ACTIVE'||this.runtime.currentTask||this.runtime.pending||this.runtime.actions?.state().following||this.runtime.actions?.state().action||this.runtime.taskStack?.frames.length||this.runtime.taskStack?.switching||this.runtime.hasOperations?.())return;
    const blocked=new Set([...this.failures].filter(([,at])=>Date.now()-at<IDLE_RETRY_COOLDOWN_MS).map(([tool])=>tool));
    let decision;try{decision=chooseIdleWork(this.teammate,blocked);}catch(error){this.reason='Could not inspect safe work; waiting.';return;}
    if(this.reason!==decision.reason){this.reason=decision.reason;this.publish();}
    if(!decision.tool)return;
    this.running=true;
    try{const work=this.runtime.execute(decision.tool,decision.args);this.taskId=this.runtime.currentTask?.id;const result=await work;if(result?.success===false)this.failures.set(decision.tool,Date.now());else if(['explore_nearby','tend_farm','restock_food'].includes(decision.tool))this.failures.set(decision.tool,Date.now());}
    catch(error){this.failures.set(decision.tool,Date.now());if(this.runtime.isActive())this.teammate.notice(error.message,'blocked',`idle:${decision.tool}`);}
    finally{this.running=false;this.publish();}
  }
  async stop(){this.held=true;if(this.running&&this.taskId&&this.runtime.currentTask?.id===this.taskId)await this.runtime.suspendWork('Automatic work disabled.');}
  close(){this.timers.clearInterval(this.timer);this.runtime.off('task-cancel',this.hold);this.runtime.off('resume',this.resume);this.runtime.off('connected',this.resume);if(this.runtime.idleWork===this)this.runtime.idleWork=null;}
}
