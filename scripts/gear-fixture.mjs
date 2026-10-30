import assert from 'node:assert/strict';
import {Vec3} from 'vec3';

export async function gearChecks({check,command,until,runtime,store}){
  const bot=runtime.bot,count=name=>bot.inventory.items().filter(item=>item.name===name).reduce((n,item)=>n+item.count,0);
  async function reset(){command('clear NativeFixture');command('tp NativeFixture 0 -59 0');command('time set day');await until(()=>!bot.inventory.items().length&&bot.entity.position.distanceTo(new Vec3(.5,-59,.5))<1,'gear reset');}
  command('gamerule minecraft:advance_time false');command('gamerule minecraft:spawn_mobs false');
  if(!process.argv.includes('--gear-wear-only'))await check('automatic gear upkeep crafts and equips iron armor and tools from real resources',async()=>{
    await reset();command('give NativeFixture minecraft:iron_ingot 35');command('give NativeFixture minecraft:oak_log 8');command('give NativeFixture minecraft:bread 12');
    await until(()=>count('iron_ingot')===35&&count('oak_log')===8,'gear materials');
    const result=await runtime.execute('maintain_gear',{});assert.equal(result.success,true,JSON.stringify(result));
    for(const [slot,name] of [['head','iron_helmet'],['torso','iron_chestplate'],['legs','iron_leggings'],['feet','iron_boots']])assert.equal(bot.inventory.slots[bot.getEquipmentDestSlot(slot)]?.name,name);
    assert.equal(count('iron_pickaxe'),1);assert.equal(count('iron_axe'),1);assert.equal(count('iron_ingot'),2);
    const repeat=await runtime.execute('maintain_gear',{});assert.deepEqual(repeat.crafted,[],'Equipped armor must count as owned, avoiding repeated crafting');
    return {crafted:result.crafted,armorVerified:true,ironRemaining:count('iron_ingot')};
  });
  await check('mining replaces a nearly broken axe and preserves the original before digging',async()=>{
    await reset();command('give NativeFixture minecraft:iron_axe[minecraft:damage=228] 1');command('give NativeFixture minecraft:iron_ingot 3');command('give NativeFixture minecraft:oak_log 4');
    for(let y=-59;y<=-57;y++)command(`setblock 12 ${y} -4 minecraft:oak_log`);command('setblock 12 -56 -4 minecraft:oak_leaves[persistent=true]');
    await until(()=>count('iron_axe')===1&&count('iron_ingot')===3&&bot.blockAt(new Vec3(12,-56,-4))?.name==='oak_leaves','replacement setup');
    const result=await runtime.execute('chop_tree',{count:3,species:'oak'});assert.equal(result.success,true,JSON.stringify(result));
    const axes=bot.inventory.items().filter(item=>item.name==='iron_axe');assert.equal(axes.length,2,JSON.stringify(axes.map(item=>({damage:item.durabilityUsed}))));assert.ok(axes.some(item=>item.durabilityUsed===230));assert.ok(axes.some(item=>item.durabilityUsed<10));
    return {axes:2,oldToolStoppedWith20UsesLeft:true,newAxeUsed:true};
  });
  if(!process.argv.includes('--gear-wear-only'))await check('raw iron is smelted and used for an automatic iron pickaxe upgrade',async()=>{
    await reset();command('give NativeFixture minecraft:raw_iron 3');command('give NativeFixture minecraft:oak_log 8');command('give NativeFixture minecraft:bread 12');command('fill 12 -59 2 15 -59 4 minecraft:stone');
    await until(()=>count('raw_iron')===3&&count('oak_log')===8&&bot.blockAt(new Vec3(12,-59,2))?.name==='stone','raw iron setup');
    const result=await runtime.execute('maintain_gear',{});assert.equal(result.success,true,JSON.stringify(result));assert.equal(count('raw_iron'),0);assert.equal(count('iron_pickaxe'),1);
    assert.ok(store.get('furnaceJobs').some(job=>job.category==='gear'&&job.status==='complete'));
    return {smeltedRawIron:3,ironPickaxe:1};
  });
}
