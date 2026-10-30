import test from 'node:test';
import assert from 'node:assert/strict';
import {Vec3} from 'vec3';
import minecraftData from 'minecraft-data';
import {terrainFrontiers,observedTerrainPath} from '../services/skill-executor/terrain.js';
import {ensureBasicItem,freeBasic} from '../services/skill-executor/basic-production.js';
import {chooseIdleWork} from '../services/skill-executor/idle-work.js';

test('terrain scouting accepts ordinary slopes and rejects paths requiring excavation or unknown ground',()=>{
  let dig=false,hole=false;
  const bot={entity:{position:new Vec3(0,64,0)},blockAt:p=>{
    if(hole&&p.x===2)return null;
    const feet=p.x>=2?65:64;
    return {name:p.y<feet?'stone':'air',boundingBox:p.y<feet?'block':'empty'};
  },pathfinder:{movements:{},getPathTo:(_m,goal)=>({status:'success',path:[{x:1,y:64,z:0,toBreak:dig?[1]:[]},{x:2,y:65,z:0},{x:goal.x,y:goal.y,z:goal.z}]})}};
  assert.equal(observedTerrainPath(bot,new Vec3(3,65,0)),true);
  assert.ok(terrainFrontiers(bot,new Vec3(0,64,0),12).some(p=>p.y===65));
  dig=true;assert.equal(observedTerrainPath(bot,new Vec3(3,65,0)),false);
  dig=false;hole=true;assert.equal(observedTerrainPath(bot,new Vec3(3,65,0)),false);
});

test('basic crafting selects wood already owned instead of demanding another tree species',async()=>{
  const registry=minecraftData('1.21.5'),inventory=[{name:'oak_planks',count:8}],calls=[];
  const recipe=wood=>({result:{count:1},requiresTable:false,delta:[{id:registry.itemsByName[`${wood}_planks`].id,count:-4},{id:registry.itemsByName.crafting_table.id,count:1}]});
  const bot={registry,inventory:{items:()=>inventory},recipesAll:()=>[recipe('acacia'),recipe('oak')],supportFeature:()=>true,_syncWindow:async()=>{},craft:async value=>{
    calls.push(registry.items[value.delta[0].id].name);inventory[0].count-=4;inventory.push({name:'crafting_table',count:1});
  }};
  await ensureBasicItem({runtime:{bot},reserved:()=>0},'crafting_table',1,new AbortController().signal);
  assert.deepEqual(calls,['oak_planks']);assert.equal(inventory[0].count,4);
});

test('named wood variants and project reservations are not spent by basic preparation',()=>{
  const bot={inventory:{items:()=>[{name:'oak_planks',count:12,customName:'Keep'}]}};
  const service={runtime:{bot},reserved:()=>4};assert.equal(freeBasic(service,'oak_planks'),0);
  bot.inventory.items=()=>[{name:'oak_planks',count:12}];assert.equal(freeBasic(service,'oak_planks'),8);
});

test('idle teammate searches for food without visible animals, a weapon or an existing chest',()=>{
  const records={spawnPoints:[{id:'1:overworld',realmId:1,dimension:'overworld',position:{x:0,y:64,z:0},provenance:'server-reported'}]};
  const bot={minenessReady:true,health:20,food:20,entity:{position:new Vec3(0,64,0)},game:{dimension:'overworld'},registry:minecraftData('1.21.5'),inventory:{items:()=>[],emptySlotCount:()=>30},entities:{},findBlocks:()=>[],findBlock:()=>null};
  const service={runtime:{bot,isActive:()=>true},store:{get:name=>records[name]??[],settings:()=>({realmId:1,autonomy:'helpful'})},preferences:()=>({busyMode:true,autoDeposit:true}),reserved:()=>0,threats:()=>[]};
  assert.equal(chooseIdleWork(service).tool,'find_food');
});
