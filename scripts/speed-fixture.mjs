import assert from 'node:assert/strict';
import { Vec3 } from 'vec3';
import { createBuildSupplies } from '../services/build-executor/supplies.js';
import { validateBlueprint } from '../services/build-planner/blueprint.js';
import { companionPerformance } from '../services/companion-runtime/performance.js';

export async function speedChecks({check,command,until,runtime,store,teammate,logs}) {
  const bot=runtime.bot,origin={x:4,y:-59,z:4};
  command('tp NativeFixture 0 -59 0');command('clear NativeFixture');command('time set day');command('gamerule minecraft:advance_time false');
  await until(()=>bot.entity.position.distanceTo(new Vec3(.5,-59,.5))<.2&&!bot.inventory.items().length,'speed fixture reset');
  await check('native construction phase crafts 32 planks in one eight-recipe batch',async()=>{
    command('give NativeFixture minecraft:oak_log 8');
    await until(()=>bot.inventory.items().some(item=>item.name==='oak_log'&&item.count===8),'batch ingredients');
    const blueprint=validateBlueprint({version:'26.3',dimensions:{x:8,y:1,z:4},provenance:'reconstructed',blocks:Array.from({length:32},(_,i)=>({x:i%8,y:0,z:Math.floor(i/8),name:'oak_planks'}))});
    const project={id:'speed',revision:1,blueprint,reservations:{}};store.put('projects',project);
    const calls=[],craft=bot.craft;bot.craft=async(...args)=>{calls.push(args[1]);return craft.apply(bot,args);};
    try {await runtime.runJob('phase-supply-fixture',signal=>createBuildSupplies({project,origin,bot,store,teammate,save:value=>store.put('projects',value)}).preparePhase(blueprint.blocks,signal));}
    finally {bot.craft=craft;}
    assert.deepEqual(calls,[8]);assert.equal(bot.inventory.items().filter(item=>item.name==='oak_planks').reduce((n,item)=>n+item.count,0),32);
    return {calls,confirmedPlanks:32,timings:companionPerformance.snapshot()};
  });
  await check('native spawn fallback deposits diamonds locates distant bamboo and returns to spawn',async()=>{
    command('setblock 3 -59 0 minecraft:air');
    command('setblock 2 -59 -2 minecraft:chest');
    command('forceload add 60 60');
    let lastAttempt=0;
    await until(()=>{
      if(logs.some(line=>line.includes('EXPEDITION_SOURCE_READY')))return true;
      if(Date.now()-lastAttempt>250){lastAttempt=Date.now();command('setblock 60 -59 60 minecraft:bamboo');command('execute if block 60 -59 60 minecraft:bamboo run say EXPEDITION_SOURCE_READY');}
      return false;
    },'server-confirmed distant bamboo fixture');
    command('give NativeFixture minecraft:diamond 3');
    command('give NativeFixture minecraft:bread 16');
    await until(()=>bot.inventory.items().some(item=>item.name==='diamond'&&item.count===3)&&bot.inventory.items().some(item=>item.name==='bread'&&item.count>=16)&&bot.blockAt(new Vec3(2,-59,-2))?.name==='chest','scouting kit and storage');
    store.put('supplyChests',{id:'search-vault',approved:true,depositAllowed:true,allowedItems:[],realmId:1,dimension:bot.game.dimension,position:{x:2,y:-59,z:-2}});
    assert.ok(store.get('spawnPoints').some(value=>value.realmId===1&&value.dimension===bot.game.dimension&&value.provenance==='server-reported'),'Actual server spawn packet must be recorded');
    const result=await runtime.execute('find_resource',{item:'bamboo',radius:128,steps:24});
    assert.equal(result.success,true,JSON.stringify(result));assert.equal(result.returnedHome,false);assert.equal(store.get('expeditions')[0].returnTarget,'spawn');
    assert.equal(bot.inventory.items().filter(item=>item.name==='diamond').length,0);
    assert.ok(store.get('supplyChests')[0].inventory.some(item=>item.name==='diamond'&&item.count===3));
    assert.ok(bot.entity.position.distanceTo(new Vec3(.5,-59,.5))<2);
    assert.equal(store.get('resourceLocations')[0].position.x,60);
    assert.equal(store.get('expeditions')[0].status,'returned');assert.equal(store.get('expeditions')[0].route.length,0);
    assert.equal(bot.blockAt(new Vec3(60,-59,60))?.name==='bamboo'||store.get('resourceLocations')[0].block==='bamboo',true);
    return {source:result.source,distanceFromHome:Math.hypot(60,60),returnedToSpawn:true,confirmedStoredDiamonds:3,harvested:false};
  });
}
