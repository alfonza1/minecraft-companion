import {assistedAssignments} from '../resource-ledger/acquisition.js';
import {splitAssignments,reconcileProjectInventory} from '../resource-ledger/index.js';

export function focusedProject(store){
  const projects=store.get('projects'),id=store.get('projectFocus').find(value=>value.id==='current')?.projectId;
  return projects.find(project=>project.id===id)||(projects.length===1?projects[0]:null);
}
export function projectConversation(text,store,world){
  const message=text.trim().toLowerCase().replace(/[.!?]+$/,'');
  const split=/^(?:let'?s |can we |we should |please )?(?:go half(?:s|sies)?|split (?:the )?(?:materials|gathering|resources)(?: (?:in half|50\/50|half and half))?)(?:[ ,]+(?:and )?(?:give me|get me|i'?ll get|i will get) (?:the |all )?(?:hard|difficult)(?: materials| ones| stuff)?)?$/;
  const needs=/^(?:what (?:materials|resources)(?: do we need)?|what do we need (?:for (?:it|the (?:house|build|project))|to build (?:it|that))|how much more do we need)$/;
  const custom=message.match(/^i(?:['’]ll| will) (?:get|gather|handle) (?:all )?(?:the )?(stone|wood)[,.]?\s+you (?:get|gather|handle) (?:all )?(?:the )?(wood|stone)$/);
  if(!split.test(message)&&!needs.test(message)&&!custom)return null;
  const project=focusedProject(store);
  if(!project)return 'Choose a build reference in Build Studio first so I know which project you mean.';
  if(!project.materials)return `We haven’t got a complete blueprint for ${project.name} yet. Choose an inspired design or import a schematic in Build Studio; the video alone doesn’t give us verified material counts.`;
  if(needs.test(message)){
    const rows=project.assignments||[],remaining=rows.map(row=>({...row,missing:Math.max(0,row.total-row.aiProgress-row.userProgress)})).filter(row=>row.missing);
    if(!remaining.length)return 'The material assignments are covered by my observed inventory and your reported contributions. We still need to check that everything is available at the build site.';
    return `For our saved design, we still need ${remaining.slice(0,8).map(row=>`${row.missing} ${row.material.replaceAll('_',' ')}`).join(', ')}${remaining.length>8?`, plus ${remaining.length-8} other materials in Shared tasks`:''}. Counts describe our blueprint, not the original tutorial. Your contributions are based on what you’ve reported.`;
  }
  if(project.status==='designing')return 'Let the design finish first, then we can split its material list.';
  let assignments=assistedAssignments(project.materials.raw,project.assignments),reply;
  if(custom){
    if(custom[1]===custom[2])return 'Pick a different material for each of us—stone for one, wood for the other.';
    const matches=(name,family)=>family==='wood'?/_(?:log|stem)$/.test(name):['stone','cobblestone','cobbled_deepslate'].includes(name);
    assignments=assignments.map(row=>{
      if(!matches(row.material,custom[1])&&!matches(row.material,custom[2]))return row;
      return {...row,...splitAssignments([{name:row.material,quantity:row.total}],matches(row.material,custom[1])?0:100,[row])[0]};
    });reply=`Updated the plan: you handle the ${custom[1]}, I’m assigned the ${custom[2]}. We still need the usual safe gathering prerequisites.`;
  }else{const hard=assignments.filter(row=>row.acquisition.aiPercent===0);reply=`Common materials are split half each. ${hard.length?`I’ve assigned ${hard.slice(0,5).map(row=>row.material.replaceAll('_',' ')).join(', ')}${hard.length>5?' and the other difficult materials':''} to you because I don’t have a tested way to gather them.`:'You can review both shares in Shared tasks.'} Nothing starts until the blueprint is approved.`;}
  store.put('projects',{...project,aiPercent:50,splitStrategy:custom?'custom-voice':'shared-with-player-hard-materials',assignments});
  if(world?.observedAt&&world.inventoryExact!==false)for(const updated of reconcileProjectInventory(store.get('projects'),world.inventory,world.observedAt))store.put('projects',updated);
  return reply;
}
