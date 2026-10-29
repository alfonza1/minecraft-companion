import { RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { CompanionState } from '../../../packages/shared-types';
import { MODEL_PROVIDERS, modelSelection, type ModelProvider } from '../../../packages/shared-types/providers';
import { api } from './api';
import { time, type Mutate } from './shared';

type Catalog = { models: { id: string; displayName: string; description: string; isDefault: boolean }[]; defaultModel: string | null; observedAt: string };
export default function ModelSettings({ state, mutate }: { state: CompanionState; mutate: Mutate }) {
  const { provider, model: selected } = modelSelection(state.settings);
  const [catalog, setCatalog] = useState<Catalog | null>(null), [loadedProvider, setLoadedProvider] = useState('');
  const [loading, setLoading] = useState(true), [saving, setSaving] = useState(false), [error, setError] = useState(''), [search, setSearch] = useState(''), [loginNote, setLoginNote] = useState('');
  const generation = useRef(0);
  async function load(refresh = false) {
    const current = ++generation.current; setLoading(true); setError('');
    try {
      const result = await api<Catalog>(`/ai/${provider}/models${refresh ? '/refresh' : ''}`, refresh ? {} : undefined);
      if (current === generation.current) { setCatalog(result); setLoadedProvider(provider); }
    } catch (error) { if (current === generation.current) { setCatalog(null); setLoadedProvider(provider); setError((error as Error).message); } }
    finally { if (current === generation.current) setLoading(false); }
  }
  useEffect(() => { setSearch(''); setLoginNote(''); void load(); return () => { generation.current++; }; }, [provider]);
  const visibleCatalog = loadedProvider === provider ? catalog : null;
  const metadata = provider === 'codex' ? state.codex : state.ai;
  const active = state.ai?.modelState?.active || state.codex?.model?.active, last = state.ai?.modelState?.last || state.codex?.model?.last;
  const owner = (value?: string) => MODEL_PROVIDERS[(value || 'codex') as ModelProvider] || value;
  const label = (id?: string | null, source = provider) => (source === provider ? visibleCatalog?.models.find(model => model.id === id)?.displayName : null) || id || `${owner(source)} default · not resolved`;
  const current = active ? active.model : selected || visibleCatalog?.defaultModel;
  const known = !selected || visibleCatalog?.models.some(model => model.id === selected);
  const choices = visibleCatalog?.models.filter(model => model.id === selected || `${model.displayName} ${model.id}`.toLowerCase().includes(search.toLowerCase())) || [];
  async function save(patch: unknown) {
    setSaving(true); setError('');
    try { await mutate('/settings', patch); } catch (error) { setError((error as Error).message); }
    finally { setSaving(false); }
  }
  async function login() {
    setSaving(true); setError('');
    try { await api('/ai/claude/login', {}); setLoginNote('Finish Claude Code sign-in in your browser, then click Refresh models. Your browser may come to the foreground.'); }
    catch (error) { setError((error as Error).message); } finally { setSaving(false); }
  }
  return <div className="codex-model-setting">
    <label className="field-label">Model provider<select aria-label="Model provider" value={provider} disabled={saving} onChange={event => void save({ provider: event.target.value })}>{Object.entries(MODEL_PROVIDERS).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
    <div className="codex-identity"><span>{metadata?.authenticated === true ? `${owner(provider)} signed in` : metadata?.authenticated === false ? `${owner(provider)} sign-in needed` : metadata?.available === true ? `${owner(provider)} configured · access unverified` : `Checking ${owner(provider)}`}</span><span className="note">{metadata?.version || metadata?.error || 'Metadata checks use no model requests.'}</span></div>
    {provider === 'claude' ? <><p className="note">Uses your Claude Code subscription login through the installed CLI. No API-key fallback. Sign-in and model access are handled by Claude Code.</p><button className="button" disabled={saving} onClick={() => void login()}>Sign in to Claude Code</button>{loginNote ? <p className="note" role="status">{loginNote}</p> : null}</> : null}
    <div className="model-current"><span>{active ? `Model in use · ${owner(active.provider)}` : 'Selected model'}</span><strong>{loading && !current ? 'Reading model…' : label(current, active ? (active.provider || 'codex') as ModelProvider : provider)}</strong>{current ? <code>{current}</code> : null}</div>
    {visibleCatalog && visibleCatalog.models.length > 20 ? <label className="field-label">Search models<input aria-label="Search models" value={search} onChange={event => setSearch(event.target.value)} placeholder="Model or provider name…" /></label> : null}
    <label className="field-label">Companion model<select aria-label="Companion model" value={selected} disabled={loading || loadedProvider !== provider || saving} onChange={event => void save(provider === 'codex' ? { model: event.target.value } : { providerModels: { [provider]: event.target.value } })}>
      <option value="">{visibleCatalog?.defaultModel ? `Automatic · ${label(visibleCatalog.defaultModel)}` : `Automatic · ${owner(provider)} default`}</option>
      {selected && !known ? <option value={selected}>{selected} · saved model outside the current catalog</option> : null}
      {choices.map(model => <option key={model.id} value={model.id}>{model.displayName}{model.isDefault ? ' · default' : ''}</option>)}
    </select></label>
    <label className="toggle-row"><span>Separate conversation model<small>Fast conversation and work planning share live world state, task progress, memory and conversation history.</small></span><input type="checkbox" checked={Boolean(state.settings.separateConversationModel)} disabled={saving} onChange={event=>void save({separateConversationModel:event.target.checked})} /></label>
    {state.settings.separateConversationModel?<><label className="field-label">Conversation model<select aria-label="Conversation model" value={state.settings.conversationModels?.[provider]||''} disabled={loading||loadedProvider!==provider||saving} onChange={event=>void save({conversationModels:{[provider]:event.target.value}})}><option value="">Same as work model</option>{state.settings.conversationModels?.[provider]&&!visibleCatalog?.models.some(model=>model.id===state.settings.conversationModels?.[provider])?<option value={state.settings.conversationModels[provider]}>{state.settings.conversationModels[provider]} · saved selection</option>:null}{(visibleCatalog?.models||[]).map(model=><option key={model.id} value={model.id}>{model.displayName}</option>)}</select></label><p className="note">The companion model above handles work plans and architecture. This model handles ordinary conversation and gameplay questions. Direct everyday commands stay local. If a conversation request turns into a gameplay objective, the work model plans it before actions run. Provider, network and speech still add latency; responses are not instantaneous.</p></>:null}
    <p className="note">{saving ? 'Saving selection…' : active ? `This request keeps ${owner(active.provider)} / ${label(active.model, (active.provider || 'codex') as ModelProvider)}. Your selection applies to the next model request.` : 'Saved automatically. Applies to conversation and blueprint requests; gameplay keeps running.'} Tasks, progress and shared memories stay saved when you switch.</p>
    {last ? <p className="note">Last completed request: <strong>{owner(last.provider)} / {label(last.model, (last.provider || 'codex') as ModelProvider)}</strong> · {time(last.at)}</p> : <p className="note">No completed request has reported its model yet.</p>}
    <div className="model-catalog-meta"><small>{visibleCatalog ? `${owner(provider)} catalog · checked ${time(visibleCatalog.observedAt)}` : 'Model catalog unavailable'}</small><button className="text-button" disabled={loading || saving} onClick={() => void load(true)}><RefreshCw size={12} />{loading ? 'Reading models…' : 'Refresh models'}</button></div>
    <p className="note">Choices come from the selected provider. Account access is confirmed when a request succeeds. Refreshing uses no model tokens. Conversation context is sent to the provider you select; hosted OpenCode models use your existing provider billing.</p>
    {provider === 'opencode' || state.usage.unreportedRequests ? <p className="note">OpenCode’s stateless endpoint does not report token usage. Those calls count toward request limits, but their tokens are absent from the totals and input-token cap. {state.usage.unreportedRequests || 0} completed requests have unreported token usage.</p> : null}
    {error ? <p className="inline-error" role="alert">{error}</p> : null}
  </div>;
}
