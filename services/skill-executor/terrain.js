import pathfinder from 'mineflayer-pathfinder';
import { Vec3 } from 'vec3';

const HAZARDS=/water|lava|fire|magma|cactus|powder_snow|sweet_berry|wither_rose|campfire/;
export function clearFooting(bot,p){
  const feet=bot.blockAt(p),head=bot.blockAt(p.offset(0,1,0)),floor=bot.blockAt(p.offset(0,-1,0));
  return feet&&head&&floor&&feet.boundingBox==='empty'&&head.boundingBox==='empty'&&floor.boundingBox==='block'&&!HAZARDS.test([feet.name,head.name,floor.name].join(' '));
}
export function observedTerrainPath(bot,target){
  if(!bot.pathfinder?.getPathTo||!bot.pathfinder.movements)return false;
  const result=bot.pathfinder.getPathTo(bot.pathfinder.movements,new pathfinder.goals.GoalBlock(target.x,target.y,target.z),80);
  if(result.status!=='success'||result.path.length>128)return false;
  let previous=bot.entity.position.floored();
  return result.path.every(node=>{
    const p=new Vec3(node.x,node.y,node.z).floored();
    const safe=!node.toBreak?.length&&!node.toPlace?.length&&Math.abs(p.y-previous.y)<=1&&clearFooting(bot,p);
    previous=p;return safe;
  });
}
export function terrainFrontiers(bot,anchor,radius,visited=[],toward=null){
  const here=bot.entity.position.floored(),seen=new Set(visited),candidates=[];
  for(const distance of [3,6,9])for(const [dx,dz] of [[1,0],[0,1],[-1,0],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]]){
    for(const dy of [0,1,-1,2,-2,3,-3]){
      const p=here.offset(dx*distance,dy,dz*distance);
      if(p.distanceTo(anchor)>radius||seen.has(p.toString())||!clearFooting(bot,p))continue;
      candidates.push(p);break;
    }
  }
  candidates.sort((a,b)=>toward?a.distanceTo(toward)-b.distanceTo(toward):b.distanceTo(anchor)-a.distanceTo(anchor));
  return candidates.filter(p=>observedTerrainPath(bot,p)).slice(0,8);
}
