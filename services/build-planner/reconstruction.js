import {z} from 'zod';
import {validateBlueprint,BLUEPRINT_LIMITS} from './blueprint.js';
import {dataFor} from '../../packages/minecraft-data/index.js';
const point=z.object({x:z.number().int().min(0).max(127),y:z.number().int().min(0).max(127),z:z.number().int().min(0).max(127)}).strict();
const schema=z.object({version:z.string().max(20),dimensions:z.object({x:z.number().int().min(1).max(128),y:z.number().int().min(1).max(128),z:z.number().int().min(1).max(128)}).strict(),operations:z.array(z.object({mode:z.enum(['fill','erase']),from:point,to:point,name:z.string().regex(/^[a-z][a-z0-9_]*$/).max(80),properties:z.string().max(1000),section:z.string().max(80)}).strict()).min(1).max(1500),uncertainties:z.array(z.string().max(1000)).max(60)}).strict();
export const reconstructionOutputSchema=z.toJSONSchema(schema);delete reconstructionOutputSchema.$schema;
export function reconstructionSchemaFor(version,analysis,notes=''){
  const output=structuredClone(reconstructionOutputSchema);
  const source=JSON.stringify({analysis,notes}).toLowerCase();
  const palette=Object.keys(dataFor(version).blocksByName).filter(name=>!['air','cave_air','void_air'].includes(name)&&(source.includes(name)||source.includes(name.replaceAll('_',' ')))).slice(0,150);
  if(!palette.length)throw new Error('The source analysis needs identifiable vanilla block materials before reconstruction. Add material clarifications or clearer screenshots.');
  output.properties.operations.items.properties.name.enum=['air',...palette];
  return output;
}
export const MAX_RECONSTRUCTION_CELLS=500000;
export function assertSourceDimensions(blueprint,analysis){
  for(const axis of ['x','y','z'])if(analysis.dimensions[axis]!==null&&blueprint.dimensions[axis]!==analysis.dimensions[axis])throw new Error(`Reconstruction changed the reported ${axis.toUpperCase()} dimension. Clarify the source measurement and analyze again; the existing blueprint was preserved.`);
}
export function compareSourceMaterials(materials,analysis){
  return analysis.materialList.map(source=>{
    const placed=materials.craftedItems.find(row=>row.name===source.name),raw=materials.raw.find(row=>row.name===source.name),row=placed||raw;
    return {name:source.name,sourceQuantity:source.quantity,blueprintQuantity:row?.quantity??null,basis:placed?'placement-items':raw?'raw-resources':'unresolved',difference:row&&source.quantity!==null?row.quantity-source.quantity:null};
  });
}
export function expandReconstruction(input,version){
  const design=schema.parse(input);if(design.version!==version)throw new Error('Reconstruction version mismatch.');
  if(design.dimensions.x*design.dimensions.y*design.dimensions.z>BLUEPRINT_LIMITS.volume)throw new Error('Reconstruction volume exceeds the local limit.');
  const blocks=new Map();let visited=0;
  for(const op of design.operations){
    for(const axis of ['x','y','z'])if(op.from[axis]>op.to[axis]||op.to[axis]>=design.dimensions[axis])throw new Error('Reconstruction operation is outside its dimensions.');
    visited+=(op.to.x-op.from.x+1)*(op.to.y-op.from.y+1)*(op.to.z-op.from.z+1);
    if(visited>MAX_RECONSTRUCTION_CELLS)throw new Error('Reconstruction expansion exceeds the processing limit.');
    let properties;try{properties=JSON.parse(op.properties);}catch{throw new Error('Invalid reconstruction block properties.');}
    // Validate each palette/state before expansion, including overwritten entries.
    if(op.mode==='fill')validateBlueprint({version,dimensions:{x:1,y:1,z:1},blocks:[{x:0,y:0,z:0,name:op.name,properties}],provenance:'reconstructed'});
    for(let x=op.from.x;x<=op.to.x;x++)for(let y=op.from.y;y<=op.to.y;y++)for(let z=op.from.z;z<=op.to.z;z++){
      const key=`${x},${y},${z}`;
      if(op.mode==='erase')blocks.delete(key);else blocks.set(key,{x,y,z,name:op.name,properties,section:op.section});
      if(blocks.size>BLUEPRINT_LIMITS.placements)throw new Error('Reconstruction exceeds 50,000 block placements.');
    }
  }
  if(!blocks.size)throw new Error('Reconstruction is empty.');
  return validateBlueprint({version,dimensions:design.dimensions,blocks:[...blocks.values()],provenance:'reconstructed',uncertainties:[...design.uncertainties,'Reconstructed from interpreted source evidence. Hidden blocks and source accuracy require review; exact quantities describe this saved blueprint only.']});
}
export function reconstructionPrompt({analysis,version,notes=''}){
  return `Reconstruct the SAME Minecraft structure in this source analysis for Java ${version}. No tools, shell, files, browsing or inspired replacement. Preserve observed dimensions, palette, shape, roof, openings and interior; never shrink it just to fit. Use literal installed vanilla block IDs from the schema enum, e.g. oak_planks or cobblestone, never placeholders such as minecraft_variant. Use source-correct stairs/slabs/orientations even when the survival executor does not support them; it must report those blockers instead of replacing them. Unknown hidden details may be inferred only with explicit uncertainties. Return bounded box operations with inclusive from/to coordinates, fill (replace prior blueprint cells) or erase (remove cells only from this virtual blueprint; NEVER terrain clearing). Properties are a JSON object encoded as a string. Use air name and {} for erase. Keep operations <=1500, total touched cells <=500000, final placements <=50000, axes <=128 and volume <=262144. Use separate boxes for walls/openings/roof rows and explicit cells for details. Source material lists are checks, not permission to invent unseen placements. If faithful geometry is unresolved, describe all unresolved choices in uncertainties.\n${JSON.stringify({version,analysis,notes})}`;
}
