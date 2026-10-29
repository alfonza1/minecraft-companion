import assert from 'node:assert/strict';
import {Vec3} from 'vec3';
import {randomUUID} from 'node:crypto';
import {huntableAnimals} from '../services/skill-executor/survival.js';
import {validateBlueprint,blueprintHash} from '../services/build-planner/blueprint.js';
import {IdleWorkService} from '../services/skill-executor/idle-work.js';

// Called exclusively by the disposable localhost native-server fixture.
export async function survivalFixtureChecks({check,command,until,runtime,store,teammate,orchestrator}){
  const bot=runtime.bot,owned=name=>bot.inventory.items().filter(item=>item.name===name).reduce((sum,item)=>sum+item.count,0);
  if(!store.get('supplyChests').length){command('setblock 22 -59 3 minecraft:chest');command('give NativeFixture minecraft:stone_pickaxe 1');command('give NativeFixture minecraft:bread 12');await until(()=>owned('stone_pickaxe')>0&&owned('bread')>=12,'survival fixture kit');store.put('supplyChests',{id:randomUUID(),name:'Fixture storage',position:{x:22,y:-59,z:3},realmId:1,dimension:bot.game.dimension,approved:true,allowedItems:['bread'],depositAllowed:true});}
  command('gamerule doDaylightCycle false');command('gamerule doMobSpawning false');command('time set day');
  command('tp NativeFixture 42 -59 0');await until(()=>bot.entity.position.distanceTo(new Vec3(42.5,-59,.5))<1,'survival skill fixture position');
  await check('native mature crop harvest and verified replanting preserve immature crops',async()=>{
    command('setblock 45 -60 0 minecraft:farmland[moisture=7]');command('setblock 46 -60 0 minecraft:water');command('setblock 45 -59 0 minecraft:wheat[age=7]');
    command('setblock 45 -60 1 minecraft:farmland[moisture=7]');command('setblock 45 -59 1 minecraft:wheat[age=3]');command('give NativeFixture minecraft:wheat_seeds 8');
    await until(()=>bot.blockAt(new Vec3(45,-59,0))?.name==='wheat'&&owned('wheat_seeds')>=8,'ripe wheat and replanting seeds');
    store.put('workAreas',{id:'farm',realmId:1,dimension:bot.game.dimension,position:{x:44,y:-59,z:0},radius:5});
    const result=await runtime.execute('tend_farm',{count:1});assert.equal(result.success,true,JSON.stringify(result));assert.equal(result.replanted,1);
    assert.equal(bot.blockAt(new Vec3(45,-59,0)).name,'wheat');assert.equal(Number(bot.blockAt(new Vec3(45,-59,0)).getProperties().age),0);
    assert.equal(Number(bot.blockAt(new Vec3(45,-59,1)).getProperties().age),3);assert.ok(owned('wheat')>=1);
    command('setblock 45 -59 0 minecraft:wheat[age=7]');await until(()=>Number(bot.blockAt(new Vec3(45,-59,0)).getProperties().age)===7,'second ripe crop');
    let paused;const interrupt=(oldBlock,newBlock)=>{if(oldBlock?.position.equals(new Vec3(45,-59,0))&&oldBlock.name==='wheat'&&newBlock.name==='air'){bot.removeListener('blockUpdate',interrupt);paused=runtime.control('pause');}};
    bot.on('blockUpdate',interrupt);try{await assert.rejects(runtime.execute('tend_farm',{count:1}));await paused;await runtime.waitForIdle();assert.ok(store.get('cropRepairs').some(record=>record.status==='pending'));await runtime.control('resume');const repaired=await runtime.execute('tend_farm',{count:1});assert.equal(repaired.replanted,1,JSON.stringify(repaired));assert.equal(bot.blockAt(new Vec3(45,-59,0)).name,'wheat');}finally{bot.removeListener('blockUpdate',interrupt);}
    return {...result,interruptedReplantRecovered:true};
  });
  await check('native hunting excludes babies and named animals and collects real meat',async()=>{
    command('tp NativeFixture 63 -59 3');command('give NativeFixture minecraft:iron_sword 1');
    command('summon cow 65 -59 3 {NoAI:1b,PersistenceRequired:1b}');command('summon cow 68 -59 3 {NoAI:1b,Age:-24000,PersistenceRequired:1b}');
    command('summon cow 63 -59 7 {NoAI:1b,CustomName:{text:"Buddy"},PersistenceRequired:1b}');
    await until(()=>Object.values(bot.entities).filter(entity=>entity.name==='cow').length>=3&&owned('iron_sword')>0,'hunting fixture animals');
    await until(()=>huntableAnimals(teammate).some(entity=>entity.position.distanceTo(new Vec3(65,-59,3))<1),'observed adult metadata');
    const candidates=huntableAnimals(teammate);assert.equal(candidates.length,1,JSON.stringify(candidates.map(entity=>({id:entity.id,pos:entity.position,metadata:entity.metadata}))));
    const result=await runtime.execute('hunt_food',{count:1});assert.equal(result.killed,1,JSON.stringify(result));assert.ok(owned('beef')>0,JSON.stringify(result));return result;
  });
  await check('native survival cooking uses owned fuel in an empty furnace and verifies output',async()=>{
    command('setblock 66 -59 7 minecraft:furnace');command('give NativeFixture minecraft:coal 2');await until(()=>bot.blockAt(new Vec3(66,-59,7))?.name==='furnace'&&owned('coal')>=2,'empty furnace and owned fuel');
    const result=await runtime.execute('cook_food',{count:1});assert.equal(result.cooked,1,JSON.stringify(result));assert.ok(owned('cooked_beef')>=1);return result;
  });
  await check('native loot storage deposits diamonds and surplus but retains useful kit',async()=>{
    command('give NativeFixture minecraft:diamond 3');command('give NativeFixture minecraft:oak_planks 40');await until(()=>owned('diamond')===3&&owned('oak_planks')>=40,'storage fixture loot');
    const chest=store.get('supplyChests')[0];store.put('supplyChests',{...chest,depositAllowed:true});
    const result=await runtime.execute('store_surplus',{});assert.equal(result.success,true,JSON.stringify(result));assert.equal(owned('diamond'),0);assert.ok(bot.inventory.items().some(item=>item.name.endsWith('_pickaxe')));
    const stock=store.get('supplyChests')[0];assert.equal(stock.provenance,'observed-container');assert.equal(stock.inventory.find(item=>item.name==='diamond')?.count,3);return {deposited:result.deposited,observedChest:stock.inventory};
  });
  await check('native bounded surface exploration returns to its anchor without excavation',async()=>{
    const anchor=bot.entity.position.clone();const result=await runtime.execute('explore_nearby',{radius:24,steps:2});assert.equal(result.success,true,JSON.stringify(result));assert.ok(bot.entity.position.distanceTo(anchor)<2);assert.ok(store.get('exploration').length>=1);return result;
  });
  await check('native chat resumes approved construction at a saved site with zero inference',async()=>{
    command('give NativeFixture minecraft:stone 4');await until(()=>owned('stone')>=4,'approved chat build materials');
    const blueprint=validateBlueprint({version:'26.3',dimensions:{x:2,y:1,z:1},provenance:'reconstructed',uncertainties:[],blocks:[{x:0,y:0,z:0,name:'stone'},{x:1,y:0,z:0,name:'stone'}]}),origin={x:28,y:-59,z:10},id=randomUUID();
    store.put('projects',{id,name:'Approved chat fixture',version:'26.3',revision:1,approvedRevision:1,approvedHash:blueprintHash(blueprint),blueprint,assignments:[],reservations:{},materials:{placed:[],raw:[],accuracy:'exact-blueprint'},status:'paused',checkpoint:{origin,dimension:bot.game.dimension,realmId:1,revision:1,verified:[]}});
    await orchestrator.respond('resume the build');await until(()=>store.get('projects').find(project=>project.id===id)?.status==='complete','chat-driven approved construction');
    assert.equal(bot.blockAt(new Vec3(28,-59,10)).name,'stone');assert.equal(bot.blockAt(new Vec3(29,-59,10)).name,'stone');assert.equal(orchestrator.usage.requests,0);return {verified:2,modelRequests:0};
  });
  await check('native idle work stores valuable loot automatically and obeys Stop without inference',async()=>{
    command('give NativeFixture minecraft:iron_ingot 2');await until(()=>owned('iron_ingot')===2,'automatic work fixture loot');
    store.updateSettings({autonomy:'helpful',teammate:{busyMode:true,autoDeposit:true}});
    const manager=new IdleWorkService({runtime,teammate,publish(){},timers:{setInterval:()=>({unref(){}}),clearInterval(){}}});
    try{await manager.tick();assert.equal(owned('iron_ingot'),0);runtime.emit('task-cancel');command('give NativeFixture minecraft:iron_ingot 1');await until(()=>owned('iron_ingot')===1,'Stop fixture inventory');await manager.tick();assert.equal(owned('iron_ingot'),1);assert.equal(orchestrator.usage.requests,0);return {stored:2,heldAfterStop:true,modelRequests:0};}
    finally{manager.close();store.updateSettings({autonomy:'instructions',teammate:{busyMode:false,autoDeposit:true}});}
  });
  command('give NativeFixture minecraft:oak_planks 4');await until(()=>owned('oak_planks')>=4,'restore disconnect fixture stock');
}
