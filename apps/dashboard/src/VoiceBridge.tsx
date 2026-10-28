import { AudioLines, Mic, Power, Square, Volume2 } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "./api";
import type { CompanionState } from "../../../packages/shared-types";
import { useVoice } from "../../desktop-voice/useVoice";
import { attempt, type Mutate } from "./shared";
import { formatHotkey } from '../../../packages/shared-types/hotkeys';
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
  return (
    <div className={`voice-dock ${voice.listening ? "listening" : ""}`}>
      <div className="voice-dock-status">
        <AudioLines size={19} />
        <div>
          <strong>
            {voice.listening
              ? "Listening…"
              : voice.speaking
                ? "Companion speaking"
                : voice.enabled
                  ? "Voice connected"
                  : "Your voice, across the whole Realm"}
          </strong>
          <small>
            {error ||
              (!active
                ? "Start your companion to enable voice."
                : voice.enabled
                  ? state.settings.voice.handsFree
                    ? "Hands-free · Speak naturally"
                    : `Push to talk · Hold ${formatHotkey(state.settings.voice.pushToTalk)} or the microphone button`
                  : "Microphone stays off until you enable it.")}
          </small>
        </div>
      </div>
      <div className="voice-dock-controls">
        {voice.enabled ? (
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
            onClick={() => attempt(enableBrowserVoice())}
          >
            <Mic size={15} />
            Enable voice
          </button>
        )}
      </div>
    </div>
  );
}
