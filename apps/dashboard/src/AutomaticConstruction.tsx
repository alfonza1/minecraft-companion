import { useEffect, useState } from 'react';
import type { Project } from '../../../packages/shared-types';
import { attempt, human, type Common } from './shared';

export default function AutomaticConstruction({ project, origin, state, mutate, busy, onReadyChange }: Common & { project: Project; origin: { x: number; y: number; z: number }; onReadyChange: (ready: boolean) => void }) {
  const saved = project.construction;
  const [policy, setPolicy] = useState(saved?.policy ?? { scaffolding: true, gatherMaterials: true, takeOverShares: true, scaffoldMaterial: 'dirt' });
  const outstanding = saved?.scaffolds?.filter((entry: any) => ['intent', 'placed', 'uncertain'].includes(entry.status)) ?? [];
  const idle = state.state === 'ACTIVE';
  const atSite = saved && ['x', 'y', 'z'].every(axis => saved.origin[axis] === origin[axis as keyof typeof origin]);
  const matchesPolicy = saved && Object.keys(policy).every(key => saved.policy[key] === policy[key]);
  useEffect(() => { onReadyChange(Boolean(atSite && matchesPolicy)); }, [atSite, matchesPolicy, onReadyChange]);
  const locked = outstanding.length > 0 || busy || state.state === 'BUSY';
  const ready = project.approvedRevision === project.revision;
  const change = (key: string, value: unknown) => { onReadyChange(false); setPolicy({ ...policy, [key]: value }); };
  const boundary = saved?.scaffolds?.length ? ['x', 'y', 'z'].map(axis => `${axis.toUpperCase()} ${Math.min(...saved.scaffolds.map((entry: any) => entry.position[axis]))}–${Math.max(...saved.scaffolds.map((entry: any) => entry.position[axis]))}`).join(' · ') : null;
  return <div className="info-note" style={{ display: 'block' }}>
    <strong>Automatic worksite</strong>
    <p className="note">Prepare this once after choosing the build coordinates. Starting construction approves the saved worksite plan.</p>
    <label className="toggle-row"><span>Build and remove temporary scaffolding</span><input type="checkbox" checked={policy.scaffolding} disabled={locked} onChange={event => change('scaffolding', event.target.checked)} /></label>
    {policy.scaffolding ? <label>Temporary block material<select value={policy.scaffoldMaterial} disabled={locked} onChange={event => change('scaffoldMaterial', event.target.value)}><option value="dirt">Dirt</option><option value="cobblestone">Cobblestone</option></select></label> : null}
    <label className="toggle-row"><span>Gather missing common raw materials</span><input type="checkbox" checked={policy.gatherMaterials} disabled={locked} onChange={event => change('gatherMaterials', event.target.checked)} /></label>
    {policy.gatherMaterials ? <><label className="toggle-row"><span>Cover my remaining common-material share too</span><input type="checkbox" checked={policy.takeOverShares} disabled={locked} onChange={event => change('takeOverShares', event.target.checked)} /></label><p className="note">Oak, spruce and birch trees; cobblestone, dirt and sand from an approved mining area. Sources must be safely observed within 64 blocks. Set the mining area in Companion once. Furnace production, rare resources and unsupported materials still need supplies. Temporary blocks and the workbench are separate from our material split.</p></> : null}
    <button className="button full" disabled={locked || !idle || !ready} onClick={() => attempt(mutate(`/projects/${project.id}/construction-plan`, { origin, policy }))}>Prepare automatic worksite</button>
    {!ready ? <p className="note">Approve the blueprint first.</p> : !idle && !locked ? <p className="note">Connect and resume the companion near this site to inspect it.</p> : null}
    {saved ? <>
      <p className="note"><strong>{atSite && matchesPolicy ? 'Saved worksite plan' : 'Options or coordinates changed — prepare a new plan'}</strong><br />{saved.scaffolds.length} temporary {human(saved.policy.scaffoldMaterial)} blocks · {outstanding.length} currently recorded at the site{saved.workbench ? ' · Workbench: 4 extra planks, left at the site' : ''}</p>
      {boundary ? <p className="note">Temporary-block boundary: {boundary}. Empty spaces only; no terrain clearing. Maximum 32 × 16 × 32 build and 512 temporary blocks.</p> : null}
      {saved.phase !== 'prepared' ? <p className="note">Current phase: {human(saved.phase)}</p> : null}
      {Object.keys(saved.gathered ?? {}).length ? <p className="note">Confirmed construction pickups: {Object.entries(saved.gathered).map(([name, count]) => `${count} ${human(name)}`).join(', ')}. These are historical pickups, not current inventory.</p> : null}
      {Object.keys(saved.supportGathered ?? {}).length ? <p className="note">Extra worksite pickups: {Object.entries(saved.supportGathered).map(([name, count]) => `${count} ${human(name)}`).join(', ')}.</p> : null}
      {outstanding.length ? <><button className="button full" disabled={!idle || busy} onClick={() => attempt(mutate(`/projects/${project.id}/build`, { origin: saved.origin, cleanupOnly: true }))}>Clean up recorded scaffolds</button><p className="note">Pause/stop preserves the plan. Clean up before replacing the design. Changed or unconfirmed blocks are never removed automatically.</p></> : null}
    </> : null}
  </div>;
}
