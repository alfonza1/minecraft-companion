import {
  ArrowDownToLine,
  ArrowRight,
  Check,
  ChevronRight,
  Copy,
  Mic,
  RefreshCw,
  ShieldAlert,
  Terminal,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import PrivateAccountActions from './PrivateAccountActions';
import ModelSettings from './ModelSettings';
import LowTokenMode from './LowTokenMode';
import { desktopVoiceLabel } from './desktop-voice-status';
import { PushToTalkSetting, VoiceSelection } from './VoicePreferences';
import { formatHotkey } from '../../../packages/shared-types/hotkeys';
import type { CompanionState } from "../../../packages/shared-types";
import { api } from "./api";
import {
  attempt,
  Badge,
  human,
  Panel,
  SettingSelect,
  time,
  type Common,
  type Mutate,
} from "./shared";
export default function Settings({ state, mutate, busy, navigate }: Common & { navigate: (page: string) => void }) {
  const [player, setPlayer] = useState(state.settings.playerName);
  const [copied, setCopied] = useState(false);
  const [diagnostics, setDiagnostics] = useState<any>(null);
  const accountReady = state.auth.status === "connected";
  return (
    <div className="settings-grid">
      <div className="settings-column">
        <Panel
          title="Minecraft account"
          eyebrow="YOUR COMPANION’S IDENTITY"
          action={
            <Badge tone={accountReady ? "green" : "muted"}>
              {accountReady ? "Connected" : human(state.auth.status)}
            </Badge>
          }
        >
          <div className="account-row">
            <div className="account-face">
              <Users size={24} />
            </div>
            <div>
              <h3>{state.auth.username || "A teammate needs an account"}</h3>
              <p>
                {accountReady
                  ? "Microsoft account connected"
                  : "Use a separate, licensed Minecraft Java account."}
              </p>
            </div>
          </div>
          {state.auth.error ? <p className="inline-error" role="alert">{state.auth.error}</p> : null}
          {state.auth.issue === "JAVA_PROFILE_REQUIRED" ? <a className="button" href="https://www.minecraft.net/en-us/msaprofile/mygames" target="_blank" rel="noreferrer">Open Minecraft account setup <ArrowRight size={14} /></a> : null}
          {state.auth.device ? (
            <div className="device-code">
              <p>
                Sign in directly with Microsoft. Your password never passes
                through this app.
              </p>
              <a
                href={state.auth.device.verificationUri}
                target="_blank"
                rel="noreferrer"
                className="button"
              >
                Open Microsoft sign-in <ArrowRight size={14} />
              </a>
              <div className="code-copy">
                <strong>{state.auth.device.userCode}</strong>
                <button
                  className="button icon-button"
                  aria-label="Copy device code"
                  onClick={() => {
                    void navigator.clipboard
                      .writeText(state.auth.device!.userCode)
                      .then(() => {
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2500);
                      });
                  }}
                >
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                </button>
              </div>
              <small>
                Expires {time(state.auth.device.expiresAt)} · MFA supported
              </small>
            </div>
          ) : (
            <button
              className="button full"
              disabled={busy || state.auth.status === "authenticating"}
              onClick={() => attempt(mutate("/auth/connect", {}))}
            >
              <Users size={16} />
              {state.auth.issue === "JAVA_PROFILE_REQUIRED"
                ? "Check Java profile again"
                : state.auth.username
                ? "Reconnect Minecraft account"
                : "Connect Minecraft account"}
            </button>
          )}
          <PrivateAccountActions state={state} mutate={mutate} busy={busy} />
          <p className="note">
            Sessions are cached outside the repository. Never share a password or
            authentication token in chat.
          </p>
          <div className="settings-divider" />
          <div className="panel-heading">
            <h3>Your Realm</h3>
            <button
              className="text-button"
              disabled={busy || !accountReady}
              onClick={() => attempt(mutate("/realms/refresh", {}))}
            >
              <RefreshCw size={13} />
              Refresh
            </button>
          </div>
          {state.realms.length ? (
            <label className="field-label">
              Invited Realms
              <select
                value={state.settings.realmId || ""}
                onChange={(e) =>
                  attempt(
                    mutate("/settings", { realmId: e.target.value ? Number(e.target.value) : null }),
                  )
                }
              >
                <option value="">Select a Realm</option>
                {state.realms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} · {r.owner}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="quiet-empty">
              {state.auth.username
                ? "Invite this account to your Realm, then refresh the list."
                : "Sign in to discover invited Realms."}
            </p>
          )}
          <label className="field-label">
            Your Minecraft username
            <input
              value={player}
              onChange={(e) => setPlayer(e.target.value)}
              placeholder="Who should your companion follow?"
              maxLength={16}
              onBlur={() => {
                if (player !== state.settings.playerName)
                  attempt(mutate("/settings", { playerName: player }));
              }}
            />
          </label>
          {state.connection.error ? (
            <p className="inline-error">{state.connection.error}</p>
          ) : null}
        </Panel>
        <Panel title="AI models & reasoning" eyebrow="THINK WHEN IT MATTERS">
          <ModelSettings state={state} mutate={mutate} />
          <LowTokenMode state={state} mutate={mutate} />
          <label className="toggle-row"><span>Limit input tokens<small>Optional local cap. Off by default; provider limits still apply.</small></span><input type="checkbox" checked={state.settings.inputTokenLimitEnabled===true} onChange={event=>attempt(mutate('/settings',{inputTokenLimitEnabled:event.target.checked}))} /></label>
          <div className="two-inputs">
            <label className="field-label">
              Requests per hour
              <input
                type="number"
                min="0"
                max="200"
                value={state.settings.maxRequestsPerHour}
                onChange={(e) =>
                  attempt(
                    mutate("/settings", {
                      maxRequestsPerHour: Number(e.target.value),
                    }),
                  )
                }
              />
            </label>
            <label className="field-label">
              Input tokens per budget
              <input
                type="number"
                min="0"
                step="1000"
                value={state.settings.maxInputTokens}
                disabled={state.settings.inputTokenLimitEnabled!==true}
                onChange={(e) =>
                  attempt(
                    mutate("/settings", {
                      maxInputTokens: Number(e.target.value),
                    }),
                  )
                }
              />
            </label>
          </div>
          {state.settings.inputTokenLimitEnabled===true ? <><p className="note">Current local budget: {(state.usage.inputBudgetUsed ?? state.usage.inputTokens).toLocaleString()} / {state.settings.maxInputTokens.toLocaleString()} reported input tokens. Renewing starts another budget at the same limit and preserves lifetime usage.</p><button className="button" disabled={Boolean(state.ai?.modelState?.active)} onClick={() => attempt(mutate('/usage/renew-budget', {}))}>Start new token budget</button></> : <p className="note" role="status">No local token cap. Usage is still tracked. The separate hourly request limit and your provider’s account limits still apply.</p>}
          <div className="usage-box">
            <div>
              <span>Requests</span>
              <strong>{state.usage.requests}</strong>
            </div>
            <div>
              <span>{state.usage.unreportedRequests ? 'Reported input tokens' : 'Input tokens'}</span>
              <strong>{state.usage.inputTokens.toLocaleString()}</strong>
            </div>
            <div>
              <span>{state.usage.unreportedRequests ? 'Reported output tokens' : 'Output tokens'}</span>
              <strong>{state.usage.outputTokens.toLocaleString()}</strong>
            </div>
          </div>
          <p className="note">
            Request counts include attempts; tokens come from reported responses. Account limits and billing
            cost are{" "}
            {state.usage.billingCost === null
              ? "not provided by the provider"
              : `$${state.usage.billingCost}`}
            . Pausing blocks all new reasoning.
          </p>
          <button
            className="button danger full"
            onClick={() => attempt(mutate("/control", { command: "emergency" }))}
          >
            <ShieldAlert size={15} />
            Emergency stop
          </button>
        </Panel>
      </div>
      <div className="settings-column">
        <Panel
          title="Voice & audio"
          eyebrow="HEARD, WHEREVER YOU ARE"
          action={
            <Badge tone={state.voice.available ? "green" : "muted"}>
              {human(state.voice.status)}
            </Badge>
          }
        >
          <VoiceSettings state={state} mutate={mutate} />
        </Panel>
        <Panel
          title="Diagnostics"
          eyebrow="A HEALTHY LOCAL WORKSPACE"
          action={
            <button
              className="text-button"
              onClick={() => attempt(api("/health").then(setDiagnostics))}
            >
              <RefreshCw size={13} />
              Run check
            </button>
          }
        >
          {diagnostics ? (
            <pre className="diagnostic-output">
              {JSON.stringify(diagnostics, null, 2)}
            </pre>
          ) : (
            <p className="quiet-empty">
              Check local services, supported versions, and readiness before
              heading out.
            </p>
          )}
          <details className="log-details">
            <summary>
              <Terminal size={16} />
              Runtime logs<span>{state.logs.length}</span>
            </summary>
            <div className="diagnostic-logs">
              {state.logs
                .slice(-100)
                .reverse()
                .map((log, i) => (
                  <div key={i}>
                    <time>{time(log.at)}</time>
                    <span className={log.level === "error" ? "danger-text" : ""}>
                      {log.message}
                    </span>
                  </div>
                ))}
            </div>
          </details>
          <DataManagement mutate={mutate} />
        </Panel>
      </div>
    </div>
  );
}

function VoiceSettings({
  state,
  mutate,
}: {
  state: CompanionState;
  mutate: Mutate;
}) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [audioError, setAudioError] = useState("");
  const [choosingOutput, setChoosingOutput] = useState(false);
  const voice = state.settings.voice;
  const outputPicker = navigator.mediaDevices as MediaDevices & { selectAudioOutput?: (options?: { deviceId?: string }) => Promise<MediaDeviceInfo> };
  useEffect(() => {
    let disposed = false;
    const refresh = () => { void navigator.mediaDevices?.enumerateDevices().then(value => { if (!disposed) setDevices(value); }).catch(() => {}); };
    refresh(); navigator.mediaDevices?.addEventListener('devicechange', refresh);
    return () => { disposed = true; navigator.mediaDevices?.removeEventListener('devicechange', refresh); };
  }, []);
  async function chooseOutput() {
    if (!outputPicker?.selectAudioOutput) return;
    setChoosingOutput(true); setAudioError('');
    try {
      const selected = await outputPicker.selectAudioOutput({ deviceId: voice.outputDevice || '' });
      setDevices(value => [...value.filter(device => device.deviceId !== selected.deviceId), selected]);
      await mutate('/settings', { voice: { outputDevice: selected.deviceId } });
    } catch (error) {
      const problem = error as Error;
      if (problem.name !== 'AbortError') setAudioError(['NotAllowedError', 'SecurityError'].includes(problem.name) ? 'Speaker selection was not allowed. You can use System default without granting microphone access.' : problem.message);
    } finally { setChoosingOutput(false); }
  }
  async function inspectDevices() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      stream.getTracks().forEach((t) => t.stop());
      setDevices(await navigator.mediaDevices.enumerateDevices());
      setAudioError("");
    } catch (e) {
      setAudioError((e as Error).message);
    }
  }
  return (
    <>
      <div className="data-row">
        <span>Local speech service</span>
        <strong>
          {state.voice.available ? "Available" : "Setup required"}
        </strong>
      </div>
      {state.voice.error ? (
        <p className="inline-error">{state.voice.error}</p>
      ) : null}
      <button className="button full" onClick={() => void inspectDevices()}>
        <Mic size={15} />
        Find microphone & speakers
      </button>
      {audioError ? <p className="inline-error">{audioError}</p> : null}
      <SettingSelect
        label="Microphone"
        value={voice.inputDevice || ""}
        options={{
          "": "System default",
          ...Object.fromEntries(
            devices
              .filter((d) => d.kind === "audioinput")
              .map((d) => [d.deviceId, d.label || "Microphone"]),
          ),
        }}
        onChange={(inputDevice) =>
          attempt(mutate("/settings", { voice: { inputDevice } }))
        }
      />
      <SettingSelect
        label="Audio output"
        value={voice.outputDevice || ""}
        options={{
          "": "System default",
          ...(voice.outputDevice && !devices.some(device => device.kind === 'audiooutput' && device.deviceId === voice.outputDevice) ? { [voice.outputDevice]: 'Saved speakers · choose again in this app' } : {}),
          ...Object.fromEntries(
            devices
              .filter((d) => d.kind === "audiooutput")
              .map((d) => [d.deviceId, d.label || "Speaker"]),
          ),
        }}
        onChange={(outputDevice) =>
          attempt(mutate("/settings", { voice: { outputDevice } }))
        }
      />
      {outputPicker?.selectAudioOutput ? <button className="button full" disabled={choosingOutput} onClick={() => void chooseOutput()}>{choosingOutput ? 'Choosing audio output…' : 'Choose audio output'}</button> : null}
      <p className="note">Speaker choices are specific to this app or browser. If saved speakers stop working after reopening or switching browsers, choose them again or select System default. Desktop voice has its own speaker selector below.</p>
      <label className="field-label">
        Speech speed <span className="range-label">{voice.speed}×</span>
        <input
          type="range"
          min="0.6"
          max="1.6"
          step="0.1"
          value={voice.speed}
          onChange={(e) =>
            attempt(
              mutate("/settings", {
                voice: { speed: Number(e.target.value) },
              }),
            )
          }
        />
      </label>
      <label className="field-label">
        Volume{" "}
        <span className="range-label">{Math.round(voice.volume * 100)}%</span>
        <input
          type="range"
          min="0"
          max="1"
          step=".05"
          value={voice.volume}
          onChange={(e) =>
            attempt(
              mutate("/settings", {
                voice: { volume: Number(e.target.value) },
              }),
            )
          }
        />
      </label>
      <label className="toggle-row">
        <span>
          Hands-free mode
          <small>Voice activity detection with echo cancellation</small>
        </span>
        <input
          type="checkbox"
          checked={voice.handsFree}
          onChange={(e) =>
            attempt(
              mutate("/settings", {
                voice: { handsFree: e.target.checked },
              }),
            )
          }
        />
      </label>
      <VoiceSelection state={state} mutate={mutate} />
      <NativeVoice state={state} mutate={mutate} />
      <p className="note">
        Device changes apply the next time you enable voice. Headphones help
        prevent your companion from hearing itself. Audio capture starts only
        when you enable it, and stops on pause or disconnect.
      </p>
    </>
  );
}

function NativeVoice({ state, mutate }: { state: CompanionState; mutate: Mutate }) {
  const hotkey = formatHotkey(state.settings.voice.pushToTalk);
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [devices, setDevices] = useState<
    {
      id: number;
      name: string;
      max_input_channels: number;
      max_output_channels: number;
      hostapi: number;
    }[]
  >([]);
  const inputPreference=state.settings.voice.desktopInputDevice;
  const outputPreference=state.settings.voice.desktopOutputDevice;
  const deviceValue=(preference:typeof inputPreference)=>preference ? String(devices.find(device=>device.name===preference.name&&device.hostapi===preference.hostapi)?.id ?? 'saved') : '';
  useEffect(()=>{void api('/voice/devices').then(setDevices).catch(error=>setError(error.message));},[]);
  async function saveDevice(field:'desktopInputDevice'|'desktopOutputDevice',id:string){
    setBusy(true);setError('');
    const device=devices.find(value=>String(value.id)===id);
    try {await mutate('/settings',{voice:{[field]:device?{name:device.name,hostapi:device.hostapi}:null}});}
    catch(error){setError((error as Error).message);}finally{setBusy(false);}
  }
  useEffect(() => { if (state.voice.desktop) setRunning(state.voice.desktop.running); }, [state.voice.desktop?.running]);
  useEffect(() => {
    const browserEnabled = () => setRunning(false);
    window.addEventListener("companion-browser-voice", browserEnabled);
    void api("/voice/status")
      .then((result) => setRunning(Boolean(result.desktop?.running)))
      .catch(() => {});
    return () =>
      window.removeEventListener("companion-browser-voice", browserEnabled);
  }, [state.state]);
  async function toggle() {
    setBusy(true);
    setError("");
    try {
      if (!running) window.dispatchEvent(new Event("companion-native-voice"));
      const result = await api("/voice/desktop", {
        enabled: !running,
      });
      setRunning(
        Boolean(result.desktop?.running ?? result.running ?? !running),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="native-voice">
      <div>
        <h3>Talk while Minecraft is focused</h3>
        <p>
          Desktop voice starts automatically when you connect or resume. Hold {hotkey} to speak from any app. Pause and disconnect stop capture; your choices stay saved.
        </p>
      </div>
      <label className="toggle-row"><span>Automatically enable desktop push to talk</span><input type="checkbox" checked={state.settings.voice.desktopEnabled!==false} disabled={busy} onChange={event=>{if(event.target.checked)window.dispatchEvent(new Event('companion-native-voice'));attempt(mutate('/settings',{voice:{desktopEnabled:event.target.checked}}));}} /></label>
      <PushToTalkSetting state={state} mutate={mutate} onStopped={() => setRunning(false)} />
      <button
        className="text-button"
        onClick={() =>
          attempt(
            api("/voice/devices")
              .then(setDevices)
              .catch((error) => setError(error.message)),
          )
        }
      >
        Choose desktop audio devices <ChevronRight size={12} />
      </button>
      {devices.length ? (
        <>
          <SettingSelect
            label="Desktop microphone"
            value={deviceValue(inputPreference)}
            options={{
              "": "System default",
              ...(inputPreference&&deviceValue(inputPreference)==='saved'?{saved:`${inputPreference.name} · unavailable`}:{}),
              ...Object.fromEntries(
                devices
                  .filter((d) => d.max_input_channels > 0)
                  .map((d) => [String(d.id), d.name]),
              ),
            }}
            onChange={value=>void saveDevice('desktopInputDevice',value)}
          />
          <SettingSelect
            label="Desktop speakers"
            value={deviceValue(outputPreference)}
            options={{
              "": "System default",
              ...(outputPreference&&deviceValue(outputPreference)==='saved'?{saved:`${outputPreference.name} · unavailable`}:{}),
              ...Object.fromEntries(
                devices
                  .filter((d) => d.max_output_channels > 0)
                  .map((d) => [String(d.id), d.name]),
              ),
            }}
            onChange={value=>void saveDevice('desktopOutputDevice',value)}
          />
        </>
      ) : null}
      <button
        className="button full"
        disabled={busy || !["ACTIVE", "BUSY"].includes(state.state)}
        onClick={() => attempt(toggle())}
      >
        <Mic size={14} />
        {running ? 'Disable desktop voice' : 'Enable desktop voice'}
      </button>
      {running ? <Badge tone={state.voice.desktop?.error ? "muted" : "green"}>{hotkey} · {desktopVoiceLabel(state.voice.desktop)}</Badge> : null}
      {error || state.voice.desktop?.error || state.voice.error ? <p className="inline-error">{error || state.voice.desktop?.error || state.voice.error}</p> : null}
    </div>
  );
}

function DataManagement({ mutate }: { mutate: Mutate }) {
  const [message, setMessage] = useState("");
  async function exportData() {
    try {
      const data = await api("/data/export");
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `minecraft-companion-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setMessage(
        "Exported projects, settings, and memories. Authentication tokens are excluded.",
      );
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  return (
    <div className="data-management">
      <h3>Your local data</h3>
      <p className="note">
        Back up the local database or download your projects and preferences.
        Audio recordings are not retained.
      </p>
      <div className="inline-form">
        <button
          className="button"
          onClick={() =>
            attempt(
              mutate("/data/backup", {}).then((result) =>
                setMessage(`Backup saved: ${result.path}`),
              ),
            )
          }
        >
          <Copy size={14} />
          Create backup
        </button>
        <button className="button" onClick={() => attempt(exportData())}>
          <ArrowDownToLine size={14} />
          Export data
        </button>
      </div>
      {message ? (
        <p className="note" role="status">
          {message}
        </p>
      ) : null}
    </div>
  );
}
