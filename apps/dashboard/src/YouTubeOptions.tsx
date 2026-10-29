import {useState} from 'react';
import {ExternalLink,Search,Check} from 'lucide-react';
import {Panel,type Common} from './shared';

export default function YouTubeOptions({state,mutate,busy,projectId,version,onChoose}:{projectId?:string;version:string;onChoose:(id:string)=>void}&Common){
  const [query,setQuery]=useState('Minecraft natural medieval cottage survival house tutorial'),[pending,setPending]=useState(false),[error,setError]=useState('');
  const searches=state.referenceSearches||[],search=searches.at(-1);
  const enabled=['ACTIVE','BUSY'].includes(state.state);
  async function run(action:()=>Promise<void>){setPending(true);setError('');try{await action();}catch(error){setError((error as Error).message);}finally{setPending(false);}}
  async function choose(referenceId:string,title:string){
    let id=projectId;
    if(!id){const project=await mutate('/projects',{name:title.slice(0,100),version});id=project.id;}
    await mutate(`/projects/${id}/reference-choice`,{searchId:search!.id,referenceId});onChoose(id!);
  }
  return <Panel title="Find your next build" eyebrow="YOUTUBE REFERENCES">
    <form className="youtube-search" onSubmit={event=>{event.preventDefault();void run(async()=>{await mutate('/references/search',{query});});}}>
      <label className="field-label">What should we find?<input value={query} maxLength={500} onChange={event=>setQuery(event.target.value)} placeholder="A cottage, treehouse, bridge, or something else…"/></label>
      <button className="button" disabled={busy||pending||!enabled||query.trim().length<3}><Search size={15}/>{pending?'Working…':'Find on YouTube'}</button>
    </form>
    <p className="note">Your saved style preferences guide suggestions: natural, medieval and cottagecore by default. Search uses Codex live web search and public YouTube metadata. Videos stay on YouTube. Only the search and building-style preferences are sent.</p>
    {!enabled?<p className="note">Start the companion or use planning mode to search. No Realm connection is needed for planning.</p>:null}
    {error?<p className="inline-error" role="alert">{error}</p>:null}
    {search?<><p className="note">Results for “{search.query}” · {new Date(search.at).toLocaleString()}</p><div className="youtube-options">{search.videos.map(video=><article className="youtube-option" key={video.id}>
      <a className="youtube-thumbnail" href={video.url} target="_blank" rel="noreferrer" aria-label={`Watch ${video.title}`}><span aria-hidden="true">▶ YouTube</span><img src={video.thumbnail} alt="" loading="lazy" referrerPolicy="no-referrer" onError={event=>{event.currentTarget.style.display='none';}}/></a>
      <div><h3>{video.title}</h3><small>{video.author}</small><p>{video.reason}</p>
      <div className="youtube-actions"><a className="button" href={video.url} target="_blank" rel="noreferrer"><ExternalLink size={14}/>Watch tutorial</a><button className="button" disabled={busy||pending||!version} onClick={()=>void run(()=>choose(video.id,video.title))}><Check size={14}/>Choose reference</button></div></div>
    </article>)}</div><p className="note">These are verified public video links, not analyzed tutorials. Choose one, then generate an inspired blueprint or import its authorized schematic for exact source counts.</p></>:<p className="quiet-empty">Search here or say “Find medieval house options on YouTube.” Your choices appear here.</p>}
  </Panel>;
}
