import nativeProtocol from '../services/native-26.3/preload.cjs';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, writeFile, rm, realpath } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import os from 'node:os';
import mineflayer from 'mineflayer';
import { CompanionRuntime } from '../services/companion-runtime/index.js';
import { Store } from '../services/memory/store.js';
import { Vec3 } from 'vec3';
import { executeBuild } from '../services/build-executor/index.js';
import { validateBlueprint, blueprintHash } from '../services/build-planner/blueprint.js';
import { NativeRealmClient } from '../services/realm-connector/native-client.js';
import { TeammateService } from '../services/skill-executor/teammate.js';
import { createOrchestrator } from '../services/agent-orchestrator/index.js';
import Fastify from 'fastify';
import { randomUUID } from 'node:crypto';
import { registerBuildRoutes } from '../services/build-planner/index.js';
import {survivalFixtureChecks} from './survival-fixture-checks.mjs';
const cache = path.join(process.env.LOCALAPPDATA, 'MinecraftCompanion/test-runtime-modern');
const manifest = JSON.parse((await readFile(path.join(cache,'runtime.json'),'utf8')).replace(/^\uFEFF/,''));
const SERVER_SHA1 = '33680f5f2ac32864d6d7cf5e56a705fdb3e05f4c';
async function checkedCachePath(value) {
  if (typeof value !== 'string') throw new Error('Invalid modern test runtime manifest. Run Setup-ModernTest.ps1.');
  const resolved = await realpath(value), base = await realpath(cache);
  if (!resolved.toLowerCase().startsWith((base + path.sep).toLowerCase())) throw new Error('Modern runtime path escaped its dedicated test cache.');
  return resolved;
}
for (const field of ['java', 'serverJar', 'eulaReceipt']) manifest[field] = await checkedCachePath(manifest[field]);
async function digest(file, algorithm) { const hash = createHash(algorithm); for await (const chunk of createReadStream(file)) hash.update(chunk); return hash.digest('hex'); }
assert.equal(manifest.minecraftVersion, '26.3');
assert.equal(await digest(manifest.serverJar, 'sha1'), SERVER_SHA1, 'Official modern server SHA1');
assert.equal(await digest(manifest.java, 'sha256'), manifest.javaExecutableSha256, 'Private Java executable SHA256');
assert.equal(JSON.parse((await readFile(manifest.eulaReceipt, 'utf8')).replace(/^\uFEFF/, '')).accepted, true, 'Local Minecraft EULA receipt');
if (process.argv.includes('--check-runtime')) { console.log('Verified private Java 25, official Minecraft 26.3 server SHA1, dedicated paths and EULA receipt.'); process.exit(0); }
assert.equal(nativeProtocol.installed, true, 'Run npm run setup:native first.');
const directory = await mkdtemp(path.join(os.tmpdir(),'companion-native-'));
const logs=[],results=[], errors=[]; let child,runtime,store,recipient,exitPromise,exited=false,failed=false;
const EXPECTED_CHECKS = process.argv.includes('--survival-only')?7:process.argv.includes('--survival-skills')?24:17;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(predicate, label, timeout = 30000) {
  const started = Date.now();
  while (!predicate()) {
    if (exited) throw new Error(`Server exited during ${label}.`);
    if (Date.now() - started > timeout) throw new Error(`${label} timed out. ${errors.join(' | ')}`);
    await sleep(50);
  }
}
const command=text=>child.stdin.write(text+'\n');
async function check(name, work) {
  let detail;try{detail=await work();}catch(error){console.error('FIXTURE DIAGNOSTIC '+JSON.stringify({stack:runtime?.taskStack?.snapshot(),task:runtime?.currentTask,logs:runtime?.logs?.slice(-5)}));throw error;}
  results.push({ name, status: 'passed', detail });
  console.log(`PASS ${name} ${JSON.stringify(detail ?? {})}`);
}
const timeout=setTimeout(()=>{failed=true;runtime?.bot?.end();child?.kill();},process.argv.includes('--survival-skills')?360000:240000);
try {
 const probe=net.createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');const port=probe.address().port;await new Promise(r=>probe.close(r));
 await writeFile(path.join(directory,'eula.txt'),'eula=true\n');
 await writeFile(path.join(directory,'server.properties'),['server-ip=127.0.0.1',`server-port=${port}`,'white-list=false','enforce-whitelist=false','online-mode=false','enforce-secure-profile=false','gamemode=survival','force-gamemode=true','difficulty=peaceful','view-distance=2','simulation-distance=2','spawn-protection=0','max-players=2','max-world-size=256','generate-structures=false','level-type=minecraft:flat','generator-settings={"layers":[{"block":"minecraft:bedrock","height":1},{"block":"minecraft:stone","height":3},{"block":"minecraft:grass_block","height":1}],"biome":"minecraft:plains"}','enable-rcon=false','enable-query=false','max-tick-time=-1','pause-when-empty-seconds=0'].join('\n'));
 child=spawn(manifest.java,['-Xms256M','-Xmx768M','-XX:ActiveProcessorCount=2','-jar',manifest.serverJar,'nogui'],{cwd:directory,windowsHide:true,stdio:['pipe','pipe','pipe']});
 exitPromise=new Promise(r=>child.once('exit',()=>{exited=true;r()}));
 child.on('error', error => { errors.push(error.message); failed = true; exited = true; });
 child.stdout.on('data',data=>{for(const s of String(data).split(/\r?\n/)){logs.push(s);if(/Done \(|ERROR|Exception|lost connection|joined the game/.test(s))console.log(s)}});
 child.stderr.on('data',data=>logs.push(String(data)));
 await until(()=>logs.some(s=>s.includes('Done (')),'server ready',120000);
 command('setworldspawn 0 -59 0');command('time set day');
 store=new Store(path.join(directory,'state'));store.updateSettings({realmId:1,autonomy:'instructions'});
 runtime=new CompanionRuntime({store,connector:{close:async()=>{}},createBot:async()=>{
  const bot=mineflayer.createBot({host:'127.0.0.1',port,username:'NativeFixture',version:'26.3',auth:'offline',Client:NativeRealmClient,hideErrors:true,logErrors:false});
  bot.on('error',e=>{errors.push(e.message);console.log('CLIENT ERROR '+e.message)});bot.on('kicked',s=>{errors.push(JSON.stringify(s));console.log('KICK '+JSON.stringify(s))});return bot;
 }});
 await runtime.control('start');
 await until(()=>runtime.connection.status==='connected','native spawn',40000);
 let bot=runtime.bot;
 const teammate = new TeammateService({ runtime, store, publish() {} });
 const orchestrator = createOrchestrator({ runtime, store, publish() {}, request: async () => { throw new Error('Native fixture must not request a model.'); } });
 runtime.modelCancel = options => orchestrator.cancel(options);
 if(process.argv.includes('--survival-only')){
  const api=Fastify();await registerBuildRoutes(api,{runtime,store,publish(){},orchestrator,dataDir:store.directory});
  try{await survivalFixtureChecks({check,command,until,runtime,store,teammate,orchestrator});}finally{await api.close();}
 }else{
 await check('native survival spawn',async()=>{assert.equal(bot.version,'26.3');assert.equal(bot.registry.version.version,777);assert.equal(bot.game.gameMode,'survival');return {version:bot.version,protocol:bot.registry.version.version,gameMode:bot.game.gameMode}});
 await check('stable native physics',async()=>{let ticks=0;bot.on('physicsTick',()=>ticks++);await until(()=>ticks>=60,'60 physics ticks');assert.equal(runtime.connection.status,'connected');return{ticks}});
 command('tp NativeFixture 0 -59 0');
 await until(()=>bot.entity.position.distanceTo({x:0.5,y:-59,z:0.5})<0.1,'teleport sync');
 command('give NativeFixture minecraft:oak_log 4');
 await check('exact inventory',async()=>{await until(()=>runtime.world?.inventory.some(i=>i.name==='oak_log'&&i.count===4),'observed logs');assert.equal(runtime.world.inventoryExact,true);return {inventoryExact:runtime.world.inventoryExact,items:runtime.world.inventory.map(i=>({name:i.name,count:i.count}))}});
 await check('native survival pathfinding',async()=>{const before=bot.entity.position.clone();await runtime.execute('goto',{x:before.x+4,y:before.y,z:before.z,tolerance:1});assert.ok(bot.entity.position.distanceTo(before)>=2);return{distance:bot.entity.position.distanceTo(before)}});
 await check('native vanilla crafting',async()=>{const result=await runtime.execute('craft_item',{item:'oak_planks',count:4});await until(()=>runtime.world?.inventory.some(i=>i.name==='oak_planks'&&i.count>=4),'server confirmed planks');return {result,planks:runtime.world.inventory.find(i=>i.name==='oak_planks').count}});
 command('setblock 5 -59 0 minecraft:dirt');
 store.updateSettings({miningZone:{x:5,y:-59,z:0,radius:1}});
 await check('native survival gathering',async()=>{await until(()=>bot.blockAt(new Vec3(5,-59,0))?.name==='dirt','seeded dirt');const result=await runtime.execute('gather_blocks',{block:'dirt',count:1});await until(()=>runtime.world?.inventory.some(i=>i.name==='dirt'&&i.count>=1),'dirt pickup');return{result,dirt:runtime.world.inventory.find(i=>i.name==='dirt').count}});
 command('give NativeFixture minecraft:stone 12');
 await until(()=>runtime.world?.inventory.some(i=>i.name==='stone'&&i.count===12),'seeded build stone');
 await check('native approved construction and checkpoint resume',async()=>{
  const blueprint=validateBlueprint({version:'26.3',dimensions:{x:2,y:2,z:2},provenance:'reconstructed',uncertainties:[],blocks:[{x:0,y:0,z:0,name:'stone'},{x:1,y:0,z:0,name:'stone'},{x:0,y:0,z:1,name:'stone'},{x:1,y:0,z:1,name:'stone'},{x:0,y:1,z:0,name:'stone'},{x:1,y:1,z:0,name:'stone'}]});
  const project={id:'native-build',revision:1,approvedRevision:1,blueprint,approvedHash:blueprintHash(blueprint),assignments:[]},origin={x:2,y:-59,z:3};
  await assert.rejects(runtime.runJob('native-build-interrupt',signal=>executeBuild({project,origin,bot,signal,save:p=>{store.put('projects',p);if(p.checkpoint.verified.length===2)runtime.jobController.abort(new Error('Fixture construction interruption'));}})),/interruption/);
  const persisted=structuredClone(store.get('projects')[0]);assert.equal(persisted.checkpoint.status,'paused');assert.equal(persisted.checkpoint.verified.length,2);
  const result=await runtime.runJob('native-build-resume',signal=>executeBuild({project:persisted,origin,bot,signal,save:p=>store.put('projects',p)}));assert.equal(result.status,'complete');assert.equal(persisted.checkpoint.verified.length,6);
  for(const block of blueprint.blocks)assert.equal(bot.blockAt(new Vec3(origin.x+block.x,origin.y+block.y,origin.z+block.z)).name,block.name);
  return{verified:persisted.checkpoint.verified.length,status:result.status};
 });
 await check('native partial item drop has authoritative inventory and a physical dropped entity',async()=>{
  const result=await runtime.execute('drop_item',{item:'stone',count:2});assert.equal(result.success,true);assert.equal(result.dropped,2);
  assert.equal(bot.inventory.items().filter(item=>item.name==='stone').reduce((sum,item)=>sum+item.count,0),result.availableBefore-2);
  await until(()=>Object.values(bot.entities).some(entity=>entity.getDroppedItem?.()?.name==='stone'),'physical stone drop');
  assert.equal(runtime.world.inventoryExact,true);return{dropped:result.dropped,serverConfirmed:true,physicalDropObserved:true};
 });
 recipient=mineflayer.createBot({host:'127.0.0.1',port,username:'NativeRecipient',version:'26.3',auth:'offline',Client:NativeRealmClient,hideErrors:true,logErrors:false});
 recipient.on('error',error=>errors.push(error.message));await once(recipient,'spawn');
 command('tp NativeRecipient 8.5 -59 0.5');
 await until(()=>bot.players.NativeRecipient?.entity?.position.distanceTo(new Vec3(8.5,-59,0.5))<0.1,'visible recipient');
 await check('native handoff reaches another real survival player',async()=>{
  const result=await runtime.execute('give_items_to_player',{player:'NativeRecipient',item:'oak_log',count:1});assert.equal(result.dropped,1);
  await until(()=>recipient.inventory.items().some(item=>item.name==='oak_log'&&item.count===1),'recipient actual pickup',10000);
  assert.equal(result.recipientPickupVerified,false);return{dropped:1,recipientObservedLogs:1,scope:'Recipient inventory is visible only to this separate local fixture client; production never claims to inspect the user inventory.'};
 });
 command('give NativeFixture minecraft:iron_axe 1');
 for(const x of [14,19]){for(let y=-59;y<=-56;y++)command(`setblock ${x} ${y} 0 minecraft:oak_log`);command(`setblock ${x} -55 0 minecraft:oak_leaves[persistent=true]`);}
 await until(()=>bot.inventory.items().some(item=>item.name==='iron_axe')&&bot.blockAt(new Vec3(19,-56,0))?.name==='oak_log','natural tree fixtures');
 await check('native batch tree collection uses an axe and visits unique logs',async()=>{
  const before=bot.inventory.items().filter(item=>item.name==='oak_log').reduce((sum,item)=>sum+item.count,0),started=Date.now();
  const handTime=bot.blockAt(new Vec3(14,-59,0)).digTime(null,false,false,false,[],{});
  const result=await runtime.execute('chop_tree',{count:8,species:'oak'});
  const elapsedMs=Date.now()-started,after=bot.inventory.items().filter(item=>item.name==='oak_log').reduce((sum,item)=>sum+item.count,0);
  assert.equal(result.mined,8,JSON.stringify(result));assert.ok(after-before>=8,JSON.stringify(result));assert.equal(bot.heldItem?.name,'iron_axe');
  for(const x of [14,19])for(let y=-59;y<=-56;y++)assert.equal(bot.blockAt(new Vec3(x,y,0)).name,'air');
  return{mined:result.mined,collected:after-before,trees:result.trees,elapsedMs,tool:bot.heldItem.name,handTimePerLogMs:handTime};
 });
 await check('native routine withdraws missing food, torches and replacement tool from an approved chest', async () => {
  command('setblock 22 -59 3 minecraft:chest');
  command('item replace block 22 -59 3 container.0 with minecraft:bread 20');
  command('item replace block 22 -59 3 container.1 with minecraft:torch 64');
  command('item replace block 22 -59 3 container.2 with minecraft:stone_pickaxe 1');
  await until(()=>bot.blockAt(new Vec3(22,-59,3))?.name==='chest','approved fixture supply chest');
  store.put('supplyChests',{id:'fixture-supply',name:'Supplies',position:{x:22,y:-59,z:3},realmId:1,dimension:bot.game.dimension,approved:true,allowedItems:['bread','torch','stone_pickaxe']});
  const result=await runtime.execute('prepare_routine',{routine:'mining'});assert.equal(result.success,true,JSON.stringify(result));
  for(const [name,count] of [['bread',8],['torch',32],['stone_pickaxe',1]])assert.equal(bot.inventory.items().filter(item=>item.name===name).reduce((sum,item)=>sum+item.count,0),count);
  const chest=store.get('supplyChests')[0];assert.equal(chest.provenance,'observed-container');
  return{observedStock:chest.inventory,inventoryExact:runtime.world.inventoryExact};
 });
 await check('native named-place travel uses saved observed coordinates',async()=>{
  const place=teammate.saveLocation({name:'Supply stop',source:'companion'});
  await runtime.execute('goto',{x:17,y:-59,z:3,tolerance:1});
  const result=await runtime.execute('visit_location',{name:'Supply stop'});assert.equal(result.success,true,JSON.stringify(result));
  assert.ok(bot.entity.position.distanceTo(new Vec3(place.position.x,place.position.y,place.position.z))<4);
  return{place:place.position,dimension:place.dimension};
 });
 await check('native temporary request resumes partial gathering automatically without model requests',async()=>{
  for(const x of [27,32]){for(let y=-59;y<=-56;y++)command(`setblock ${x} ${y} 0 minecraft:oak_log`);command(`setblock ${x} -55 0 minecraft:oak_leaves[persistent=true]`);}
  await until(()=>bot.blockAt(new Vec3(32,-56,0))?.name==='oak_log','interruptible tree fixtures');
  const count=()=>bot.inventory.items().filter(item=>item.name==='oak_log').reduce((sum,item)=>sum+item.count,0),before=count();
  await orchestrator.respond('get 8 oak logs');
  await until(()=>count()>=before+4&&runtime.currentTask?.tool==='chop_tree','partial gathering progress');
  store.updateSettings({playerName:'NativeRecipient'});
  await orchestrator.respond('come here');
  await until(()=>runtime.taskStack.frames.length===0&&!runtime.taskStack.worker,'helper and resumed gathering',65000);
  assert.ok(count()>=before+8,JSON.stringify(runtime.taskStack.snapshot()));assert.equal(orchestrator.usage.requests,0);
  return{gained:count()-before,modelRequests:0,stackEmpty:true,tasks:store.get('tasks').slice(-4).map(task=>({name:task.name,status:task.status,requested:task.descriptor?.args?.count}))};
 });
 await check('native help-me reaches the player and hands off observed food',async()=>{
  const before=recipient.inventory.items().filter(item=>item.name==='bread').reduce((sum,item)=>sum+item.count,0);
  const result=await runtime.execute('rescue_player',{});assert.equal(result.success,true,JSON.stringify(result));
  assert.equal(result.handoff.dropped,2);await until(()=>recipient.inventory.items().filter(item=>item.name==='bread').reduce((sum,item)=>sum+item.count,0)>=before+2,'recipient real food pickup');
  return{droppedFood:2,recipientPickupObservedOnlyByFixture:true};
 });
 await check('native approved construction automatically resumes after a temporary player request',async()=>{
  command('give NativeFixture minecraft:stone 12');await until(()=>bot.inventory.items().filter(item=>item.name==='stone').reduce((sum,item)=>sum+item.count,0)>=12,'construction helper fixture stock');
  const blueprint=validateBlueprint({version:'26.3',dimensions:{x:4,y:1,z:2},provenance:'reconstructed',uncertainties:[],blocks:Array.from({length:8},(_,index)=>({x:index%4,y:0,z:Math.floor(index/4),name:'stone'}))});
  const project={id:randomUUID(),name:'Temporary request floor',version:'26.3',revision:1,approvedRevision:1,blueprint,approvedHash:blueprintHash(blueprint),assignments:[],reservations:{},status:'approved'};
  store.put('projects',project);
  const api=Fastify({logger:false});registerBuildRoutes(api,{store,runtime,publish(){},dataDir:directory});
  try{
   const start=await api.inject({method:'POST',url:`/api/projects/${project.id}/build`,payload:{origin:{x:12,y:-59,z:7}}});assert.equal(start.statusCode,200,start.body);
   await until(()=>store.get('projects').find(value=>value.id===project.id)?.checkpoint?.verified.length>=1,'first real floor placement');
   await orchestrator.respond('come here');
   await until(()=>!runtime.taskStack.worker&&runtime.taskStack.frames.length===0,'automatic approved floor resume',45000);
   const completed=store.get('projects').find(value=>value.id===project.id);assert.equal(completed.checkpoint.status,'complete');assert.equal(completed.checkpoint.verified.length,8);
   for(const block of blueprint.blocks)assert.equal(bot.blockAt(new Vec3(12+block.x,-59,7+block.z)).name,'stone');
   assert.ok(store.get('tasks').some(task=>task.name===`build:${project.name}`&&task.status==='interrupted'));
   return{verified:8,modelRequests:orchestrator.usage.requests,approvalRevalidated:true};
  }finally{await api.close();}
 });
 if(process.argv.includes('--survival-skills'))await survivalFixtureChecks({check,command,until,runtime,store,teammate,orchestrator});
 await check('native death record and legitimate pickup recovery',async()=>{
  await runtime.execute('goto',{x:30,y:-59,z:5,tolerance:1});
  command('kill NativeFixture');await until(()=>store.get('deaths').length&&runtime.state==='PAUSED','saved death and pause');
  await until(()=>bot.health>0&&bot.entity.onGround,'healthy grounded respawn');
  console.log('RESPAWN '+JSON.stringify({health:bot.health,position:bot.entity.position,state:runtime.state}));
  await runtime.waitForIdle();await runtime.control('resume');
  const death=store.get('deaths').at(-1),result=await runtime.execute('recover_items',{deathId:death.id});
  assert.equal(result.success,true,JSON.stringify(result));assert.ok(Object.keys(result.gained).length);assert.equal(death.inventoryProvenance,'last-observed-before-death');
  return{deathPosition:death.position,gained:result.gained,status:store.get('deaths').at(-1).status};
 });
 await check('native disconnect and reconnect',async()=>{const old=bot;old._client.end('Native fixture transport loss');await until(()=>runtime.bot!==old&&runtime.connection.status==='connected','reconnect',50000);bot=runtime.bot;assert.equal(runtime.state,'PAUSED');await until(()=>runtime.world?.inventory.some(i=>i.name==='oak_planks'&&i.count>=4),'inventory retained');return{state:runtime.state,version:bot.version}});
}
}catch(e){failed=true;console.error(e.stack);results.push({failure:e.stack});}
finally {
  if (recipient && !recipient._client.ended) recipient.end('Local handoff fixture complete');
  try { await runtime?.close(); }
  catch (error) { failed = true; errors.push(`Runtime cleanup: ${error.message}`); }
  if (child?.pid && !exited) {
    command('stop'); await Promise.race([exitPromise, sleep(12000)]);
    if (!exited) { child.kill(); await Promise.race([exitPromise, sleep(10000)]); }
  }
  store?.close(); clearTimeout(timeout);
  const passed = !failed && exited && results.length === EXPECTED_CHECKS;
  await writeFile(process.argv.includes('--survival-only')?'.git/survival-game-results.json':'.git/native-game-results.json', JSON.stringify({
    at: new Date().toISOString(), serverVersion: '26.3', serverSha1: SERVER_SHA1,
    clientVersion: '26.3', protocol: 777, translated: false, lockHash: nativeProtocol.lockHash,
    scope: 'Disposable localhost-only official 26.3 survival server; no Microsoft authentication or Realm gameplay claimed.',
    passed, results, errors, logs: logs.slice(-60), serverExited: exited,
  }, null, 2));
  const resolved = path.resolve(directory), boundary = path.resolve(os.tmpdir()) + path.sep;
  if (resolved.startsWith(boundary) && path.basename(resolved).startsWith('companion-native-')) await rm(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 });
}
process.exit(!failed && exited && results.length === EXPECTED_CHECKS ? 0 : 1);
