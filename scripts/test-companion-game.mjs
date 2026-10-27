import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createRequire} from 'node:module';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import mineflayer from 'mineflayer';
import {Vec3} from 'vec3';
import {CompanionRuntime} from '../services/companion-runtime/index.js';
import {Store} from '../services/memory/store.js';
import {executeBuild} from '../services/build-executor/index.js';
import {validateBlueprint,blueprintHash} from '../services/build-planner/blueprint.js';

// This executable only creates/connects to an ephemeral loopback test server.
// Fixture setup uses server APIs; the companion uses survival client packets.
const require=createRequire(import.meta.url),squid=require('flying-squid');
const defaults=require('flying-squid/config/default-settings.json');
const version='1.16.5',results=[];
let server,runtime,store;
const directory=await mkdtemp(path.join(os.tmpdir(),'companion-game-'));
const deadline=setTimeout(()=>{console.error('Local gameplay fixture exceeded 120 seconds.');process.exit(2);},120_000);
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(predicate,label,timeout=15_000){const start=Date.now();while(!predicate()){if(Date.now()-start>timeout)throw new Error(`${label} timed out.`);await delay(50);}}
async function check(name,fn){try{const detail=await fn();results.push({name,status:'passed',detail});console.log(`PASS ${name}${detail?' '+JSON.stringify(detail):''}`);}catch(error){const status=error.code==='FIXTURE_UNSUPPORTED'?'skipped':'failed';results.push({name,status,error:error.message});console.error(`${status==='skipped'?'SKIP':'FAIL'} ${name}: ${error.message}`);}}
try{
  server=squid.createMCServer({...defaults,host:'127.0.0.1',port:0,'online-mode':false,'everybody-op':false,logging:false,gameMode:0,difficulty:0,'view-distance':2,'max-entities':100,worldFolder:path.join(directory,'world'),version,generation:{name:'superflat',options:{seed:2116746182,middleThickness:3,middleId:1}}});
  const [port]=await once(server,'listening');await server.waitForReady();
  assert.equal(server._server.socketServer.address().address,'127.0.0.1');
  server.getSpawnPoint=async()=>new Vec3(0.5,5,0.5);
  store=new Store(path.join(directory,'state'));store.updateSettings({realmId:1,miningZone:{x:5,y:5,z:0,radius:1}});
  runtime=new CompanionRuntime({store,createBot:async()=>mineflayer.createBot({host:'127.0.0.1',port,username:'FixtureBot',version,auth:'offline',viewDistance:'tiny'}),connector:{close:async()=>{}}});
  const connected=once(runtime,'connected');await runtime.control('start');await connected;
  const bot=runtime.bot;await until(()=>bot.blockAt(new Vec3(0,4,0))?.name==='grass_block','observed spawn chunk');await until(()=>bot.entity.onGround,'initial ground contact');
  const player=server.players.find(p=>p.username==='FixtureBot');
  const Item=require('prismarine-item')(version);
  await check('survival connection and real world observation',async()=>{assert.equal(bot.game.gameMode,'survival');assert.equal(runtime.snapshot().world.position.y,5);return {version:bot.version,gameMode:bot.game.gameMode,position:runtime.snapshot().world.position};});
  await check('server inventory packets update dashboard world state',async()=>{
    player.inventory.updateSlot(36,new Item(bot.registry.itemsByName.stone.id,12));
    player.inventory.updateSlot(37,new Item(bot.registry.itemsByName.oak_log.id,4));
    await until(()=>runtime.snapshot().world.inventory.some(i=>i.name==='stone'&&i.count===12),'inventory observation');
    return runtime.snapshot().world.inventory.map(i=>({name:i.name,count:i.count}));
  });
  await check('real pathfinding movement',async()=>{const before=bot.entity.position.clone();const result=await runtime.execute('goto',{x:4,y:5,z:0,tolerance:1});assert.ok(bot.entity.position.distanceTo(before)>1);assert.equal(result.reached,true);return {position:runtime.snapshot().world.position};});
  await check('craft logs into planks using survival inventory clicks',async()=>{
    const result=await runtime.execute('craft_item',{item:'oak_planks',count:4});
    if(result.success===false&&/Server didn't respond to transaction/.test(result.summary)){
      const error=new Error('Flying-squid 1.12.0 inventory plugin implements neither transaction acknowledgments nor crafting recipes. Real survival crafting remains unvalidated; no fixture acknowledgments or output items are fabricated.');error.code='FIXTURE_UNSUPPORTED';throw error;
    }
    assert.ok(bot.inventory.items().some(i=>i.name==='oak_planks'&&i.count>=4),JSON.stringify(result));return result;
  });
  await check('gather a seeded dirt block with survival digging and pickup',async()=>{
    const target=new Vec3(5,5,0);await server.setBlock(server.overworld,target,server.registry.blocksByName.dirt.defaultState);
    await until(()=>bot.blockAt(target)?.name==='dirt','fixture dirt update');
    const result=await runtime.execute('gather_blocks',{block:'dirt',count:1});assert.ok(bot.inventory.items().some(i=>i.name==='dirt'&&i.count>=1),JSON.stringify({result,observedEntities:Object.values(bot.entities).map(e=>({name:e.name,type:e.type,position:e.position,isValid:e.isValid})),fixtureEntities:Object.values(server.entities).map(e=>({name:e.name,type:e.type,position:e.position,itemId:e.itemId,itemCount:e.itemCount}))}));return result;
  });
  await check('approved full-cube survival construction and fresh world verification',async()=>{
    const blueprint=validateBlueprint({version,dimensions:{x:2,y:2,z:2},provenance:'reconstructed',uncertainties:[],blocks:[{x:0,y:0,z:0,name:'stone'},{x:1,y:0,z:0,name:'stone'},{x:0,y:0,z:1,name:'stone'},{x:1,y:0,z:1,name:'stone'},{x:0,y:1,z:0,name:'stone'},{x:1,y:1,z:0,name:'stone'}]});
    const project={id:'fixture-build',revision:1,approvedRevision:1,blueprint,approvedHash:blueprintHash(blueprint)};
    const origin={x:2,y:5,z:3};
    await assert.rejects(runtime.runJob('fixture-build-interrupt',signal=>executeBuild({project,origin,bot,signal,save:p=>{store.put('projects',p);if(p.checkpoint.verified.length===2)runtime.jobController.abort(new Error('Fixture construction interruption'));}})),/interruption/);
    assert.equal(store.get('projects')[0].checkpoint.status,'paused');
    assert.equal(store.get('projects')[0].checkpoint.verified.length,2);
    const persisted=structuredClone(store.get('projects')[0]);
    const result=await runtime.runJob('fixture-build-resume',signal=>executeBuild({project:persisted,origin,bot,signal,save:p=>store.put('projects',p)}));
    assert.equal(result.status,'complete');assert.equal(persisted.checkpoint.verified.length,6);
    assert.equal(bot.inventory.items().filter(i=>i.name==='stone').reduce((n,i)=>n+i.count,0),6);
    return result;
  });
  await check('pause cancels active navigation and preserves interrupted task',async()=>{
    const moving=runtime.execute('goto',{x:25,y:5,z:0,tolerance:1});moving.catch(()=>{});await delay(150);await runtime.control('pause');await moving.catch(()=>{});
    assert.equal(runtime.state,'PAUSED');assert.ok(store.get('tasks').some(t=>t.status==='interrupted'));const position=bot.entity.position.clone();await delay(300);assert.ok(bot.entity.position.distanceTo(position)<0.5);await runtime.control('resume');return {state:runtime.state};
  });
  await check('connection loss recovers with explicit resume required',async()=>{
    const previous=runtime.bot;const recovered=once(runtime,'connected');previous._client.end('Fixture transport loss');await recovered;assert.equal(runtime.state,'PAUSED');assert.notEqual(runtime.bot,previous);await runtime.control('resume');return {state:runtime.state,reconnectAttempt:runtime.connection.reconnectAttempt};
  });
}catch(error){results.push({name:'fixture setup',status:'failed',error:error.stack});console.error(error);}
finally{
  await runtime?.close().catch(error=>console.error('runtime cleanup',error.message));
  await delay(300);
  await server?.quit().catch(error=>console.error('server cleanup',error.message));
  store?.close();
  const absolute=path.resolve(directory);if(absolute.startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(absolute).startsWith('companion-game-'))await rm(absolute,{recursive:true,force:true,maxRetries:5,retryDelay:100});
  clearTimeout(deadline);
}
console.log(JSON.stringify({suite:'local survival protocol integration',version,results},null,2));
// Flying-squid opens an interactive logger/readline handle even with logging
// disabled. All actual server/world/runtime handles are closed above.
process.exit(results.some(r=>r.status==='failed')?1:0);
