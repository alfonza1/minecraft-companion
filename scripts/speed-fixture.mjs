import assert from 'node:assert/strict';
import { Vec3 } from 'vec3';
import { createBuildSupplies } from '../services/build-executor/supplies.js';
import { validateBlueprint } from '../services/build-planner/blueprint.js';
import { companionPerformance } from '../services/companion-runtime/performance.js';

export async function speedChecks({check,command,until,runtime,store,teammate}) {
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
  await check('native explicit bamboo scouting observes source and returns without harvesting',async()=>{
    command('setblock 3 -59 0 minecraft:bamboo');
    await until(()=>bot.blockAt(new Vec3(3,-59,0))?.name==='bamboo','visible bamboo');
    const anchor=bot.entity.position.clone();
    const result=await runtime.runJob('scout-fixture',signal=>teammate.execute('find_resource',{item:'bamboo',radius:16,steps:1},signal));
    assert.equal(result.success,true);assert.equal(bot.blockAt(new Vec3(3,-59,0)).name,'bamboo');assert.ok(bot.entity.position.distanceTo(anchor)<2);
    assert.equal(store.get('resourceLocations')[0].provenance,'observed');
    return {source:result.source,returned:true,harvested:false};
  });
}
