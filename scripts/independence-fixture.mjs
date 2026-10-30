import {huntableAnimals} from '../services/skill-executor/survival.js';
import assert from 'node:assert/strict';
import {Vec3} from 'vec3';

export async function independenceChecks({check:runCheck,command,until,runtime,store,teammate}){
  const check=(name,work)=>process.argv.includes('--food-only')&&!name.includes('food search')?Promise.resolve():runCheck(name,work);
  const bot=runtime.bot,count=name=>bot.inventory.items().filter(item=>item.name===name).reduce((n,item)=>n+item.count,0);
  command('time set day');command('gamerule minecraft:advance_time false');command('gamerule minecraft:spawn_mobs false');command('tp NativeFixture 0 -59 0');command('clear NativeFixture');
  await until(()=>bot.entity.position.distanceTo(new Vec3(.5,-59,.5))<1&&!bot.inventory.items().length,'independence reset');
  await check('automatic storage crafts table and chest then deposits real diamonds at spawn',async()=>{
    command('give NativeFixture minecraft:oak_log 1');command('give NativeFixture minecraft:diamond 3');
    for(let y=-59;y<=-57;y++)command(`setblock 8 ${y} -4 minecraft:oak_log`);command('setblock 8 -56 -4 minecraft:oak_leaves[persistent=true]');
    await until(()=>count('oak_log')===1&&count('diamond')===3&&bot.blockAt(new Vec3(8,-56,-4))?.name==='oak_leaves','storage ingredients');
    const result=await runtime.execute('store_surplus',{});assert.equal(result.success,true,JSON.stringify(result));
    assert.equal(count('diamond'),0);const chest=store.get('supplyChests').find(value=>value.automatic);
    assert.ok(chest);assert.equal(bot.blockAt(new Vec3(chest.position.x,chest.position.y,chest.position.z)).name,'chest');
    assert.ok(chest.inventory.some(item=>item.name==='diamond'&&item.count===3));
    return {craftedAndPlaced:true,confirmedDiamondDeposit:3};
  });
  await check('full storage triggers a separately placed additional chest without altering the original',async()=>{
    const first=store.get('supplyChests')[0],p=first.position;
    for(let slot=0;slot<27;slot++)command(`item replace block ${p.x} ${p.y} ${p.z} container.${slot} with minecraft:cobblestone 64`);
    command('give NativeFixture minecraft:oak_log 4');command('give NativeFixture minecraft:diamond 2');await until(()=>count('diamond')===2,'overflow valuables');
    const result=await runtime.execute('store_surplus',{});assert.equal(result.success,true,JSON.stringify(result));
    assert.equal(count('diamond'),0);assert.equal(store.get('supplyChests').filter(value=>value.automatic).length,2);
    const second=store.get('supplyChests').find(value=>value.id!==first.id);
    assert.ok(second.inventory.some(item=>item.name==='diamond'&&item.count===2));return {automaticChests:2,confirmedOverflowDeposit:2};
  });
  command('fill 12 -59 6 15 -59 8 minecraft:stone');
  await check('food search crosses ordinary slopes crafts its own axe and finds a wild animal',async()=>{
    command('clear NativeFixture');command('give NativeFixture minecraft:oak_log 8');command('tp NativeFixture 40 -59 0');
    // A low hill in front of the bot exercises elevation-changing path nodes.
    command('fill 42 -59 -5 45 -59 5 minecraft:dirt');command('fill 44 -58 -4 45 -58 4 minecraft:dirt');
    command('summon cow 70 -59 0 {NoAI:1b,PersistenceRequired:1b}');
    await until(()=>count('oak_log')===8&&bot.entity.position.distanceTo(new Vec3(40.5,-59,.5))<1&&Object.values(bot.entities).some(entity=>entity.name==='cow'),'food search setup');
    const trace=[];let last=0;
    const observe=()=>{if(Date.now()-last<500)return;last=Date.now();trace.push({position:bot.entity.position.toString(),eligible:huntableAnimals(teammate).map(e=>e.id),cows:Object.values(bot.entities).filter(e=>e.name==='cow').map(e=>({id:e.id,p:e.position.toString(),meta:e.metadata,keys:bot.registry.entitiesByName.cow.metadataKeys}))});};
    bot.on('physicsTick',observe);
    const start=bot.entity.position.clone();let result;try{result=await runtime.execute('find_food',{});}finally{bot.removeListener('physicsTick',observe);}
    if(!result.success)console.error('FOOD_TRACE '+JSON.stringify(trace.slice(0,25)));

    assert.equal(result.success,true,JSON.stringify(result));assert.ok(count('cooked_beef')>0,JSON.stringify(result));
    assert.ok(count('wooden_axe')>0);assert.ok(bot.entity.position.distanceTo(new Vec3(0,-59,0))<20,'Finishes cooking at the spawn station');
    return {cookedFood:count('cooked_beef'),preparedOwnAxe:true,returned:true};
  });
}
