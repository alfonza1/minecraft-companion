import { Mic, MicOff } from "lucide-react";
import type { CompanionState } from "../../../packages/shared-types";
import { formatHotkey } from "../../../packages/shared-types/hotkeys";
import { desktopVoiceLabel } from "./desktop-voice-status";

export type BrowserVoiceStatus = { enabled: boolean; listening: boolean };

export default function PushToTalkIndicator({
  state,
  connected,
  browser,
  openVoice,
}: {
  state: CompanionState;
  connected: boolean;
  browser: BrowserVoiceStatus;
  openVoice: () => void;
}) {
  const active = connected && ["ACTIVE", "BUSY"].includes(state.state);
  const desktop = state.voice.desktop;
  const enabled = active && Boolean(desktop?.running || browser.enabled);
  const listening =
    enabled &&
    (desktop?.running ? desktop.phase === "listening" : browser.listening);
  const needsAttention =
    enabled && desktop?.running && desktop.phase === "error";
  const binding = formatHotkey(state.settings.voice.pushToTalk);
  const status = !connected
    ? "Voice status unavailable — reconnecting"
    : !active
      ? "Microphone inactive — start or resume companion"
      : listening
        ? `Listening — ${desktop?.running || !state.settings.voice.handsFree ? binding + " held" : "hands-free"}`
        : desktop?.running
          ? `${desktopVoiceLabel(desktop)} · ${binding}`
          : browser.enabled
            ? `Microphone ready · ${binding}`
            : "Microphone off — enable voice";
  const Icon = enabled ? Mic : MicOff;
  return (
    <button
      className={`button icon-button ptt-indicator${listening ? " is-listening" : ""}${needsAttention ? " needs-attention" : ""}`}
      data-listening={listening}
      aria-label={`${status}. Open voice controls`}
      title={`${status}. Open voice controls`}
      onClick={openVoice}
    >
      <Icon size={16} aria-hidden="true" />
      <span className="ptt-indicator-dot" aria-hidden="true" />
      <span className="ptt-indicator-status" role="status" aria-live="polite">
        {status}
      </span>
    </button>
  );
}
