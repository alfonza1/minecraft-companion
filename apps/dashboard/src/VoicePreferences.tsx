import { Keyboard, Play, Square } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { CompanionState } from '../../../packages/shared-types';
import { DEFAULT_PUSH_TO_TALK, formatHotkey, hotkeyFromEvent, type PushToTalkBinding } from '../../../packages/shared-types/hotkeys';
import { api } from './api';
import type { Mutate } from './shared';
import { configureAudioOutput } from '../../desktop-voice/audio-output.js';

export function PushToTalkSetting({ state, mutate, onStopped }: { state: CompanionState; mutate: Mutate; onStopped: () => void }) {
  const [capturing, setCapturing] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [stopping, setStopping] = useState(false);
  const save = async (binding: PushToTalkBinding) => {
    setCapturing(false); setBusy(true); setError('');
    try {
      await api('/voice/desktop', { enabled: false }); onStopped(); window.dispatchEvent(new Event('companion-native-voice'));
      await mutate('/settings', { voice: { pushToTalk: binding } });
    }
    catch (error) { setError((error as Error).message); }
    finally { setBusy(false); }
  };
  useEffect(() => {
    if (!capturing) return;
    const key = (event: KeyboardEvent) => {
      event.preventDefault(); event.stopImmediatePropagation();
      if (event.code === 'Escape') { setCapturing(false); return; }
      if (event.repeat) return;
      try { const binding = hotkeyFromEvent(event); if (binding) void save(binding); }
      catch (error) { setError((error as Error).message); }
    };
    const mouse = (event: PointerEvent) => {
      if (![3, 4].includes(event.button)) return;
      event.preventDefault(); event.stopImmediatePropagation();
      const binding = hotkeyFromEvent({ ...event, code: event.button === 3 ? 'Mouse4' : 'Mouse5', metaKey: event.metaKey, ctrlKey: event.ctrlKey, altKey: event.altKey, shiftKey: event.shiftKey });
      if (binding) void save(binding);
    };
    window.addEventListener('keydown', key, true); window.addEventListener('pointerdown', mouse, true);
    return () => { window.removeEventListener('keydown', key, true); window.removeEventListener('pointerdown', mouse, true); };
  }, [capturing, mutate]);
  async function begin() {
    setBusy(true); setStopping(true); setError('');
    try { await api('/voice/desktop', { enabled: false }); onStopped(); window.dispatchEvent(new Event('companion-native-voice')); setCapturing(true); }
    catch (error) { setError((error as Error).message); }
    finally { setBusy(false); setStopping(false); }
  }
  return <div className="voice-preference">
    <label className="field-label">Push-to-talk key <kbd>{formatHotkey(state.settings.voice.pushToTalk)}</kbd></label>
    <div className="preference-actions">
      <button className="button" disabled={busy} onClick={() => void begin()}><Keyboard size={15} />{capturing ? 'Press a key or Mouse 4/5…' : stopping ? 'Stopping capture…' : busy ? 'Saving…' : 'Change key'}</button>
      {capturing ? <button className="text-button" onClick={() => setCapturing(false)}>Cancel</button> : <button className="text-button" disabled={busy} onClick={() => void save(DEFAULT_PUSH_TO_TALK)}>Reset to F8</button>}
    </div>
    <p className="note">Ctrl, Alt and Shift combinations are supported. Escape cancels. Pick a shortcut Minecraft is not using; the game still receives the key. Changing it stops capture—enable voice again afterward.</p>
    {capturing ? <p role="status">Waiting for your shortcut…</p> : null}
    {error ? <p className="inline-error" role="alert">{error}</p> : null}
  </div>;
}

type VoiceOption = { id: string; name: string; available: boolean; provider: string; description?: string };
export function VoiceSelection({ state, mutate }: { state: CompanionState; mutate: Mutate }) {
  const [voices, setVoices] = useState<VoiceOption[]>([]), [error, setError] = useState(''), [notice, setNotice] = useState(''), [previewing, setPreviewing] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null), request = useRef<AbortController | null>(null), objectUrl = useRef<string | null>(null), owned = useRef(false);
  const cancellation = useRef<Promise<unknown>>(Promise.resolve());
  function stop() {
    request.current?.abort(); audio.current?.pause(); audio.current = null;
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current); objectUrl.current = null;
    if (owned.current) cancellation.current = api('/voice/cancel', {}).catch(() => {});
    owned.current = false; setPreviewing(false);
    return cancellation.current;
  }
  useEffect(() => { let disposed = false; void api<VoiceOption[]>('/voice/options').then(value => { if (!disposed) setVoices(value); }).catch(error => { if (!disposed) setError(error.message); }); return () => { disposed = true; stop(); }; }, []);
  useEffect(() => { if (state.state === 'PAUSED') stop(); }, [state.state]);
  async function preview() {
    await stop(); setError(''); setNotice(''); setPreviewing(true); owned.current = true;
    const controller = new AbortController(); request.current = controller;
    try {
      const response = await fetch('/api/voice/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ voiceId: state.settings.voice.ttsVoice || 'auto', speed: state.settings.voice.speed }), signal: controller.signal });
      if (!response.ok) throw new Error((await response.json()).error || 'Voice preview failed.');
      const blob = await response.blob(); if (controller.signal.aborted) return;
      objectUrl.current = URL.createObjectURL(blob); const player = new Audio(objectUrl.current); audio.current = player;
      player.volume = state.settings.voice.volume;
      const output = await configureAudioOutput(player, state.settings.voice.outputDevice, { fallbackToDefault: true });
      if (controller.signal.aborted) return;
      setNotice(output.notice || '');
      player.onended = stop; player.onerror = () => { setError('Audio playback failed. Check your output device.'); stop(); };
      await player.play();
    } catch (error) { if (!controller.signal.aborted) { setError((error as Error).message); stop(); } }
  }
  return <div className="voice-preference">
    <label className="field-label">Companion voice<select aria-label="Companion voice" value={state.settings.voice.ttsVoice || 'auto'} disabled={!voices.length} onChange={event => { stop(); setNotice(''); setError(''); void mutate('/settings', { voice: { ttsVoice: event.target.value } }).catch(() => {}); }}>
      {voices.length ? voices.map(voice => <option key={voice.id} value={voice.id} disabled={!voice.available}>{voice.name}{voice.available ? '' : ' · not installed'}</option>) : <option value="auto">Loading local voices…</option>}
    </select></label>
    <p className="note">Free local voices. Kokoro uses the full-precision model for quality; Piper is a lightweight alternative. Preview uses the selected output when permitted, otherwise the system default with a notice. No microphone access, speech API or account is needed to preview.</p>
    <button className="button" disabled={!voices.length || state.state === 'PAUSED'} onClick={() => previewing ? stop() : void preview()}>{previewing ? <Square size={14} /> : <Play size={14} />}{previewing ? 'Stop voice preview' : 'Preview voice'}</button>
    {state.state === 'PAUSED' ? <p className="note">Resume to preview a voice.</p> : null}
    {notice ? <p className="note" role="status">{notice}</p> : null}
    {error ? <p className="inline-error" role="alert">{error}</p> : null}
  </div>;
}
