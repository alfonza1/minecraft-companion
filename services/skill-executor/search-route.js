import { Vec3 } from 'vec3';

export const SEARCH_LIMITS = Object.freeze({ radius:256, steps:48, outwardMs:240000, totalMs:600000, actionMs:660000, segmentMs:15000, food:8, daylightMargin:1200, breadcrumbSpacing:2,homeArrivalRadius:8 });
export const point = p => ({ x:p.x, y:p.y, z:p.z });
export const vector = p => new Vec3(p.x,p.y,p.z);
const HAZARDS = /water|lava|fire|magma|cactus|powder_snow|sweet_berry|wither_rose|campfire/;

export function safeSearchCell(bot, p) {
  const blocks=[bot.blockAt(p),bot.blockAt(p.offset(0,1,0)),bot.blockAt(p.offset(0,-1,0))];
  const floor=blocks[2];
  const fullFloor=!floor?.shapes || floor.shapes.some(shape=>shape.join(',')==='0,0,0,1,1,1');
  return blocks.every(Boolean) && blocks[0].boundingBox==='empty' && blocks[1].boundingBox==='empty' && floor.boundingBox==='block' && fullFloor && !blocks.some(block=>HAZARDS.test(block.name));
}
export function safeSearchSegment(bot, from, to) {
  const a=vector(from).floored(),b=vector(to).floored();
  if(a.y!==b.y || a.distanceTo(b)>64)return false;
  const steps=Math.max(1,Math.ceil(a.distanceTo(b)*2));
  for(let i=0;i<=steps;i++) {
    const p=new Vec3(Math.floor(a.x+(b.x-a.x)*i/steps),a.y,Math.floor(a.z+(b.z-a.z)*i/steps));
    if(!safeSearchCell(bot,p))return false;
    // Check both sides of diagonal crossings, rather than cutting a corner
    // beside an unseen hole or liquid.
    if(a.x!==b.x&&a.z!==b.z&&(!safeSearchCell(bot,p.offset(1,0,0))||!safeSearchCell(bot,p.offset(0,0,1))))return false;
  }
  return true;
}
export function routeDistance(route, position) {
  let distance=0,cursor=vector(position);
  for(const p of [...route].reverse()){distance+=cursor.distanceTo(vector(p));cursor=vector(p);}
  return distance;
}
