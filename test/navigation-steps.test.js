import test from 'node:test';
import assert from 'node:assert/strict';
import { Vec3 } from 'vec3';
import pathfinder from 'mineflayer-pathfinder';

test('pinned pathfinder drop setting permits exactly one cardinal stair descent', () => {
  const node=new Vec3(0,2,0), floor=new Vec3(1,0,0);
  const movement={bot:{game:{minY:-64}},maxDropDown:2,getBlock(p,x,y,z){const position=p.offset(x,y,z);return {position,physical:position.y<=floor.y,safe:true,liquid:false};}};
  const land=()=>pathfinder.Movements.prototype.getLandingBlock.call(movement,node,{x:1,z:0});
  assert.equal(land().position.y,1);
  movement.maxDropDown=1;assert.equal(land(),null);
  movement.maxDropDown=2;floor.y=-1;assert.equal(land(),null);
});
