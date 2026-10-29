import {useState} from 'react';
import type {Project} from '../../../packages/shared-types';
import {attempt,type Common} from './shared';

export default function SelectedReference({project,state,mutate,busy}:{project:Project}&Common){
  const [notes,setNotes]=useState('');
  const reference=project.selectedReference;
  if(!reference)return null;
  function design(){
    return mutate(`/projects/${project.id}/design`,{
      description:`Create a small coherent survival structure inspired by this reference title and reason: ${reference.title}. ${reference.reason}. Prefer natural medieval and cottagecore materials. User changes: ${notes||'A compact complete version of the type of structure in this reference, with a usable interior where appropriate.'}. The video was not watched. Do not claim an exact tutorial recreation. Use full cubes and glass so the current survival placement controller can build it.`,
      includeReferences:true,selectedReferenceOnly:true,assistedSplit:true,
    });
  }
  return <div className="selected-reference">
    <strong>Chosen reference: {reference.title}</strong>
    <p className="note">Generate a small inspired interpretation from the title and your notes. The video’s dimensions, hidden blocks and original material list remain unknown. This does not watch or copy the tutorial. Only this selected public reference and these notes are sent to the work model.</p>
    <label className="field-label">Design changes or dimensions<textarea value={notes} onChange={event=>setNotes(event.target.value)} rows={3} maxLength={2000} placeholder="Small 9 × 9 footprint, mossy stone foundation, oak walls, steep roof…"/></label>
    <button className="button full" disabled={busy||state.settings.lowTokenMode||project.status==='designing'||!['ACTIVE','BUSY'].includes(state.state)} onClick={()=>attempt(design())}>Generate inspired design + shared plan</button>
  </div>;
}
