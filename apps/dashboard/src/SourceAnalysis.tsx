import {useEffect,useState} from 'react';
import type {Project} from '../../../packages/shared-types';
import {api} from './api';
import {human,type Common} from './shared';

type VideoProvider={configured:boolean;model:string;pendingJobs:{id:string;status:string}[]};
export default function SourceAnalysis({project,state,mutate,busy}:{project:Project}&Common){
  const [provider,setProvider]=useState<VideoProvider|null>(null),[key,setKey]=useState(''),[error,setError]=useState(''),[working,setWorking]=useState(false),[setupOpen,setSetupOpen]=useState(false);
  const [selected,setSelected]=useState<string[]>([]),[notes,setNotes]=useState(''),[share,setShare]=useState(false),[accept,setAccept]=useState(false);
  const references=(project.references||[]).filter(reference=>['image','video','youtube'].includes(reference.type));
  const chosen=references.filter(reference=>selected.includes(reference.id));
  const youtube=chosen.length===1&&chosen[0].type==='youtube';
  const validSelection=youtube||(chosen.length>0&&chosen.length<=8&&chosen.every(reference=>['image','video'].includes(reference.type))&&chosen.filter(reference=>reference.type==='video').length<=1);
  const report=project.sourceAnalysis,active=['ACTIVE','BUSY'].includes(state.state),pending=working||busy;
  async function refresh(){setProvider(await api('/video-provider'));}
  useEffect(()=>{void refresh().catch(error=>setError((error as Error).message));},[]);
  useEffect(()=>{setSelected(project.selectedReference?[project.selectedReference.referenceId]:[]);setAccept(false);setShare(false);},[project.id,project.selectedReference?.referenceId]);
  useEffect(()=>{setAccept(false);},[report?.id]);
  async function run(work:()=>Promise<unknown>){setWorking(true);setError('');try{await work();}catch(error){setError((error as Error).message);}finally{try{await refresh();}catch(error){setError(previous=>previous||(error as Error).message);}setWorking(false);}}
  return <div className="source-analysis">
    <h3>Analyze the actual source</h3>
    <p className="note">Inspect public YouTube video and audio with Gemini, or uploaded screenshots/video frames with your Codex login. Select only sources you want shared.</p>
    <fieldset disabled={pending}><legend>References to inspect</legend>{references.length?references.map(reference=><label className="analysis-choice" key={reference.id}><input type="checkbox" checked={selected.includes(reference.id)} onChange={event=>setSelected(event.target.checked?[...selected,reference.id]:selected.filter(id=>id!==reference.id))}/><span>{reference.title||reference.filename||human(reference.type)}<small>{human(reference.type)}</small></span></label>):<p className="note">Choose a YouTube result above, paste its URL below, or upload permitted video/screenshots.</p>}</fieldset>
    <label className="field-label">Source clarifications<textarea rows={2} maxLength={2000} value={notes} onChange={event=>setNotes(event.target.value)} placeholder="Which house in the video, useful timestamps, measurements to double-check…"/></label>
    <label className="analysis-choice"><input type="checkbox" checked={share} disabled={pending} onChange={event=>setShare(event.target.checked)}/><span>{youtube?'Send this public video and these notes to Google for analysis. My Google account’s quota and billing settings apply.':'Send the selected uploaded visuals and these notes to Codex for analysis.'}</span></label>
    <button className="button full" disabled={pending||!active||!share||!validSelection||state.settings.lowTokenMode||(youtube&&!provider?.configured)} onClick={()=>void run(()=>mutate(`/projects/${project.id}/analyze`,{provider:youtube?'youtube':'frames',referenceIds:selected,notes,shareMedia:true}))}>{working?'Processing source…':youtube?'Analyze YouTube video':'Analyze uploaded visuals'}</button>
    {chosen.length&&!validSelection?<p className="note">Choose one YouTube video, or up to eight uploaded references with at most one video.</p>:null}
    {!youtube?<p className="note">Uploaded videos use up to 24 sampled frames. Audio and fast construction steps may be missed.</p>:null}
    {state.settings.lowTokenMode?<p className="note">Low token mode disables new media analysis and reconstruction. Turn it off in Settings to analyze this source.</p>:null}
    {youtube&&!provider?.configured?<p className="note">{provider?'Connect a Google AI Studio key in Direct YouTube connection below, or upload permitted source video/screenshots to use your existing Codex login.':'Checking the video connection…'}</p>:null}
    {pending||['analyzing','reconstructing'].includes(project.analysisStatus||'')?<button className="text-button" onClick={()=>void api('/conversation/cancel',{}).catch(error=>setError((error as Error).message))}>Cancel analysis / reconstruction</button>:null}
    {error||project.analysisError?<p className="inline-error" role="alert">{error||project.analysisError}</p>:null}
    <details className="video-provider-setup" open={setupOpen} onToggle={event=>setSetupOpen(event.currentTarget.open)}><summary>Direct YouTube connection · {provider?.configured?'Key saved securely':'Google AI Studio key needed'}</summary>
      <p className="note">For free-tier-only use, choose a Google AI Studio key with billing disabled. The app cannot check your billing tier or enable billing.</p>
      <ol className="note video-setup-steps"><li>Open Google AI Studio using the link below and sign in to your Google account.</li><li>Create an API key for a project without paid billing. You do not need to buy a subscription for eligible free-tier access.</li><li>Paste the key into this app’s password field and select Save video analysis key.</li><li>Select the tutorial, allow analysis, then choose Analyze YouTube video. Review the evidence before reconstruction.</li></ol>
      <details><summary>Privacy, quotas and billing</summary><p className="note">Your Google account’s quota and billing settings apply. Free-tier content may be used by Google to improve its products. Public YouTube input is a preview feature. Temporary background interaction records are deleted after retrieval; failed cleanup is reported. No alternate paid provider runs.</p></details>
      <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">Open Google AI Studio key setup</a>
      <label className="field-label">Google AI Studio API key<input type="password" autoComplete="off" value={key} onChange={event=>setKey(event.target.value)} placeholder="Saved encrypted for this Windows user; never shown in settings exports"/></label>
      <button className="button" disabled={pending||key.trim().length<20} onClick={()=>void run(async()=>{await api('/video-provider',{key:key.trim()});setKey('');setSetupOpen(false);})}>Save video analysis key</button>
      {provider?.configured?<button className="text-button" disabled={pending||Boolean(provider.pendingJobs.length)} onClick={()=>void run(()=>api('/video-provider/forget',{}))}>Forget key</button>:null}
      {provider?.pendingJobs.length?<><p className="inline-error">Remote cleanup needs attention: {provider.pendingJobs.map(job=>`${job.id} (${job.status})`).join(', ')}.</p><button className="button" disabled={pending} onClick={()=>void run(()=>api('/video-provider/cleanup',{}))}>Retry remote cancellation and cleanup</button></>:null}
    </details>
    {report?<div className="source-report"><strong>{report.sourceAccessible?'Source analysis':'Source unavailable'} · {report.provider} / {report.model}</strong><p>{report.summary}</p><p className="note">{report.coverage} This is a model interpretation; source counts and measurements are not independently verified.</p>
      <p className="note">Reported dimensions: {(['x','y','z'] as const).map(axis=>`${axis.toUpperCase()} ${report.dimensions[axis]??'unknown'}`).join(' · ')}</p>
      <details><summary>Measurements, palette and tutorial evidence ({report.observations.length})</summary>{report.observations.map((observation:any,index:number)=><p className="note" key={index}><strong>{observation.timestamp||'No timestamp'} · {observation.evidence}</strong> — {observation.detail}</p>)}</details>
      {report.materialList.length?<details><summary>Source-reported material list</summary><p className="note">These quantities may include extras or scaffolding. They are separate from the reconstructed blueprint bill of materials.</p>{report.materialList.map((material:any,index:number)=><p className="note" key={index}>{human(material.name)}: {material.quantity??'unknown'} · {material.basis} · {material.timestamp}</p>)}</details>:null}
      {project.reconstruction?.analysisId===report.id&&project.reconstruction.materialComparison?.length?<details><summary>Compare source quantities with this blueprint</summary>{project.reconstruction.materialComparison.map(material=><p className="note" key={material.name}>{human(material.name)} · Source {material.sourceQuantity??'unknown'} · Blueprint {material.blueprintQuantity??'unresolved'} ({material.basis}){material.difference?` · Difference ${material.difference>0?'+':''}${material.difference}`:''}</p>)}<p className="note">Differences can mean source extras, missed details or reconstruction mistakes. Review these before approving construction.</p></details>:null}
      {report.uncertainties.length?<div className="info-note gold"><div><strong>Needs review</strong>{report.uncertainties.map((detail:string,index:number)=><p key={index}>{detail}</p>)}</div></div>:null}
      <label className="analysis-choice"><input type="checkbox" checked={accept} disabled={pending} onChange={event=>setAccept(event.target.checked)}/><span>I reviewed the evidence and unresolved details. Reconstruct this structure, preserving its dimensions and materials; label any inferred hidden details.</span></label>
      <button className="button full" disabled={pending||!active||!accept||!report.sourceAccessible||state.settings.lowTokenMode} onClick={()=>void run(()=>mutate(`/projects/${project.id}/reconstruct`,{analysisId:report.id,notes,acceptUncertainty:true}))}>Reconstruct this build + calculate materials</button>
      <p className="note">Codex preserves the source palette, including blocks the builder cannot place yet. The preview approximates special shapes as cubes. Review construction blockers and source/count differences before approval. A complete schematic remains the strongest source for exact reproduction.</p>
    </div>:null}
  </div>;
}
