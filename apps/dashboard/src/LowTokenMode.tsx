import { useState } from 'react';
import type { CompanionState } from '../../../packages/shared-types';
import { LOW_TOKEN_LIMITS as limits } from '../../../packages/shared-types/token-mode';
import type { Mutate } from './shared';

export default function LowTokenMode({ state, mutate }: { state: CompanionState; mutate: Mutate }) {
  const [saving, setSaving] = useState(false), [error, setError] = useState('');
  async function change(enabled: boolean) {
    setSaving(true); setError('');
    try { await mutate('/settings', { lowTokenMode: enabled }); }
    catch (error) { setError((error as Error).message); }
    finally { setSaving(false); }
  }
  return <div className="low-token-setting">
    <label className="toggle-row"><span>Low token mode<small>Reduce AI context and disable new AI building designs</small></span><input aria-label="Low token mode" type="checkbox" checked={Boolean(state.settings.lowTokenMode)} disabled={saving} onChange={event => void change(event.target.checked)} /></label>
    <p className="note low-token-inventory"><strong>Live inventory updates use zero model tokens and stay enabled.</strong> Pickup events, health, hunger and dashboard updates are handled locally.</p>
    <details open={Boolean(state.settings.lowTokenMode)}>
      <summary>Exactly what this changes</summary>
      <ul>
        <li><strong>Disables new AI blueprint generation and redesign.</strong> Imports, 3D previews, material calculations, assignments and approved survival construction still work.</li>
        <li><strong>Omits optional coding-skill instructions</strong> from new Codex requests. The companion’s gameplay rules, tool restrictions and safety checks remain.</li>
        <li><strong>Limits recent conversation context</strong> to {limits.messages} previous messages, up to {limits.messageCharacters} characters each, and {limits.memories} relevant saved notes up to {limits.memoryCharacters} characters each. Older history and notes stay saved locally.</li>
        <li><strong>Replaces full world, chest, death and job records with summaries.</strong> Sends inventory totals, equipment, health, hunger, coordinates, up to {limits.nearbyEntities} nearby entities with threats prioritized, {limits.locations} relevant saved places, and the latest {limits.tasks} saved jobs. Full chest contents and death inventories are excluded from AI context.</li>
        <li><strong>Answers simple inventory, item-count, location, health and task-status questions locally</strong> when recognized, with no Codex request. General questions and complex plans still use AI.</li>
        <li><strong>Requests brief replies</strong> of 1–3 short sentences unless you ask for detail. Less context can mean more clarification or reminders.</li>
      </ul>
      <p className="note">Keeps voice, normal conversation, safety reflexes, gathering, crafting, combat, restocking, task handoffs and automatic resume. It does not change your model, reasoning effort, saved memories or usage limits.</p>
      <p className="note">Applies to the next AI request. A request already running finishes with its original settings. Local alerts and normal gameplay already use no model tokens. Codex’s own overhead still applies; exact savings vary and actual usage remains shown below.</p>
    </details>
    {error ? <p role="alert" className="inline-error">{error}</p> : null}
  </div>;
}
