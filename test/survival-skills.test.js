import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import minecraftData from 'minecraft-data';
import {Vec3} from 'vec3';
import {depositPlan,keptSupplies,requireSafeWork,huntableAnimals,matureCrops,explorationSteps} from '../services/skill-executor/survival.js';
import {chooseIdleWork,IdleWorkService} from '../services/skill-executor/idle-work.js';
import {quickPlan} from '../services/agent-orchestrator/quick-actions.js';
import {conversationArguments,CODEX_RESTRICTIONS} from '../services/agent-orchestrator/codex-cli.js';

function fixture(){
  const records=new Map(),settings={realmId:1,autonomy:'helpful',miningZone:null};let inventory=[{name:'bread',count:12},{name:'iron_pickaxe',count:1},{name:'iron_sword',count:1}];
  const store={settings:()=>settings,get:name=>records.get(name)||[],put(name,record){records.set(name,[...(records.get(name)||[]).filter(value=>value.id!==record.id),record]);}};
  store.put('spawnPoints',{id:'1:overworld',realmId:1,dimension:'overworld',position:{x:0,y:64,z:0},provenance:'server-reported'});
  const bot={minenessReady:true,registry:minecraftData('1.21.5'),version:'1.21.5',health:20,food:20,game:{dimension:'overworld'},time:{timeOfDay:6000},entity:{position:new Vec3(0,64,0)},entities:{},inventory:{items:()=>inventory,emptySlotCount:()=>30},findBlock:()=>null,findBlocks:()=>[],blockAt:()=>null};
  const runtime=Object.assign(new EventEmitter(),{state:'ACTIVE',bot,isActive(){return this.state==='ACTIVE';},actions:{state:()=>({})},execute:async()=>({success:true}),taskStack:{frames:[]}});
  const preferences={busyMode:true,autoDeposit:true};const service={runtime,store,preferences:()=>preferences,threats:()=>[],reserved:name=>name==='stone'?8:0,notice(){},publish(){}};
  return {service,runtime,bot,store,settings,preferences,setInventory:items=>inventory=items};
}
const approved={id:'supply',name:'Supplies',realmId:1,dimension:'overworld',position:{x:4,y:64,z:0},approved:true,depositAllowed:true,allowedItems:['bread']};

test('loot plan keeps practical kit and reservations, deposits valuables, and never selects named gear by generic type',()=>{
  const f=fixture();f.setInventory([{name:'bread',count:20},{name:'iron_pickaxe',count:2},{name:'diamond',count:7},{name:'stone',count:20},{name:'torch',count:45},{name:'wheat_seeds',count:20},{name:'iron_sword',count:1,customName:'Keep me'}]);
  const plan=Object.fromEntries(depositPlan(f.service).map(item=>[item.name,item.count]));
  assert.equal(plan.diamond,7);assert.equal(plan.bread,8);assert.equal(plan.iron_pickaxe,1);assert.equal(plan.torch,13);assert.equal(plan.wheat_seeds,4);assert.equal(plan.iron_sword,undefined);assert.equal(keptSupplies(f.service).stone,8);
});
test('background jobs prioritize storage and cannot ignore unapproved, cross-Realm or missing storage',()=>{
  const f=fixture();f.setInventory([{name:'bread',count:12},{name:'diamond',count:2}]);
  assert.match(chooseIdleWork(f.service).reason,/storage/);
  f.store.put('supplyChests',approved);assert.equal(chooseIdleWork(f.service).tool,'store_surplus');
  f.store.put('supplyChests',{...approved,realmId:2});assert.equal(chooseIdleWork(f.service).tool,undefined);
  f.store.put('supplyChests',approved);assert.equal(chooseIdleWork(f.service,new Set(['store_surplus'])).tool,undefined);
});
test('unsafe conditions and explicit instructions-only mode prevent background work',()=>{
  const f=fixture();f.store.put('supplyChests',approved);f.setInventory([{name:'diamond',count:1}]);
  for(const [field,value] of [['health',5],['food',2],['companionInventoryUnverified',true]]){const previous=f.bot[field];f.bot[field]=value;assert.equal(chooseIdleWork(f.service).tool,undefined);assert.throws(()=>requireSafeWork(f.service,new AbortController().signal));f.bot[field]=previous;}
  f.settings.autonomy='instructions';assert.equal(chooseIdleWork(f.service).tool,undefined);
});
test('animal eligibility protects babies, named animals, farm areas, fences and unknown health metadata',()=>{
  const f=fixture(),keys=f.bot.registry.entitiesByName.cow.metadataKeys;
  const animal={id:1,name:'cow',position:new Vec3(10,64,0),isValid:true,metadata:{[keys.indexOf('health')]:10,[keys.indexOf('baby')]:false}};
  f.bot.entities={cow:animal};assert.equal(huntableAnimals(f.service).length,1);
  animal.metadata[keys.indexOf('baby')]=true;assert.equal(huntableAnimals(f.service).length,0);animal.metadata[keys.indexOf('baby')]=false;
  animal.metadata[keys.indexOf('custom_name')]='Buddy';assert.equal(huntableAnimals(f.service).length,0);delete animal.metadata[keys.indexOf('custom_name')];
  f.bot.findBlocks=()=>[new Vec3(11,64,0)];assert.equal(huntableAnimals(f.service).length,0);f.bot.findBlocks=()=>[];
  f.store.put('workAreas',{id:'farm',realmId:1,dimension:'overworld',position:{x:10,y:64,z:0},radius:5});assert.equal(huntableAnimals(f.service).length,0);
});
test('farm scan requires an approved area and exploration rejects liquids, cliffs and unseen blocks',()=>{
  const f=fixture();let scans=0;f.bot.findBlocks=()=>{scans++;return [];};assert.deepEqual(matureCrops(f.service),[]);assert.equal(scans,0);
  assert.deepEqual(explorationSteps(f.bot,new Vec3(0,64,0),24),[]);
  f.bot.blockAt=position=>position.y===63?{boundingBox:'block',name:'grass_block'}:{boundingBox:'empty',name:'air'};
  assert.ok(explorationSteps(f.bot,new Vec3(0,64,0),24).length>0);
  f.bot.blockAt=position=>position.y===63?{boundingBox:'empty',name:'lava'}:{boundingBox:'empty',name:'air'};assert.deepEqual(explorationSteps(f.bot,new Vec3(0,64,0),24),[]);
});
test('idle scheduler owns one body job, respects Stop and does not invoke a model',async()=>{
  const f=fixture();f.setInventory([{name:'bread',count:12},{name:'diamond',count:2}]);f.store.put('supplyChests',approved);
  let calls=0,finish;f.runtime.execute=()=>{calls++;return new Promise(resolve=>finish=resolve);};
  const manager=new IdleWorkService({runtime:f.runtime,teammate:f.service,publish(){},timers:{setInterval:()=>({unref(){}}),clearInterval(){}}});
  const job=manager.tick();await manager.tick();assert.equal(calls,1);finish({success:true});await job;
  f.runtime.emit('task-cancel');await manager.tick();assert.equal(calls,1);f.runtime.emit('resume');f.runtime.state='PAUSED';await manager.tick();assert.equal(calls,1);manager.close();
});
test('new everyday skills route without inference and faster Codex conversation excludes unrelated skill blocks',()=>{
  for(const [phrase,tool] of [['hunt for food','hunt_food'],['farm','tend_farm'],['cook food','cook_food'],['explore','explore_nearby'],['store your valuables','store_surplus'],['resume the build','resume_approved_build'],['get food','find_food']])assert.equal(quickPlan(phrase,{world:{inventory:[]}}).actions[0].tool,tool);
  assert.equal(quickPlan('How do farms work in real life?',{world:{inventory:[]}}),null);
  assert.ok(conversationArguments().includes('skills.include_instructions=false'));assert.ok(conversationArguments().includes('model_reasoning_effort="low"'));assert.ok(!conversationArguments(false).includes('model_reasoning_effort="low"'));assert.ok(CODEX_RESTRICTIONS.includes('read-only'));
});
