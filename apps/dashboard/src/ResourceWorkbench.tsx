import { useState } from 'react';
import { ArrowRight, Boxes, Check, Hammer, Search, Users } from 'lucide-react';
import type { WorkspaceResource } from '../../../packages/game-adapters';
import { human, ItemIcon, type Common } from './shared';
import './resource-workbench.css';

type MaterialKind = WorkspaceResource['kind'];
type Ingredient = { name: string; quantity: number };
type ProductionStep = {
  name: string; required: number; batches: number; yield: number; produced: number;
  surplus: number; ingredients: Ingredient[]; method: string;
  requiresCraftingTable?: boolean; requiresFurnace?: boolean; requiresStonecutter?: boolean;
};
const count = (value: number | null) => value === null ? 'Unknown' : value.toLocaleString();
const observed = (value: string | null | undefined) => value ? new Date(value).toLocaleString() : 'Not observed';
const covered = (row: WorkspaceResource) => Math.min(row.required, row.verifiedPlaced + (row.availableForProject ?? 0));
const status = (row: WorkspaceResource) => row.remainingToPlace === 0 ? 'Built' : row.gathering ? 'Gathering' : row.missing === null ? 'Stock unknown' : row.missing > 0 ? 'Needed' : 'Stock ready';

function matchesFilter(row: WorkspaceResource, filter: string) {
  if (filter === 'needed') return row.missing === null || row.missing > 0;
  if (filter === 'gathering') return row.gathering;
  if (filter === 'completed') return row.remainingToPlace === 0 || row.missing === 0;
  if (filter === 'player') return row.userAssigned > 0;
  if (filter === 'companion') return row.agentAssigned > 0;
  return true;
}

function Quantity({ value, stackSize }: { value: number; stackSize?: number }) {
  return <><strong>{count(value)}</strong>{stackSize && value > 0 ? <small>{Math.floor(value / stackSize)} stacks + {value % stackSize} · {stackSize} per stack</small> : null}</>;
}

function Coverage({ row }: { row: WorkspaceResource }) {
  const total = Math.max(1, row.required);
  const built = Math.min(row.required, row.verifiedPlaced);
  const stock = Math.min(Math.max(0, row.required - built), row.availableForProject ?? 0);
  return <div className="rw-coverage">
    <div className="rw-coverage-caption"><span>Accounted for</span><strong>{count(built + stock)} <span>/ {count(row.required)}</span></strong></div>
    <div className="rw-ruler" role="img" aria-label={`${built} covered by construction, ${row.availableForProject === null ? 'inventory unknown' : `${stock} allocated from inventory`}, ${row.required} required`}>
      <span className="rw-built-segment" style={{ width: `${built / total * 100}%` }} />
      <span className="rw-stock-segment" style={{ width: `${stock / total * 100}%` }} />
    </div>
    <div className="rw-ruler-key"><span><i className="rw-built-segment" />Construction {count(built)}</span><span><i className="rw-stock-segment" />Allocated stock {count(row.availableForProject)}</span></div>
    <p>{row.kind === 'raw' ? 'Construction covers recipe-derived demand. It does not identify who gathered the ingredients.' : 'Verified placements stay accounted for after their materials leave the inventory.'}{row.availableForProject === null ? ' Current inventory is unverified; only the construction checkpoint is shown.' : ''}</p>
  </div>;
}

export default function ResourceWorkbench({ state, onOpenStudio }: Common & { onOpenStudio?: () => void }) {
  const [kind, setKind] = useState<MaterialKind>('raw');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('missing');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const resources = state.workspace?.resources || [];
  const materialRows = resources.filter(row => row.kind === kind);
  const rows = materialRows.filter(row => `${human(row.name)} ${row.projectName}`.toLowerCase().includes(query.trim().toLowerCase()) && matchesFilter(row, filter)).sort((a, b) => {
    if (sort === 'name') return a.name.localeCompare(b.name) || a.projectName.localeCompare(b.projectName);
    if (sort === 'progress') return covered(b) / Math.max(1, b.required) - covered(a) / Math.max(1, a.required);
    if (a.missing === null || b.missing === null) return a.missing === b.missing ? a.name.localeCompare(b.name) : a.missing === null ? -1 : 1;
    return b.missing - a.missing || a.name.localeCompare(b.name);
  });
  const selected = rows.find(row => row.id === selectedId) || rows[0];
  const project = selected ? state.projects.find(value => value.id === selected.projectId) : undefined;
  const plan = project?.materials;
  const stackSize = (kind === 'raw' ? plan?.raw : plan?.craftedItems)?.find((item: { name: string; stackSize?: number }) => item.name === selected?.name)?.stackSize;
  const steps: ProductionStep[] = (plan?.steps || []).filter((step: ProductionStep) => step.name === selected?.name || step.ingredients.some(item => item.name === selected?.name));
  const issues: string[] = plan?.unresolved || [];
  const changeKind = (next: MaterialKind) => {
    setKind(next);
    setSelectedId(resources.find(row => row.kind === next && row.projectId === selected?.projectId && row.name === selected?.name)?.id || null);
  };
  const resetFilters = () => { setQuery(''); setFilter('all'); };

  return <section className="rw-workbench" aria-label="Material workbench">
    <header className="rw-heading"><div><span className="rw-kicker">Supplies for the next adventure</span><h2>Put the plan on the table.</h2><p>See what you have, what is missing, and who is bringing it.</p></div><span className="rw-observation">{state.workspace?.session.connected && !state.workspace.session.stale && state.world?.inventoryExact !== false ? 'Inventory observed' : 'Awaiting verified inventory'}<small>{observed(state.workspace?.session.observedAt)}</small></span></header>
    <div className="rw-view-switch" role="group" aria-label="Resource accounting view"><button type="button" aria-pressed={kind === 'raw'} onClick={() => changeKind('raw')}><Boxes size={17} />Raw gathering plan</button><button type="button" aria-pressed={kind === 'placement'} onClick={() => changeKind('placement')}><Hammer size={17} />Finished building items</button><p>Two views of one design. Ingredients and their crafted products are never added together.</p></div>

    {!materialRows.length ? <div className="rw-empty-plan"><div className="rw-empty-symbol"><Boxes size={42} strokeWidth={1.3} /></div><div><span className="rw-kicker">A plan comes first</span><h3>Your next build starts here.</h3><p>Create or import a blueprint in Build Studio. Its actual material plan will fill this workbench, ready for you to split with your companion.</p>{onOpenStudio ? <button type="button" className="rw-primary" onClick={onOpenStudio}>Open Build Studio <ArrowRight size={17} /></button> : null}</div></div> : <>
      <div className="rw-tools"><label className="rw-search"><Search size={17} /><input aria-label="Search resources" placeholder="Find a material or project…" value={query} onChange={event => setQuery(event.target.value)} /></label><label>Show<select aria-label="Filter resources" value={filter} onChange={event => setFilter(event.target.value)}><option value="all">All resources</option><option value="needed">Needed</option><option value="gathering">Gathering</option><option value="completed">Accounted for</option><option value="player">Assigned to you</option><option value="companion">Assigned to companion</option></select></label><label>Sort<select aria-label="Sort resources" value={sort} onChange={event => setSort(event.target.value)}><option value="missing">Amount missing</option><option value="progress">Accounted for</option><option value="name">Name</option></select></label></div>
      <div className="rw-desk">
        <section className="rw-shelf" aria-label="Project materials"><div className="rw-shelf-caption"><span>Material shelf</span><span>{rows.length} of {materialRows.length}</span></div>
          {rows.length ? <ul>{rows.map(row => <li key={row.id}><button type="button" className={`rw-material ${selected?.id === row.id ? 'rw-selected' : ''}`} aria-pressed={selected?.id === row.id} onClick={() => setSelectedId(row.id)}><span className="rw-item"><ItemIcon name={row.name} /></span><span className="rw-material-name"><strong>{human(row.name)}</strong><small>{row.projectName}</small><span className={`rw-material-status ${row.gathering ? 'rw-is-gathering' : ''}`}>{status(row)}</span></span><span className="rw-material-count"><strong>{count(row.inventory)}</strong><small>carried / {count(row.required)} needed</small><span className="rw-mini-track" aria-hidden="true"><span style={{ width: `${covered(row) / Math.max(1, row.required) * 100}%` }} /></span></span></button></li>)}</ul> : <div className="rw-no-match"><Search size={24} /><h3>No matching materials.</h3><p>Try another name or show all resources.</p><button type="button" onClick={resetFilters}>Clear filters</button></div>}
        </section>

        {selected ? <article className="rw-inspector" aria-label={`${human(selected.name)} accounting`}>
          <header className="rw-item-heading"><div className="rw-featured-item"><ItemIcon key={selected.name} name={selected.name} /></div><div><span className="rw-kicker">{project?.name || selected.projectName}</span><h3>{human(selected.name)}</h3><span className="rw-item-status">{selected.remainingToPlace === 0 ? <Check size={15} /> : null}{status(selected)} · {human(selected.difficulty)}</span></div><div className="rw-required"><Quantity value={selected.required} stackSize={stackSize} /><span>{kind === 'raw' ? 'raw ingredients required' : 'building items required'}</span></div></header>
          <Coverage row={selected} />

          <div className="rw-accounting-columns"><section><h4>Where the supplies are</h4><dl className="rw-ledger"><div><dt>In companion inventory</dt><dd>{count(selected.inventory)}</dd></div><div><dt>Available to this project</dt><dd>{count(selected.availableForProject)}</dd></div><div><dt>Reserved for other projects</dt><dd>{count(selected.reservedElsewhere)}</dd></div><div className="rw-deficit"><dt>Still missing from carried stock</dt><dd>{count(selected.missing)}</dd></div></dl><p>Available stock is allocated once across projects. Counts above never include storage snapshots or promised supplies.</p></section>
          <section className="rw-responsibility"><h4><Users size={16} />Who is bringing it</h4><dl className="rw-owners"><div><dt>You<span>Player assignment</span></dt><dd>{count(selected.userAssigned)}<small>{count(selected.userReported)} manually reported</small></dd></div><div><dt>{state.workspace?.companion.name || 'Companion'}<span>Companion assignment</span></dt><dd>{count(selected.agentAssigned)}<small>{count(selected.agentAllocated)} last reconciled allocation</small></dd></div></dl><p>Reported progress is unverified. Construction credit belongs to the project and is not attributed to either player.</p></section></div>

          <aside className="rw-storage"><Boxes size={19} /><div><strong>{count(selected.storage)} in tracked storage</strong><p>Last checked: {observed(selected.storageObservedAt)}. These historical contents may have changed and are not counted as available stock.</p></div></aside>
          <section className="rw-acquisition"><span className="rw-kicker">Getting this material</span><p>{selected.reason}</p></section>

          <details className="rw-production" key={`${selected.id}:production`}><summary>Recipes & accounting details<span>{steps.length ? `${steps.length} related production ${steps.length === 1 ? 'step' : 'steps'}` : 'Provenance and prerequisites'}</span></summary><div className="rw-production-body"><p><strong>{selected.source === 'exact-blueprint' ? 'Exact saved-design count' : selected.source === 'recipe-derived-raw' ? 'Recipe-derived ingredient plan' : human(selected.source)}</strong> · Minecraft {plan?.recipeVersion || project?.version || 'version unresolved'}</p><p>{plan?.basis || 'Counts describe the saved blueprint, not unseen blocks in a reference.'}</p>{project?.blueprint?.provenance === 'estimated' ? <p className="rw-caution">This design is estimated. Raw recipe quantities reflect the current design and do not verify the source reference.</p> : null}
            {steps.length ? <ol className="rw-recipes">{steps.map((step, index) => <li key={`${step.name}:${index}`}><div><strong>{human(step.method)} · {human(step.name)}</strong><span>{step.batches} batches × {step.yield} yield = {step.produced} items</span></div><p>{step.ingredients.map(item => `${count(item.quantity)} ${human(item.name)}`).join(' + ')} <ArrowRight size={13} aria-hidden="true" /> {count(step.produced)} {human(step.name)}</p><small>{count(step.required)} needed · {count(step.surplus)} surplus{step.requiresCraftingTable ? ' · Crafting table required' : ''}{step.requiresFurnace ? ' · Furnace required' : ''}{step.requiresStonecutter ? ' · Stonecutter required' : ''}</small></li>)}</ol> : <p>No production conversion involving this material is listed in the saved plan. Use the acquisition guidance above.</p>}
            {issues.length ? <div className="rw-prerequisites"><h4>Unresolved project prerequisites</h4><ul>{issues.map((issue, index) => <li key={index}>{issue}</li>)}</ul></div> : null}
            <p>{plan?.strategy || 'Temporary scaffolding and contingency supplies are separate from permanent building materials.'}</p><p>Inventory observed: {observed(state.workspace?.session.observedAt)}. Construction verified: {observed(project?.checkpoint?.updatedAt)}. Checkpoints describe the last inspection, not unseen changes since then.</p>
          </div></details>
          {onOpenStudio ? <button type="button" className="rw-open-plan" onClick={onOpenStudio}>Open Build Studio to revise the plan <ArrowRight size={15} /></button> : null}
        </article> : <div className="rw-filter-note"><p>The material inspector will return when a resource matches your filters.</p></div>}
      </div>
    </>}
  </section>;
}
