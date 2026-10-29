import { AudioLines, Mic, Power, Square, Volume2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import type { CompanionState } from "../../../packages/shared-types";
import { useVoice } from "../../desktop-voice/useVoice";
import { attempt, type Mutate } from "./shared";
import { formatHotkey } from '../../../packages/shared-types/hotkeys';
import { desktopVoiceLabel } from './desktop-voice-status';
export default function VoiceBridge({
  state,
  mutate,
}: {
  state: CompanionState;
  mutate: Mutate;
}) {
  const [error, setError] = useState("");
  const voice = useVoice({
    state: state.state,
    settings: state.settings.voice,
    onError: setError,
    onTranscript: async (text) => {
      const result = await mutate("/conversation", { text });
      return result.text || result.response || result.reply;
    },
  });
  const active = ["ACTIVE", "BUSY"].includes(state.state);
  const desktop = state.voice.desktop;
  const nativeRunning = Boolean(desktop?.running);
  const desktopApp = Boolean(window.__COMPANION_DESKTOP__);
  const lastNotice = useRef(state.conversation.at(-1)?.id);
  useEffect(() => {
    const newest = state.conversation.at(-1);
    if (!newest || newest.id === lastNotice.current) return;
    lastNotice.current = newest.id;
    if (newest.kind && active && voice.enabled && !voice.listening && !voice.speaking) void voice.speak(newest.text).catch(error => setError(error.message));
  }, [state.conversation, active, voice.enabled, voice.listening, voice.speaking, voice.speak]);
  useEffect(() => {
    window.addEventListener("companion-native-voice", voice.disable);
    return () =>
      window.removeEventListener("companion-native-voice", voice.disable);
  }, [voice.disable]);
  async function enableBrowserVoice() {
    setError("");
    try {
      const status = await api("/voice/status");
      if (status.desktop?.running)
        await api("/voice/desktop", { enabled: false });
      window.dispatchEvent(new Event("companion-browser-voice"));
      await voice.enable();
    } catch (error) {
      setError((error as Error).message);
    }
  }
  async function enableDesktopVoice() {
    setError('');
    try {
      window.dispatchEvent(new Event('companion-native-voice'));
      await api('/voice/desktop', {enabled:true});
    } catch (error) { setError((error as Error).message); }
  }
  return (
    <div className={`voice-dock ${voice.listening || (nativeRunning && desktop?.phase === 'listening') ? "listening" : ""}`}>
      <div className="voice-dock-status">
        <AudioLines size={19} />
        <div>
          <strong>
            {nativeRunning ? desktopVoiceLabel(desktop) : voice.listening
              ? "Listening…"
              : voice.speaking
                ? "Companion speaking"
                : voice.enabled
                  ? "Voice connected"
                  : "Your voice, across the whole Realm"}
          </strong>
          <small>
            {error || desktop?.error ||
              (!active
                ? "Start your companion to enable voice."
                : nativeRunning
                  ? `Hold ${formatHotkey(state.settings.voice.pushToTalk)}, speak, then release. Works while Minecraft or another app is focused.`
                : voice.enabled
                  ? state.settings.voice.handsFree
                    ? "Hands-free · Speak naturally"
                    : `Push to talk · Hold ${formatHotkey(state.settings.voice.pushToTalk)} or the microphone button`
                  : desktopApp
                    ? "Enable desktop voice to talk while Minecraft or another app is focused."
                    : "Browser voice needs this window focused. Use desktop voice in Settings while gaming.")}
          </small>
        </div>
      </div>
      <div className="voice-dock-controls">
        {nativeRunning ? (
          <button className="button" aria-label="Disable desktop voice" onClick={() => attempt(api('/voice/desktop', {enabled:false}))}>
            <Power size={15} /> Disable desktop voice
          </button>
        ) : voice.enabled ? (
          <>
            <button
              className="button"
              onClick={() =>
                attempt(
                  voice.speak("Hey, can you hear me? Ready when you are."),
                )
              }
            >
              <Volume2 size={14} />
              Test speaker
            </button>
            <button
              className={`button ${voice.listening ? "primary" : ""}`}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                voice.startTalking();
              }}
              onPointerUp={voice.stopTalking}
              onPointerCancel={voice.stopTalking}
              onKeyDown={(e) => {
                if (e.code === "Space" && !e.repeat) {
                  e.preventDefault();
                  voice.startTalking();
                }
              }}
              onKeyUp={(e) => {
                if (e.code === "Space") {
                  e.preventDefault();
                  voice.stopTalking();
                }
              }}
              aria-label="Hold to talk"
            >
              <Mic size={15} />
              {voice.listening ? "Listening…" : "Hold to talk"}
            </button>
            <button
              className="button icon-button"
              aria-label="Disable microphone"
              onClick={voice.disable}
            >
              <Power size={15} />
            </button>
            {voice.speaking ? (
              <button
                className="button"
                onClick={() => attempt(voice.interrupt())}
              >
                <Square size={14} />
                Interrupt
              </button>
            ) : null}
          </>
        ) : (
          <button
            className="button"
            disabled={!active || !state.voice.available}
            onClick={() => attempt(desktopApp ? enableDesktopVoice() : enableBrowserVoice())}
          >
            <Mic size={15} />
            {desktopApp ? 'Enable desktop voice' : 'Enable voice'}
          </button>
        )}
      </div>
    </div>
  );
}
