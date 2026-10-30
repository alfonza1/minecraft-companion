import assert from 'node:assert/strict';
import {Vec3} from 'vec3';

export async function cookingChecks({check,command,until,runtime,store}){
  const bot=runtime.bot,count=name=>bot.inventory.items().filter(item=>item.name===name).reduce((n,item)=>n+item.count,0);
  command('time set day');command('gamerule minecraft:advance_time false');command('gamerule minecraft:spawn_mobs false');command('tp NativeFixture 0 -59 0');command('clear NativeFixture');
  command('fill 12 -59 0 15 -59 2 minecraft:stone');command('give NativeFixture minecraft:oak_log 8');command('give NativeFixture minecraft:beef 2');
  await until(()=>count('beef')===2&&count('oak_log')===8&&bot.blockAt(new Vec3(12,-59,0))?.name==='stone','cooking setup');
  await check('autonomous cooking crafts pick mines furnace stone makes furnace and fuel then cooks',async()=>{
    const trace=setInterval(()=>console.log('COOK_PROGRESS '+JSON.stringify({position:bot.entity.position.toString(),cobble:count('cobblestone'),furnace:count('furnace'),jobs:store.get('furnaceJobs').map(j=>({status:j.status,phase:j.phase}))})),5000);
    let result;try{result=await runtime.execute('cook_food',{count:2});}finally{clearInterval(trace);}assert.equal(result.success,true,JSON.stringify(result));
    assert.equal(count('cooked_beef'),2);assert.equal(count('beef'),0);assert.ok(count('wooden_pickaxe')===1);
    const station=store.get('utilityBlocks').find(value=>value.name==='furnace'&&value.status==='placed');assert.ok(station);
    assert.equal(bot.blockAt(new Vec3(12,-59,0)).name,'air');
    return {cooked:2,craftedPickaxe:true,quarriedStone:true,placedFurnace:true,woodFuel:true};
  });
  await check('paused cooking resumes its own saved furnace batch without mixing other work',async()=>{
    command('give NativeFixture minecraft:porkchop 2');await until(()=>count('porkchop')===2,'interrupted meal');
    let paused=false,pauseWork;
    const original=store.put.bind(store);store.put=(collection,record)=>{original(collection,record);if(!paused&&collection==='furnaceJobs'&&record.status==='cooking'){paused=true;pauseWork=runtime.control('pause');}};
    try{await assert.rejects(runtime.execute('cook_food',{count:2}));await pauseWork;await runtime.waitForIdle();}
    finally{store.put=original;}
    assert.equal(runtime.state,'PAUSED');await runtime.control('resume');
    const result=await runtime.execute('cook_food',{count:2});assert.equal(result.success,true,JSON.stringify(result));assert.equal(count('cooked_porkchop'),2);
    return {resumed:true,cooked:2,confirmedInventory:true};
  });
  await check('busy foreign furnace remains untouched while a separate furnace cooks the meal',async()=>{
    const old=store.get('utilityBlocks').find(value=>value.name==='furnace'),p=old.position;
    command(`item replace block ${p.x} ${p.y} ${p.z} container.0 with minecraft:raw_iron 1`);
    command(`item replace block ${p.x} ${p.y} ${p.z} container.1 with minecraft:coal 1`);
    command(`item replace block ${p.x} ${p.y} ${p.z} container.2 with minecraft:iron_ingot 64`);
    command('give NativeFixture minecraft:cobblestone 8');command('give NativeFixture minecraft:chicken 1');
    await until(()=>count('chicken')===1&&count('cobblestone')>=8,'busy furnace meal');
    const result=await runtime.execute('cook_food',{count:1});assert.equal(result.success,true,JSON.stringify(result));assert.equal(count('cooked_chicken'),1);
    const original=await bot.openFurnace(bot.blockAt(new Vec3(p.x,p.y,p.z)));
    try{assert.equal(original.inputItem().name,'raw_iron');assert.equal(original.inputItem().count,1);assert.equal(original.outputItem().name,'iron_ingot');assert.equal(original.outputItem().count,64);}finally{original.close();}
    return {separateFurnace:true,foreignInputAndOutputPreserved:true,cooked:1};
  });

}
