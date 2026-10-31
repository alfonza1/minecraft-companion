import test from 'node:test';
import assert from 'node:assert/strict';
import minecraftData from 'minecraft-data';
import {Vec3} from 'vec3';
import {safeIronSource,ironStance,reservedMiningMaterials,getIron} from '../services/skill-executor/iron-mining.js';
import {quickPlan} from '../services/agent-orchestrator/quick-actions.js';
import {equipFastestTool} from '../src/mining.js';
import {findResource} from '../services/skill-executor/resource-search.js';

function fixture(){
  const rows=new Map(),position=new Vec3(20,64,0),bot={minenessReady:true,health:20,food:20,entity:{position},game:{dimension:'overworld'},canSeeBlock:()=>true,registry:minecraftData('1.21.4'),inventory:{items:()=>[]}};
  const store={get:name=>rows.get(name)??[],settings:()=>({realmId:1}),put(name,row){rows.set(name,[...(rows.get(name)??[]).filter(r=>r.id!==row.id),row]);}};
  const service={runtime:{bot},store,reserved:()=>0,publish(){},threats:()=>[]};
  return {bot,store,service,rows};
}
test('ordinary iron requests route directly to one autonomous objective without model inference',()=>{
  for(const query of ['find iron','can you get me some iron','help me find iron','mine 16 iron','get iron ingots'])assert.equal(quickPlan(query,{world:{inventory:[]}}).actions[0].tool,'get_iron');
  assert.equal(quickPlan('get 16 iron',{world:{inventory:[]}}).actions[0].args.count,16);
  for(const query of ['what is iron used for','how do I find iron','find 999 iron'])assert.equal(quickPlan(query,{world:{inventory:[]}}),null);
});
test('ore harvesting protects home, containers, project footprints, liquids and unseen/below-foot blocks',()=>{
  const f=fixture(),position=new Vec3(23,64,0),ore={name:'iron_ore',position};
  const terrain=p=>({name:p.z===1?'air':'stone',boundingBox:p.z===1?'empty':'block',position:p});
  f.bot.blockAt=terrain;assert.equal(safeIronSource(f.service,ore),true);
  f.store.put('locations',{id:'home',name:'Home',realmId:1,dimension:'overworld',position:{x:23,y:64,z:0}});assert.equal(safeIronSource(f.service,ore),false);f.rows.delete('locations');
  f.store.put('supplyChests',{id:'chest',realmId:1,dimension:'overworld',position:{x:23,y:64,z:0}});assert.equal(safeIronSource(f.service,ore),false);f.rows.delete('supplyChests');
  f.store.put('projects',{id:'house',blueprint:{dimensions:{x:3,y:3,z:3}},checkpoint:{realmId:1,dimension:'overworld',origin:{x:24,y:64,z:0}}});assert.equal(safeIronSource(f.service,ore),false);f.rows.delete('projects');
  f.bot.blockAt=p=>({name:'lava',position:p});assert.equal(safeIronSource(f.service,ore),false);
  f.bot.blockAt=terrain;f.bot.canSeeBlock=()=>false;assert.equal(safeIronSource(f.service,ore),false);assert.equal(safeIronSource(f.service,ore,{visible:false}),true);f.bot.canSeeBlock=()=>true;
  assert.equal(safeIronSource(f.service,{name:'iron_ore',position:position.offset(0,-2,0)}),false);
});
test('vein navigation seeks another visible standing position when the current angle is blocked',()=>{
  const f=fixture(),ore={name:'iron_ore',position:new Vec3(23,64,0)};
  f.bot.canSeeBlock=()=>false;f.bot.canDigBlock=()=>true;
  f.bot.blockAt=p=>({name:p.y<64?'stone':'air',boundingBox:p.y<64?'block':'empty',position:p});
  f.bot.pathfinder={movements:{},getPathTo:()=>({status:'success',path:[]})};
  f.bot.world={raycast:eye=>eye.x<22?{position:ore.position}:null};
  const stance=ironStance(f.service,ore);assert.ok(stance);assert.ok(stance.x<22);
});
test('unfinished mining materials remain reserved and do not leak across Realms or dimensions',()=>{
  const f=fixture();f.store.put('miningMissions',{id:'iron',realmId:1,dimension:'overworld',status:'paused',reservations:{raw_iron:3,iron_ingot:2}});
  assert.equal(reservedMiningMaterials(f.service,'raw_iron'),3);f.bot.game.dimension='the_nether';assert.equal(reservedMiningMaterials(f.service,'raw_iron'),0);f.bot.game.dimension='overworld';
  f.store.put('miningMissions',{id:'iron',realmId:2,dimension:'overworld',status:'paused',reservations:{raw_iron:3}});assert.equal(reservedMiningMaterials(f.service,'raw_iron'),0);
  f.store.put('miningMissions',{id:'iron',realmId:1,dimension:'overworld',status:'cancelled',reservations:{raw_iron:3}});assert.equal(reservedMiningMaterials(f.service,'raw_iron'),0);
});
test('cancelled iron requests and cross-Realm checkpoints cannot start preparation',async()=>{
  const f=fixture(),controller=new AbortController();controller.abort();await assert.rejects(getIron(f.service,{count:8},controller.signal),{name:'AbortError'});
  f.store.put('miningMissions',{id:'iron',realmId:2,dimension:'overworld',target:8,status:'paused'});await assert.rejects(getIron(f.service,{count:8},new AbortController().signal),/another Realm/);
});
test('raw iron collection cannot select a faster Silk Touch tool',async()=>{
  const silk={name:'diamond_pickaxe',type:1,enchants:[{name:'silk_touch',lvl:1}]},plain={name:'stone_pickaxe',type:2};let equipped;
  const bot={registry:{itemsByName:{diamond_pickaxe:{maxDurability:1561},stone_pickaxe:{maxDurability:131}}},entity:{effects:{}},inventory:{slots:[],items:()=>[silk,plain]},getEquipmentDestSlot:()=>5,heldItem:silk,equip:async item=>{equipped=item;}};
  await equipFastestTool(bot,{canHarvest:type=>type!==null,digTime:type=>type===1?50:100},new AbortController().signal,{toolFilter:item=>!item?.enchants?.some(e=>e.name==='silk_touch')});assert.equal(equipped,plain);
});
test('searches already in the home area retain their clear departure tile beside utility blocks',async()=>{
  const f=fixture(),start=new Vec3(3,64,3),source=new Vec3(5,64,3),visited=[];
  f.bot.entity.position=start;f.bot.inventory.items=()=>[{name:'bread',count:8}];f.bot.time={timeOfDay:1000};f.bot.findBlocks=()=>[source];
  f.bot.blockAt=p=>({name:p.equals(source)?'bamboo':p.y<64?'stone':'air',boundingBox:p.y<64?'block':'empty',position:p});
  f.store.put('locations',{id:'home',name:'Home',realmId:1,dimension:'overworld',position:{x:0,y:64,z:0}});
  const result=await findResource(f.service,{item:'bamboo',radius:128},new AbortController().signal,{navigate:async(_bot,target)=>{visited.push(target);f.bot.entity.position=target;}});
  assert.equal(result.returnedHome,true);assert.ok(visited.every(p=>!p.equals(new Vec3(0,64,0))));assert.ok(f.bot.entity.position.equals(start));
});
