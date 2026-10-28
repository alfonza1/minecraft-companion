import { RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { CompanionState } from '../../../packages/shared-types';
import { api } from './api';
import { time, type Mutate } from './shared';

type Catalog = { models: { id: string; displayName: string; description: string; isDefault: boolean }[]; defaultModel: string | null; observedAt: string };
export default function CodexModel({ state, mutate }: { state: CompanionState; mutate: Mutate }) {
  const [catalog, setCatalog] = useState<Catalog | null>(null), [loading, setLoading] = useState(true), [saving, setSaving] = useState(false), [error, setError] = useState('');
  const mounted = useRef(true);
  async function load(refresh = false) {
    setLoading(true); setError('');
    try { const result = await api<Catalog>(refresh ? '/codex/models/refresh' : '/codex/models', refresh ? {} : undefined); if (mounted.current) setCatalog(result); }
    catch (error) { if (mounted.current) { setCatalog(null); setError((error as Error).message); } }
    finally { if (mounted.current) setLoading(false); }
  }
  useEffect(() => { mounted.current = true; void load(); return () => { mounted.current = false; }; }, []);
  const selected = state.settings.model || '', active = state.codex?.model?.active, last = state.codex?.model?.last;
  const label = (id: string | null | undefined) => catalog?.models.find(model => model.id === id)?.displayName || id || 'Codex default · not resolved';
  const current = active ? active.model : selected || catalog?.defaultModel;
  const known = !selected || catalog?.models.some(model => model.id === selected);
  async function select(model: string) {
    setSaving(true); setError('');
    try { await mutate('/settings', { model }); }
    catch (error) { setError((error as Error).message); }
    finally { if (mounted.current) setSaving(false); }
  }
  return <div className="codex-model-setting">
    <div className="model-current"><span>{active ? 'Model in use' : 'Selected model'}</span><strong>{loading && !current ? 'Reading Codex model…' : active && !current ? 'Codex default · model ID unavailable' : label(current)}</strong>{current ? <code>{current}</code> : null}</div>
    <label className="field-label">Companion model<select aria-label="Companion model" value={selected} disabled={loading || saving} onChange={event => void select(event.target.value)}>
      <option value="">{catalog?.defaultModel ? `Automatic · ${label(catalog.defaultModel)}` : 'Automatic · Codex default'}</option>
      {selected && !known ? <option value={selected}>{selected} · saved model outside the current catalog</option> : null}
      {catalog?.models.map(model => <option key={model.id} value={model.id}>{model.displayName}{model.isDefault ? ' · default' : ''}</option>)}
    </select></label>
    <p className="note">{saving ? 'Saving model selection…' : active ? `This request keeps ${label(active.model)}. Your selection applies to the next model request.` : 'Saved automatically. Applies to conversation and blueprint requests; gameplay keeps running.'}</p>
    {last ? <p className="note">Last completed request: <strong>{label(last.model)}</strong> · {time(last.at)}</p> : <p className="note">No completed request has reported its model yet.</p>}
    <div className="model-catalog-meta"><small>{catalog ? `Codex catalog · checked ${time(catalog.observedAt)}` : 'Model catalog unavailable'}</small><button className="text-button" disabled={loading || saving} onClick={() => void load(true)}><RefreshCw size={12} />{loading ? 'Reading models…' : 'Refresh models'}</button></div>
    <p className="note">Choices come from the installed Codex service. Account access is confirmed when a request succeeds. Refreshing this list uses no model tokens.</p>
    {error ? <p className="inline-error" role="alert">{error}</p> : null}
  </div>;
}
