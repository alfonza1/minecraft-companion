import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,readFile,writeFile,rm,mkdir,realpath} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import net from 'node:net';
import path from 'node:path';
import os from 'node:os';
import mineflayer from 'mineflayer';
import {CompanionRuntime} from '../services/companion-runtime/index.js';
import {Store} from '../services/memory/store.js';
import {Vec3} from 'vec3';
import {executeBuild} from '../services/build-executor/index.js';
import {validateBlueprint,blueprintHash} from '../services/build-planner/blueprint.js';

const repo=path.resolve(import.meta.dirname,'..');
const cache=path.join(process.env.LOCALAPPDATA,'MinecraftCompanion','test-runtime');
const manifest=JSON.parse((await readFile(path.join(cache,'runtime.json'),'utf8')).replace(/^\uFEFF/,''));
async function checkedCachePath(value){
  if(typeof value!=='string')throw new Error('Invalid runtime manifest path. Run Setup-VanillaTest.ps1.');
  const resolved=await realpath(value),base=await realpath(cache);
  if(!resolved.toLowerCase().startsWith((base+path.sep).toLowerCase()))throw new Error('Runtime manifest path escaped the dedicated test cache.');
  return resolved;
}
for(const field of ['java','serverJar','eulaReceipt'])manifest[field]=await checkedCachePath(manifest[field]);
async function digest(file,algorithm){const hash=createHash(algorithm);for await(const chunk of createReadStream(file))hash.update(chunk);return hash.digest('hex');}
if(manifest.minecraftVersion!=='1.21.5'||await digest(manifest.serverJar,'sha1')!=='e6ec2f64e6080b9b5d9b471b291c33cc7f509733')throw new Error('Official test server version/checksum validation failed. Run Setup-VanillaTest.ps1.');
if(await digest(manifest.java,'sha256')!==manifest.javaExecutableSha256)throw new Error('Cached Java executable checksum validation failed. Run Setup-VanillaTest.ps1.');
const receipt=JSON.parse((await readFile(manifest.eulaReceipt,'utf8')).replace(/^\uFEFF/,''));
if(receipt.accepted!==true)throw new Error('Local Minecraft server EULA acceptance is required.');
if(process.argv.includes('--check-runtime')){console.log('Verified private test runtime paths, Java SHA256, official server SHA1, and EULA receipt.');process.exit(0);}
const directory=await mkdtemp(path.join(os.tmpdir(),'companion-vanilla-'));
const evidence={at:new Date().toISOString(),serverVersion:manifest.minecraftVersion,serverSha1:manifest.minecraftServerSha1,javaVersion:manifest.javaVersion,scope:'Private ephemeral localhost vanilla survival integration; never a Realm',results:[]};
const logs=[];let child,runtime,store,exitPromise,exitResult=null,failed=false;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const controller=new AbortController();
const watchdog=setTimeout(()=>{controller.abort(new Error('Vanilla integration exceeded 180 seconds.'));child?.kill();},180_000);
function line(text){logs.push(text);if(logs.length>120)logs.shift();}
async function until(predicate,label,timeout=20_000){const started=Date.now();while(!predicate()){controller.signal.throwIfAborted();if(Date.now()-started>timeout)throw new Error(`${label} timed out.`);await pause(50);}}
async function check(name,fn){const detail=await fn();evidence.results.push({name,status:'passed',detail});console.log(`PASS ${name} ${JSON.stringify(detail??{})}`);}
function command(text){if(!child||child.exitCode!==null)throw new Error('Test server is not running.');child.stdin.write(text+'\n');}
try{
  const probe=net.createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
  await writeFile(path.join(directory,'eula.txt'),'eula=true\n');
  await writeFile(path.join(directory,'server.properties'),[
    'server-ip=127.0.0.1',`server-port=${port}`,'online-mode=false','enforce-secure-profile=false','gamemode=survival','force-gamemode=true','difficulty=peaceful','view-distance=2','simulation-distance=2','spawn-protection=0','max-players=2','max-world-size=256','generate-structures=false','level-type=minecraft:flat','generator-settings={"layers":[{"block":"minecraft:bedrock","height":1},{"block":"minecraft:stone","height":3},{"block":"minecraft:grass_block","height":1}],"biome":"minecraft:plains"}','enable-rcon=false','enable-query=false','enable-jmx-monitoring=false','allow-nether=false','network-compression-threshold=256','max-tick-time=-1','pause-when-empty-seconds=0','sync-chunk-writes=false','motd=Minecraft Companion isolated vanilla test','region-file-compression=deflate','initial-enabled-packs=vanilla',
  ].join('\n')+'\n');
  console.log(`Starting private Minecraft ${manifest.minecraftVersion} fixture on 127.0.0.1:${port}, Java21 heap768MiB.`);
  child=spawn(manifest.java,['-Xms256M','-Xmx768M','-XX:ActiveProcessorCount=2','-jar',manifest.serverJar,'nogui'],{cwd:directory,windowsHide:true,shell:false,stdio:['pipe','pipe','pipe']});
  exitPromise=new Promise(resolve=>child.once('exit',(code,signal)=>{exitResult={code,signal};resolve(exitResult);}));
  child.stdout.on('data',data=>{for(const entry of String(data).split(/\r?\n/)){line(entry);if(/Done \(|ERROR|Exception|Starting minecraft server/.test(entry))console.log(entry);}});
  child.stderr.on('data',data=>line(String(data)));
  child.once('error',error=>controller.abort(error));
  await until(()=>logs.some(text=>text.includes('Done (')),'vanilla server ready',120_000);
  command('gamerule spawnRadius 0');command('gamerule spawnChunkRadius 0');command('gamerule doDaylightCycle false');command('gamerule doMobSpawning false');command('time set day');command('setworldspawn 0 -59 0');
  store=new Store(path.join(directory,'app-state'));store.updateSettings({realmId:1,autonomy:'instructions'});
  runtime=new CompanionRuntime({store,createBot:async()=>mineflayer.createBot({host:'127.0.0.1',port,username:'VanillaFixture',version:manifest.minecraftVersion,auth:'offline',viewDistance:'tiny'}),connector:{close:async()=>{}}});
  const connected=once(runtime,'connected');await runtime.control('start');await Promise.race([connected,new Promise((_resolve,reject)=>setTimeout(()=>reject(new Error('Vanilla bot connection timed out.')),20_000))]);
  const bot=runtime.bot;await until(()=>bot.entity.onGround,'survival spawn ground contact');
  await check('official vanilla server survival connection',async()=>{assert.equal(bot.game.gameMode,'survival');return {version:bot.version,gameMode:bot.game.gameMode,position:runtime.snapshot().world.position};});
  command('give VanillaFixture minecraft:oak_log 4');
  await until(()=>runtime.snapshot().world.inventory.some(item=>item.name==='oak_log'&&item.count===4),'four seeded logs observed from real inventory packets');
  await check('real server inventory provenance',async()=>({inventory:runtime.snapshot().world.inventory.map(item=>({name:item.name,count:item.count}))}));
  await check('craft four oak planks using survival client inventory transactions',async()=>{
    const result=await runtime.execute('craft_item',{item:'oak_planks',count:4});
    const planks=bot.inventory.items().filter(item=>item.name==='oak_planks').reduce((count,item)=>count+item.count,0);
    const logsRemaining=bot.inventory.items().filter(item=>item.name==='oak_log').reduce((count,item)=>count+item.count,0);
    assert.equal(result.success,true,JSON.stringify(result));assert.equal(planks,4,JSON.stringify(result));assert.equal(logsRemaining,3);
    await until(()=>runtime.snapshot().world.inventory.some(item=>item.name==='oak_planks'&&item.count===4),'crafted inventory emitted to world service');
    return {result,observedPlanks:planks,observedLogsRemaining:logsRemaining};
  });
  await check('craft sticks and a wooden pickaxe using a nearby fixture crafting table',async()=>{
    command('setblock 2 -59 0 minecraft:crafting_table');
    await until(()=>bot.blockAt(new Vec3(2,-59,0))?.name==='crafting_table','seeded table observed');
    const planks=await runtime.execute('craft_item',{item:'oak_planks',count:8});assert.equal(planks.success,true,JSON.stringify(planks));
    const sticks=await runtime.execute('craft_item',{item:'stick',count:4});assert.equal(sticks.success,true,JSON.stringify(sticks));
    const pickaxe=await runtime.execute('craft_item',{item:'wooden_pickaxe',count:1});assert.equal(pickaxe.success,true,JSON.stringify(pickaxe));
    assert.ok(bot.inventory.items().some(item=>item.name==='wooden_pickaxe'&&item.count===1));
    return {sticksCrafted:sticks.crafted,pickaxesCrafted:pickaxe.crafted};
  });
  await check('mine and collect approved surface cobblestone using the crafted pickaxe',async()=>{
    command('setblock 5 -59 0 minecraft:cobblestone');
    await until(()=>bot.blockAt(new Vec3(5,-59,0))?.name==='cobblestone','seeded mining target observed');
    store.updateSettings({miningZone:{x:5,y:-59,z:0,radius:1}});
    const result=await runtime.execute('gather_blocks',{block:'cobblestone',count:1});assert.equal(result.success,true,JSON.stringify(result));
    assert.ok(bot.inventory.items().some(item=>item.name==='cobblestone'&&item.count>=1));
    return result;
  });
  await check('gather approved surface dirt using survival digging and pickup',async()=>{
    command('setblock 6 -59 0 minecraft:dirt');await until(()=>bot.blockAt(new Vec3(6,-59,0))?.name==='dirt','seeded dirt target observed');
    store.updateSettings({miningZone:{x:6,y:-59,z:0,radius:1}});
    const result=await runtime.execute('gather_blocks',{block:'dirt',count:1});assert.equal(result.success,true,JSON.stringify(result));assert.ok(bot.inventory.items().some(item=>item.name==='dirt'&&item.count>=1));return result;
  });
  await check('survival six-block construction with persisted interruption and resume',async()=>{
    command('give VanillaFixture minecraft:stone 12');await until(()=>bot.inventory.items().some(item=>item.name==='stone'&&item.count===12),'stone fixture inventory observed');
    const blueprint=validateBlueprint({version:manifest.minecraftVersion,dimensions:{x:2,y:2,z:2},provenance:'reconstructed',uncertainties:[],blocks:[{x:0,y:0,z:0,name:'stone'},{x:1,y:0,z:0,name:'stone'},{x:0,y:0,z:1,name:'stone'},{x:1,y:0,z:1,name:'stone'},{x:0,y:1,z:0,name:'stone'},{x:1,y:1,z:0,name:'stone'}]});
    const project={id:'vanilla-build',revision:1,approvedRevision:1,blueprint,approvedHash:blueprintHash(blueprint)},origin={x:2,y:-59,z:3};
    await assert.rejects(runtime.runJob('vanilla-build-interrupt',signal=>executeBuild({project,origin,bot,signal,save:current=>{store.put('projects',current);if(current.checkpoint.verified.length===2)runtime.jobController.abort(new Error('Vanilla fixture construction interruption'));}})),/interruption/);
    const checkpoint=structuredClone(store.get('projects')[0]);assert.equal(checkpoint.checkpoint.status,'paused');assert.equal(checkpoint.checkpoint.verified.length,2);
    const result=await runtime.runJob('vanilla-build-resume',signal=>executeBuild({project:checkpoint,origin,bot,signal,save:current=>store.put('projects',current)}));
    assert.equal(result.status,'complete');assert.equal(result.verified,6);
    await until(()=>bot.inventory.items().filter(item=>item.name==='stone').reduce((sum,item)=>sum+item.count,0)===6,'six placement decrements acknowledged through actual inventory packets');
    assert.equal(bot.inventory.items().filter(item=>item.name==='stone').reduce((sum,item)=>sum+item.count,0),6);
    return {interruptedAt:2,...result};
  });
}catch(error){failed=true;evidence.results.push({name:'vanilla integration',status:'failed',error:error.stack});console.error(error.stack);}
finally{
  try{await runtime?.close();}catch(error){line(`Runtime cleanup: ${error.message}`);}
  if(child?.pid&&!exitResult){
    if(!child.killed){try{command('stop');await Promise.race([exitPromise,pause(12_000)]);}catch(error){line(error.message);}}
    if(!exitResult){child.kill();await Promise.race([exitPromise,pause(10_000)]);}
    if(!exitResult){failed=true;evidence.results.push({name:'owned server process cleanup',status:'failed',error:'Owned Java process did not confirm exit after termination.'});}
  }
  store?.close();clearTimeout(watchdog);
  evidence.serverExited=child?.pid?!!exitResult:true;evidence.serverExit=exitResult;evidence.serverLogTail=logs.slice(-50);
  await mkdir(path.join(repo,'.git'),{recursive:true});await writeFile(path.join(repo,'.git','vanilla-gameplay-results.json'),JSON.stringify(evidence,null,2));
  const target=path.resolve(directory);if(target.startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(target).startsWith('companion-vanilla-'))await rm(target,{recursive:true,force:true,maxRetries:5,retryDelay:150});
}
console.log(JSON.stringify(evidence,null,2));
process.exit(failed?1:0);
