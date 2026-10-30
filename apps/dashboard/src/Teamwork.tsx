import { useState } from 'react';
import { MapPin, PackageOpen, Play, Save, Shield, Trash2 } from 'lucide-react';
import type { CompanionState } from '../../../packages/shared-types';
import { api } from './api';
import { Panel, type Mutate } from './shared';

type Props = { state: CompanionState; mutate: Mutate };
const coordinates = (p: { x: number; y: number; z: number }) => `${Math.floor(p.x)}, ${Math.floor(p.y)}, ${Math.floor(p.z)}`;

export function SavedWork({ state, mutate }: Props) {
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const frames = state.taskStack?.frames || [], active = ['ACTIVE', 'BUSY'].includes(state.state);
  async function send(route: string, body = {}) { setError(''); setBusy(true); try { await mutate(route, body); } catch (error) { setError((error as Error).message); } finally { setBusy(false); } }
  return <Panel title="Working together" eyebrow="TASK HANDOFFS" action={<Shield size={18} />}>
    <p className="note">Ask for help or assign something else. Your companion saves its work and returns to it when the temporary job succeeds. Stop clears the task stack; pause keeps it.</p>
    <div className="teammate-actions">
      <button className="button" disabled={busy || !active || !state.world || !state.settings.playerName} onClick={() => void send('/teammate/action', { tool: 'rescue_player', args: {} })}><Shield size={14} />Help me</button>
      <button className="button" disabled={busy || !active || !frames.length || !state.taskStack?.held} onClick={() => void send('/teammate/tasks/resume')}><Play size={14} />Resume saved work</button>
    </div>
    {!frames.length ? <p className="quiet-empty">No saved jobs. A temporary request will appear here while the original task waits.</p> : <ol className="saved-work">{[...frames].reverse().map(frame => <li key={frame.id}>
      <div><strong>{frame.label}</strong><small>Step {Math.min(frame.step, frame.steps)} of {frame.steps} · {frame.status}{frame.actions[frame.step - 1]?.args.count ? ` · ${frame.actions[frame.step - 1].args.count} remaining` : ''}</small>{frame.error ? <p className="inline-error">{frame.error}</p> : null}</div>
      <button className="icon-button" aria-label={`Discard saved task ${frame.label}`} disabled={busy || frame.status === 'running' || state.taskStack?.switching} onClick={() => void send('/teammate/tasks/discard', { id: frame.id })}><Trash2 size={14} /></button>
    </li>)}</ol>}
    {error ? <p role="alert" className="inline-error">{error}</p> : null}
  </Panel>;
}

export default function Teamwork({ state, mutate }: Props) {
  const data = state.teammate, active = ['ACTIVE', 'BUSY'].includes(state.state);
  const [error, setError] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false), [name, setName] = useState(''), [source, setSource] = useState('player');
  const [routine, setRoutine] = useState('mining'), [draft, setDraft] = useState<string | null>(null);
  const [chests, setChests] = useState<{ name: string; position: { x: number; y: number; z: number } }[]>([]), [selectedChest, setSelectedChest] = useState(''), [chestName, setChestName] = useState('Supply chest'), [allowed, setAllowed] = useState('bread, torch, stone_pickaxe, stone_axe');
  async function send(route: string, body: unknown, success: string) {
    setError(''); setMessage(''); setBusy(true);
    try { await mutate(route, body); setMessage(success); return true; }
    catch (error) { setError((error as Error).message); return false; }
    finally { setBusy(false); }
  }
  const currentRoutine = data?.routines.find(value => value.id === routine);
  async function saveRoutine() {
    try {
      const supplies = (draft ?? currentRoutine?.supplies.map(value => `${value.name} ${value.count}`).join('\n') ?? '').split('\n').filter(line => line.trim()).map(line => {
        const match = line.trim().match(/^([a-z][a-z0-9_]*)\s+(\d+)$/); if (!match) throw new Error('Use one item and quantity per line, for example torch 32.'); return { name: match[1], count: Number(match[2]) };
      });
      if (await send('/teammate/routines', { id: routine, label: currentRoutine?.label || routine, supplies }, 'Routine saved.')) setDraft(null);
    } catch (error) { setError((error as Error).message); }
  }
  async function scan() { setBusy(true); setError(''); try { const found = await api<typeof chests>('/teammate/nearby-chests'); setChests(found); setSelectedChest(found.length ? '0' : ''); setMessage(found.length ? 'Choose the observed chest to approve.' : 'No chest or barrel within six blocks of the companion.'); } catch (error) { setError((error as Error).message); } finally { setBusy(false); } }
  if (!data) return <Panel title="Teammate tools"><p className="note">Teammate tools are loading. Reopen the app if the backend is updating.</p></Panel>;
  return <>
    <Panel title="Survival work" action={<PackageOpen size={17} />}>
      <label className="check-line"><input type="checkbox" checked={Boolean(data.preferences.busyMode)} disabled={busy} onChange={event=>void send('/teammate/preferences',{busyMode:event.target.checked},'Background work preference saved.')} />Stay productive between my requests</label>
      <label className="check-line"><input type="checkbox" checked={data.preferences.autoDeposit!==false} disabled={busy} onChange={event=>void send('/teammate/preferences',{autoDeposit:event.target.checked},'Loot storage preference saved.')} />Store surplus and valuables after gathering</label>
      <p className="note">{!data.preferences.busyMode?'Automatic work is off.':data.idleWork?.held?'Background work is held after Stop. Resume the companion or enable this setting again.':data.idleWork?.reason||'Background work waits for a connected session.'}</p>
      <p className="note">Keeps food, useful tools, torches, a small building supply and reserved project materials. Never throws surplus away. Deposits need an approved chest; mining needs an approved area. Unsafe conditions and unavailable supplies can leave it waiting. Background decisions use no model requests.</p>
      <p className="note">Food gathering also cooks its catch. Cooking prepares a pickaxe, surface stone, furnace and wood fuel when needed; interrupted owned batches can resume.</p>
      <div className="teammate-actions">{[['find_food','Get food'],['hunt_food','Hunt'],['tend_farm','Tend farm'],['cook_food','Cook'],['store_surplus','Store loot'],['explore_nearby','Explore'],['resume_approved_build','Resume approved build']].map(([tool,label])=><button key={tool} className="button" disabled={busy||!active||!state.world} onClick={()=>void send('/teammate/action',{tool,args:{}},`${label} requested.`)}>{label}</button>)}</div>
      <details className="supply-approval"><summary>Approved work areas</summary>
        <p className="note">Farm approval covers existing farmland within eight blocks of the companion. Only ripe crops are harvested, with seeds held for replanting. Mining approval covers expendable terrain within six blocks; approve it away from your buildings.</p>
        <div className="teammate-actions"><button className="button" disabled={busy||!state.world} onClick={()=>void send('/teammate/farm/approve',{radius:8},'Nearby farm approved.')}>Approve nearby farm</button><button className="button" disabled={busy||!state.world} onClick={()=>{const p=state.world?.position;if(p)void send('/permissions/mining',{zone:{x:Math.floor(p.x),y:Math.floor(p.y),z:Math.floor(p.z),radius:6}},'Nearby mining area approved.');}}>Approve mining area here</button></div>
        {(data.workAreas||[]).map(area=><p className="note" key={area.id}>{area.id} · {coordinates(area.position)} · radius {area.radius} · {area.dimension}{area.id==='farm'?<button className="text-button" onClick={()=>void send('/teammate/farm/revoke',{},'Farm approval removed.')}>Revoke farm</button>:null}</p>)}
      </details>
    </Panel>
    <Panel title="Places & recovery" action={<MapPin size={17} />}>
      <form onSubmit={event => { event.preventDefault(); void send('/teammate/locations/save', { name, source }, `Saved ${name}.`).then(saved => { if (saved) setName(''); }); }}>
        <label className="field-label">Place name<input aria-label="Place name" value={name} onChange={event => setName(event.target.value)} placeholder="Home, the mine, project chest…" maxLength={60} /></label>
        <label className="field-label">Save location of<select aria-label="Location source" value={source} onChange={event => setSource(event.target.value)}><option value="player">You · when currently visible</option><option value="companion">Companion</option></select></label>
        <button className="button" disabled={busy || !name.trim() || !state.world}><Save size={14} />Save place</button>
      </form>
      <div className="teammate-records">{data.locations.length ? data.locations.map(place => <div key={place.id}><div><strong>{place.name}</strong><small>{coordinates(place.position)} · {place.dimension}</small></div><div className="teammate-actions"><button className="text-button" disabled={busy || !active} onClick={() => void send('/teammate/action', { tool: 'visit_location', args: { name: place.name } }, `Going to ${place.name}.`)}>Go</button><button className="icon-button" aria-label={`Delete place ${place.name}`} disabled={busy} onClick={() => void send('/teammate/locations/delete', { id: place.id }, 'Place deleted.')}><Trash2 size={13} /></button></div></div>) : <p className="quiet-empty">No places saved yet.</p>}</div>
      {data.deaths.slice(-1).map(death => <div key={death.id} className="data-management"><h3>Last death · {death.status.replaceAll('-', ' ')}</h3><p>{coordinates(death.position)} · {death.dimension}</p><p className="note">{death.warning}</p><button className="button" disabled={busy || !active || !state.world} onClick={() => void send('/teammate/action', { tool: 'recover_items', args: { deathId: death.id } }, 'Checking recovery conditions. Recoveries report observed pickups, not guaranteed lost items.')}>Recover items at this site</button></div>)}
    </Panel>
    <Panel title="Routines & supplies" action={<PackageOpen size={17} />}>
      <label className="field-label">Routine<select aria-label="Routine" value={routine} onChange={event => { setRoutine(event.target.value); setDraft(null); }}>{data.routines.map(value => <option key={value.id} value={value.id}>{value.label}</option>)}</select></label>
      <label className="field-label">Target supplies<textarea aria-label="Routine supplies" rows={4} spellCheck={false} value={draft ?? currentRoutine?.supplies.map(value => `${value.name} ${value.count}`).join('\n') ?? ''} onChange={event => setDraft(event.target.value)} /></label>
      <p className="note">One Minecraft item and quantity per line. Better tools count toward the target. Tools with fewer than 16 durability points need replacing. Rare materials are excluded from automatic restocking.</p>
      <div className="teammate-actions"><button className="button" disabled={busy} onClick={() => void saveRoutine()}>Save routine</button><button className="button" disabled={busy || !active || !state.world} onClick={() => void send('/teammate/action', { tool: 'prepare_routine', args: { routine } }, 'Checking supplies against the saved routine.')}>Prepare now</button></div>
      <label className="check-line"><input type="checkbox" checked={data.preferences.autoRestock} disabled={busy} onChange={event => void send('/teammate/preferences', { autoRestock: event.target.checked }, 'Restocking preference saved.')} />Restock before new gathering jobs</label>
      <label className="check-line"><input type="checkbox" checked={data.preferences.resumeAfterHelp} disabled={busy} onChange={event => void send('/teammate/preferences', { resumeAfterHelp: event.target.checked }, 'Task resume preference saved.')} />Automatically return to saved work after helping</label>
      <label className="field-label">Teammate updates<select aria-label="Teammate updates" value={data.preferences.updates} disabled={busy} onChange={event => void send('/teammate/preferences', { updates: event.target.value }, 'Update preference saved.')}><option value="quiet">Quiet · danger and blockers</option><option value="useful">Useful · completion, danger and blockers</option><option value="chatty">Social · occasional offers to help</option></select></label>
      <details className="supply-approval"><summary>Approved supply chests · {data.supplies.length}</summary><p className="note">The companion can make its own Home/spawn chests and expand full storage from common wood. For existing shared chests, bring it close, scan, then approve the common items it may take. Loot deposits use approved chests within 32 blocks of Home/Base, or confirmed server spawn when no home is saved. New approvals permit deposits at those locations, including valuables. Existing chests need Deposit loot enabled while the companion is nearby. Withdrawals still respect the item allowlist.</p>
        <button className="button" disabled={busy || !state.world} onClick={() => void scan()}>Scan nearby chests</button>
        {chests.length ? <form onSubmit={event => { event.preventDefault(); const chest = chests[Number(selectedChest)]; if (chest) void send('/teammate/chests/approve', { name: chestName, position: chest.position, allowedItems: allowed.split(',').map(value => value.trim()).filter(Boolean) }, 'Supply chest approved.'); }}>
          <label className="field-label">Observed container<select aria-label="Observed container" value={selectedChest} onChange={event => setSelectedChest(event.target.value)}>{chests.map((chest, index) => <option value={String(index)} key={index}>{chest.name} · {coordinates(chest.position)}</option>)}</select></label>
          <label className="field-label">Chest name<input aria-label="Chest name" value={chestName} maxLength={60} onChange={event => setChestName(event.target.value)} /></label>
          <label className="field-label">Allowed items<input aria-label="Allowed chest items" value={allowed} onChange={event => setAllowed(event.target.value)} /></label>
          <button className="button" disabled={busy || !chestName.trim()}>Approve this supply chest</button>
        </form> : null}
        <div className="teammate-records">{data.supplies.map(chest => <div key={chest.id}><div><strong>{chest.name}</strong><small>{coordinates(chest.position)} · {chest.allowedItems.join(', ')}</small><small>{chest.observedAt ? `Stock last observed ${new Date(chest.observedAt).toLocaleString()}` : 'Contents not yet observed'}</small><label className="check-line"><input type="checkbox" aria-label={`Deposit loot in ${chest.name}`} checked={Boolean(chest.depositAllowed)} disabled={busy} onChange={event=>void send('/teammate/chests/deposit',{id:chest.id,allowed:event.target.checked},'Deposit permission saved.')} />Deposit loot</label></div><button className="text-button danger-text" disabled={busy} onClick={() => void send('/teammate/chests/revoke', { id: chest.id }, 'Chest permission revoked.')}>Revoke</button></div>)}</div>
      </details>
    </Panel>
    {message ? <p role="status" className="note">{message}</p> : null}{error ? <p role="alert" className="inline-error">{error}</p> : null}
  </>;
}
