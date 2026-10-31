import assert from 'node:assert/strict';
import {Vec3} from 'vec3';

export async function miningChecks({check,command,until,runtime,store}){
  const bot=runtime.bot,count=name=>bot.inventory.items().filter(i=>i.name===name).reduce((n,i)=>n+i.count,0);
  command('gamerule minecraft:advance_time false');command('gamerule minecraft:spawn_mobs false');command('time set day');
  store.put('locations',{id:'home',name:'Home',realmId:1,dimension:'overworld',position:{x:0,y:-59,z:0}});
  store.put('routines',{id:'mining',label:'Test mining kit',supplies:[{name:'bread',count:8},{name:'torch',count:8},{name:'stone_pickaxe',count:1}]});
  async function reset(){command('clear NativeFixture');command('tp NativeFixture 0 -59 0');await until(()=>!bot.inventory.items().length&&bot.entity.position.distanceTo(new Vec3(.5,-59,.5))<1,'mining reset');}
  await check('mining preparation checks remembered chest then makes its pickaxe charcoal and torches from the world',async()=>{
    await reset();command('setblock 4 -59 4 minecraft:chest');command('item replace block 4 -59 4 container.0 with minecraft:bread 12');
    store.put('supplyChests',{id:'kit',name:'Remembered food',realmId:1,dimension:'overworld',position:{x:4,y:-59,z:4},approved:true,depositAllowed:true,allowedItems:['bread','torch','stone_pickaxe'],inventory:[],observedAt:'2000-01-01'});
    command('fill 12 -59 2 17 -59 5 minecraft:stone');
    for(const x of [12,16,20,24]){for(let y=-59;y<=-57;y++)command(`setblock ${x} ${y} -4 minecraft:oak_log`);command(`setblock ${x} -56 -4 minecraft:oak_leaves[persistent=true]`);}
    await until(()=>bot.blockAt(new Vec3(12,-59,2))?.name==='stone'&&bot.blockAt(new Vec3(24,-56,-4))?.name==='oak_leaves','world supplies');
    const progress=setInterval(()=>console.log('MINING_PREP',JSON.stringify({phase:store.get('miningPreparation')[0]?.phase,inventory:bot.inventory.items().map(i=>({name:i.name,count:i.count}))})),10000);
    let result;try{result=await runtime.execute('prepare_routine',{routine:'mining'});}finally{clearInterval(progress);}
    assert.equal(result.success,true,JSON.stringify(result));assert.equal(count('stone_pickaxe'),1);assert.ok(count('torch')>=8);assert.ok(count('bread')>=8);
    assert.ok(store.get('furnaceJobs').some(j=>j.category==='mining-fuel'&&j.status==='complete'));
    assert.notEqual(store.get('supplyChests').find(c=>c.id==='kit').observedAt,'2000-01-01');
    return {preparedFromWorld:true,rememberedEmptyChestRechecked:true,pickaxe:1,torches:count('torch'),food:count('bread')};
  });
  await check('mining preparation reuses actual tools torches and food from a remembered chest',async()=>{
    await reset();command('item replace block 4 -59 4 container.0 with minecraft:bread 8');command('item replace block 4 -59 4 container.1 with minecraft:stone_pickaxe');command('item replace block 4 -59 4 container.2 with minecraft:torch 8');
    const result=await runtime.execute('prepare_routine',{routine:'mining'});assert.equal(result.success,true,JSON.stringify(result));assert.equal(count('stone_pickaxe'),1);assert.equal(count('torch'),8);assert.equal(count('bread'),8);
    return {reusedChestKit:true,actualInventoryVerified:true};
  });
}
