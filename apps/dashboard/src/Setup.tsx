import { ArrowLeft, ArrowRight, Check, Compass, Copy, Mic, RefreshCw, Shield, Square, Volume2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useVoice } from "../../desktop-voice/useVoice";
import { api } from "./api";
import { attempt, Badge, Panel, SettingSelect, time, type Common } from "./shared";
import "./setup.css";
import PrivateAccountActions from './PrivateAccountActions';

type Compatibility = { realmId: number; status: "native" | "bridge" | "unsupported" | "unavailable"; serverVersion?: string; serverProtocol?: number; clientVersion?: string; message: string; checkedAt: string };
type SetupStatus = { checkedAt: string | null; node: { version: string; ready: boolean }; codex: { available: boolean | null; authenticated: boolean | null; version: string | null; error: string | null }; voice: { available: boolean; status: string; error: string | null; tts?: string }; compatibility: Compatibility | null; bridge: { installed: boolean; version: string | null; verified: boolean; limitations: string[] } };
const steps = ["Local services", "Minecraft account", "Your Realm", "Voice check", "First session"];

export default function Setup({ state, mutate, busy, navigate }: Common & { navigate: (page: string) => void }) {
  const [step, setStep] = useState(0);
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [compatibility, setCompatibility] = useState<Compatibility | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [transcript, setTranscript] = useState("");
  const [heard, setHeard] = useState(false);
  const [player, setPlayer] = useState(state.settings.playerName);
  const [enableRequested, setEnableRequested] = useState(false);
  const [copied, setCopied] = useState(false);
  const latestState = useRef(state); latestState.current = state;
  const mounted = useRef(true);
  const compatibilityRequest = useRef(0);
  const ownsPlanning = useRef(false);
  const voice = useVoice({ state: state.state, settings: { ...state.settings.voice, handsFree: false }, onError: setError, onTranscript: async text => { setTranscript(text); } });
  const accountReady = state.auth.status === "connected";
  const selectedRealm = state.realms.find(realm => realm.id === state.settings.realmId);
  const active = ["ACTIVE", "BUSY"].includes(state.state);
  const blocked = busy || working;
  const selectedCompatibility = compatibility?.realmId === state.settings.realmId ? compatibility : null;
  const realmSupported = selectedCompatibility && ["native", "bridge"].includes(selectedCompatibility.status);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      const current = latestState.current;
      if (ownsPlanning.current && current.planning && ["ACTIVE", "BUSY"].includes(current.state)) void api("/control", { command: "pause" }).catch(() => {});
    };
  }, []);
  useEffect(() => {
    let current = true;
    const request = ++compatibilityRequest.current;
    void api<SetupStatus>("/setup").then(result => {
      if (current && request === compatibilityRequest.current) { setStatus(result); setCompatibility(result.compatibility); }
    }).catch(err => { if (current) setError(err.message); });
    return () => { current = false; };
  }, [step, state.auth.status, state.settings.realmId]);
  useEffect(() => {
    if (enableRequested && active) { setEnableRequested(false); void voice.enable(); }
  }, [enableRequested, active, voice.enable]);
  useEffect(() => { if (!active) setEnableRequested(false); }, [active]);
  useEffect(() => {
    const stop = () => { setEnableRequested(false); voice.disable(); };
    window.addEventListener("companion-native-voice", stop);
    return () => window.removeEventListener("companion-native-voice", stop);
  }, [voice.disable]);

  async function run(work: () => Promise<void>) {
    setWorking(true); setError("");
    try { await work(); } catch (err) { setError((err as Error).message); } finally { setWorking(false); }
  }
  async function refresh() {
    await run(async () => { const result = await api<SetupStatus>("/setup/check", {}); setStatus(result); setCompatibility(result.compatibility); });
  }
  async function checkRealm() {
    const realmId = state.settings.realmId;
    if (!realmId) return;
    await run(async () => { await inspectSelectedRealm(realmId); });
  }
  async function inspectSelectedRealm(realmId: number) {
    const request = ++compatibilityRequest.current;
    setCompatibility(null);
    const result = await api<Compatibility>("/realms/check", { realmId });
    if (request === compatibilityRequest.current && mounted.current) setCompatibility(result);
    return result;
  }
  async function startAudio() {
    await run(async () => {
      const native = await api("/voice/status");
      if (!mounted.current) return;
      if (native.desktop?.running) throw new Error("Disable desktop voice in Settings before testing browser audio.");
      if (state.state === "PAUSED") throw new Error("Your companion is paused. Use Resume companion above only when you want to enable audio again.");
      if (!active) {
        if (state.world || state.connection.status === "connecting") throw new Error("Stop the Realm connection before starting an offline audio check.");
        await mutate("/control", { command: "plan" }); ownsPlanning.current = true;
        if (!mounted.current) {
          const current = await api("/state");
          if (current.planning && ["ACTIVE", "BUSY"].includes(current.state)) await api("/control", { command: "pause" });
          return;
        }
      }
      window.dispatchEvent(new Event("companion-browser-voice"));
      setEnableRequested(true);
    });
  }
  function changeStep(next: number) { voice.disable(); setEnableRequested(false); setStep(next); setError(""); }
  async function startSession(realm: boolean) {
    await run(async () => {
      voice.disable(); setEnableRequested(false);
      await mutate("/settings", { playerName: player, autonomy: "instructions" });
      if (realm) {
        const realmId = state.settings.realmId;
        const username = state.auth.username;
        if (!accountReady || !selectedRealm || !realmId) throw new Error("Connect the account and select a Realm before starting.");
        const checked = realmSupported ? selectedCompatibility! : await inspectSelectedRealm(realmId);
        if (!["native", "bridge"].includes(checked.status)) throw new Error(checked.message);
        const current = latestState.current;
        if (current.settings.realmId !== realmId || current.auth.username !== username || current.auth.status !== "connected") throw new Error("The selected Realm or account changed. Connect again when your selection is ready.");
        if (state.planning) await mutate("/control", { command: "stop" });
        await mutate("/control", { command: "start" });
      } else if (state.planning && state.state === "PAUSED") await mutate("/control", { command: "resume" });
      else if (!state.planning) await mutate("/control", { command: "plan" });
      ownsPlanning.current = false;
      navigate(realm ? "overview" : "companion");
    });
  }

  return <div className="setup-workspace">
    <div className="setup-intro"><div><span className="eyebrow">BEFORE YOUR FIRST ADVENTURE</span><h2>A few checks. Then you're teammates.</h2><p>Connect the bot's account, check your Realm, and try your audio. You can plan offline at any time.</p></div><Shield size={28} /></div>
    <nav className="setup-trail" aria-label="Setup steps">{steps.map((label, index) => <button key={label} className={step === index ? "selected" : ""} aria-current={step === index ? "step" : undefined} onClick={() => changeStep(index)}><span>{index + 1}</span>{label}</button>)}</nav>
    {error ? <p className="inline-error" role="alert">{error}</p> : null}
    <div className="setup-layout"><div className="setup-main">
      {step === 0 ? <Panel title="Check your local services" eyebrow="01 / LOCAL SERVICES" action={<button className="button" disabled={blocked} onClick={() => attempt(refresh())}><RefreshCw size={14} />{working ? "Checking services…" : "Check local services"}</button>}>
        <p>Your Minecraft installation stays as it is. These checks read local service status without asking Codex a question.</p>
        <div className="setup-checks"><Readiness label="App runtime" ready={status?.node.ready} detail={status?.node.version ? `Node ${status.node.version}` : "Waiting for local health check"} /><Readiness label="Codex account" ready={status?.codex.authenticated ?? undefined} detail={status?.codex.error || status?.codex.version || "Checking local Codex sign-in"} /><Readiness label="Local speech" ready={status?.voice.available} detail={status?.voice.error || status?.voice.tts || "Checking Whisper and speech output"} /></div>
        {status?.bridge ? <p className="note">Realm protocol translation: {status.bridge.installed ? `installed${status.bridge.version ? ` (${status.bridge.version})` : ""}. ${status.bridge.verified ? "Local bridge validation passed. Your account and live Realm status are shown in the next steps." : "Live translation and Realm sign-in need validation."}` : "not installed. Native-compatible Realms do not need translation."}</p> : null}
        {status?.codex.authenticated === false ? <p className="note">Codex needs your sign-in. Open your normal Codex app and sign in, then check local services again.</p> : null}
        <p className="note">{status?.checkedAt ? `Status checked ${time(status.checkedAt)}.` : status ? "Showing existing service status. Run the check to refresh it." : "Reading existing local status…"} A green local service does not mean a Realm or microphone has been tested.</p>
      </Panel> : null}
      {step === 1 ? <Panel title="Give your teammate its own account" eyebrow="02 / MICROSOFT SIGN-IN" action={<Badge tone={accountReady ? "green" : "muted"}>{accountReady ? "Account connected" : state.auth.status}</Badge>}>
        <p>Use a separate licensed Minecraft Java account. Sign in directly at Microsoft; this app never asks for your password or MFA code.</p>
        {state.auth.error ? <p className="inline-error" role="alert">{state.auth.error}</p> : null}
        {state.auth.issue === "JAVA_PROFILE_REQUIRED" ? <a className="button" href="https://www.minecraft.net/en-us/msaprofile/mygames" target="_blank" rel="noreferrer">Open Minecraft account setup <ArrowRight size={14} /></a> : null}
        {state.auth.username ? <div className="setup-identity"><strong>{state.auth.username}</strong><span>{accountReady ? "Minecraft profile verified" : "Previous profile · sign-in needs attention"}</span></div> : null}
        {state.auth.device ? <div className="device-code"><p>Open Microsoft, enter this device code, then return here after signing in.</p><a className="button" target="_blank" rel="noreferrer" href={state.auth.device.verificationUri}>Open Microsoft sign-in <ArrowRight size={14} /></a><div className="code-copy"><strong>{state.auth.device.userCode}</strong><button className="button icon-button" aria-label="Copy Microsoft device code" onClick={() => void navigator.clipboard.writeText(state.auth.device!.userCode).then(() => setCopied(true)).catch(err => setError(err.message))}>{copied ? <Check size={16} /> : <Copy size={16} />}</button></div><small>Expires {time(state.auth.device.expiresAt)}. If it expires, reconnect to request another code.</small></div> : <button className="button primary" disabled={blocked || state.auth.status === "authenticating"} onClick={() => attempt(mutate("/auth/connect", {}))}>{state.auth.status === "authenticating" ? "Waiting for Microsoft…" : state.auth.issue === "JAVA_PROFILE_REQUIRED" ? "Check Java profile again" : accountReady ? "Reconnect Minecraft account" : "Connect Minecraft account"}</button>}
        <PrivateAccountActions state={state} mutate={mutate} busy={blocked} />
        <p className="note">The session is encrypted for your Windows user outside Git. Microsoft sign-in, MFA and account licensing require you.</p>
      </Panel> : null}
      {step === 2 ? <Panel title="Choose where you'll play" eyebrow="03 / REALM ACCESS" action={<button className="button" disabled={blocked || !accountReady} onClick={() => attempt(mutate("/realms/refresh", {}))}><RefreshCw size={14} />Refresh invited Realms</button>}>
        <p>Invite the bot's Minecraft username to your Java Realm. Accept any pending invitation in Minecraft with that account, then refresh here.</p>
        {!accountReady ? <p className="quiet-empty">Connect the Minecraft account in step 2 to discover invited Realms.</p> : !state.realms.length ? <p className="quiet-empty">No invited Realms have been returned. Check the invitation and Xbox permissions, then refresh.</p> : <label className="field-label">Invited Realms<select value={state.settings.realmId || ""} onChange={event => { setCompatibility(null); attempt(mutate("/settings", { realmId: event.target.value ? Number(event.target.value) : null })); }}><option value="">Select a Realm</option>{state.realms.map(realm => <option key={realm.id} value={realm.id}>{realm.name} · {realm.owner}</option>)}</select></label>}
        <button className="button" disabled={blocked || !accountReady || !selectedRealm} onClick={() => attempt(checkRealm())}>{working ? "Checking Realm…" : "Check Realm compatibility"}</button>
        <p className="note">This resolves and pings the selected Realm. It does not join a Minecraft player or start gameplay. A sleeping Realm may need time to become available.</p>
        {selectedCompatibility ? <div className={`setup-compatibility ${selectedCompatibility.status}`} role="status"><Badge tone={selectedCompatibility.status === "native" ? "green" : "muted"}>{selectedCompatibility.status === "native" ? "Native protocol supported" : selectedCompatibility.status === "bridge" ? "Translation required" : "Connection needs attention"}</Badge><p>{selectedCompatibility.message}</p><div className="data-row"><span>Realm version</span><strong>{selectedCompatibility.serverVersion || "Unknown"}</strong></div><div className="data-row"><span>Companion client version</span><strong>{selectedCompatibility.clientVersion || "Not established"}</strong></div><p className="note">Checked {time(selectedCompatibility.checkedAt)}. This checks the version. Live connection status appears in First session.</p>{selectedCompatibility.status === "bridge" ? <p className="note">Protocol translation can substitute newer blocks and items. Exact builds on translated versions are unavailable; validate behavior before relying on it.</p> : null}</div> : <p className="quiet-empty">Realm compatibility has not been checked for this selection.</p>}
        <button className="text-button" onClick={() => changeStep(3)}>Continue with offline planning <ArrowRight size={14} /></button>
      </Panel> : null}
      {step === 3 ? <Panel title="Make sure you can hear each other" eyebrow="04 / YOUR AUDIO" action={<Badge tone={voice.enabled ? "green" : "muted"}>{voice.enabled ? "Microphone enabled" : "Microphone off"}</Badge>}>
        <p>Use headphones. This local check transcribes your words on this PC and plays a fixed test sentence. It sends no question to Codex.</p>
        {!voice.enabled ? <button className="button primary" disabled={blocked || !state.voice.available || state.state === "PAUSED"} onClick={() => attempt(startAudio())}><Mic size={15} />Start local audio checks</button> : <button className="button" onClick={() => { setEnableRequested(false); voice.disable(); }}><Square size={14} />Stop audio checks</button>}
        {state.state === "PAUSED" ? <p className="note">Audio stays off while paused. Use Resume companion above when ready, then start the check explicitly.</p> : null}
        {!state.voice.available ? <p className="inline-error">Local speech needs setup. Check local services first.</p> : null}
        {voice.devices.length ? <div className="two-inputs"><SettingSelect label="Test microphone" value={state.settings.voice.inputDevice} options={{ "": "System default", ...Object.fromEntries(voice.devices.filter(device => device.kind === "audioinput").map(device => [device.deviceId, device.label || "Microphone"])) }} onChange={inputDevice => { voice.disable(); attempt(mutate("/settings", { voice: { ...state.settings.voice, inputDevice } })); }} /><SettingSelect label="Test speakers" value={state.settings.voice.outputDevice} options={{ "": "System default", ...Object.fromEntries(voice.devices.filter(device => device.kind === "audiooutput").map(device => [device.deviceId, device.label || "Speakers"])) }} onChange={outputDevice => { setHeard(false); attempt(mutate("/settings", { voice: { ...state.settings.voice, outputDevice } })); }} /></div> : null}
        <div className="setup-audio-controls"><button className="button" disabled={!voice.enabled} onClick={() => { setHeard(false); attempt(voice.speak("Hey, can you hear me? Ready when you are.")); }}><Volume2 size={15} />Play speaker test</button><button className={`button ${voice.listening ? "primary" : ""}`} disabled={!voice.enabled} onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); voice.startTalking(); }} onPointerUp={voice.stopTalking} onPointerCancel={voice.stopTalking} onKeyDown={event => { if (event.code === "Space" && !event.repeat) { event.preventDefault(); voice.startTalking(); } }} onKeyUp={event => { if (event.code === "Space") { event.preventDefault(); voice.stopTalking(); } }}>{voice.listening ? "Listening… release to transcribe" : "Hold to test microphone"}</button></div>
        <div className="setup-transcript" aria-live="polite"><span className="eyebrow">LOCAL TEST TRANSCRIPT</span><p>{transcript || "Hold the microphone test button, say a sentence, then release. Your actual transcript appears here."}</p></div>
        <label className="toggle-row"><span>I heard the speaker test<small>Your confirmation · not an automated speaker check</small></span><input type="checkbox" checked={heard} onChange={event => setHeard(event.target.checked)} /></label>
        <p className="note">{heard ? "Speaker playback confirmed by you for this setup session." : "Speaker playback has not been confirmed."} {transcript ? "A microphone recording was transcribed locally." : "Physical microphone input is unverified."} Audio is not saved.</p>
        <p className="note">To speak while Minecraft is focused, choose a push-to-talk key and enable desktop voice in Settings after starting a session. Its microphone and speakers are selected separately. Try your shortcut and microphone before relying on voice commands.</p><button className="text-button" onClick={() => navigate("settings")}>Open desktop audio settings <ArrowRight size={14} /></button>
      </Panel> : null}
      {step === 4 ? <Panel title="Start with a small first session" eyebrow="05 / SURVIVAL, TOGETHER">
        <label className="field-label">Your Minecraft username<input value={player} onChange={event => setPlayer(event.target.value)} maxLength={16} placeholder="Who should the companion follow?" /></label>
        <p>Your first session uses <strong>Follow instructions only</strong>. Construction needs an approved blueprint; mining needs a separately approved area. Nothing here approves clearing or spends rare shared resources.</p>
        <div className="setup-checks"><Readiness label="Minecraft account" ready={accountReady} detail={accountReady ? state.auth.username || "Connected" : "Microsoft sign-in still needed for Realms"} /><Readiness label="Selected Realm" ready={selectedCompatibility?.status === "native" ? true : undefined} pendingLabel={selectedCompatibility?.status === "bridge" ? "Translation required" : selectedRealm ? "Selected" : "Choose a Realm"} detail={selectedRealm ? `${selectedRealm.name} · ${selectedCompatibility?.message || "Saved. Compatibility will be checked when you connect."}` : "Choose a Realm in step 3."} /><Readiness label="Actual world observation" ready={state.world ? true : state.connection.status === "error" ? false : undefined} pendingLabel="Not connected yet" detail={state.world ? `Connected as ${state.connection.username}` : state.connection.error || "Live health and inventory appear after your companion joins. You can connect below."} /></div>
        <div className="setup-launch"><button className="button primary" disabled={blocked || !accountReady || !selectedRealm || Boolean(state.world) || state.connection.status === "connecting"} onClick={() => attempt(startSession(true))}>Connect to selected Realm <ArrowRight size={15} /></button><button className="button" disabled={blocked || Boolean(state.world) || state.connection.status === "connecting"} onClick={() => attempt(startSession(false))}><Compass size={15} />Start planning offline</button></div>
        <p className="note">Offline planning supports conversation and building design without a Realm. Starting a session alone makes no model requests. In-game movement, survival decisions and construction still need supervised validation on your Realm.</p>
      </Panel> : null}
      <div className="setup-pagination"><button className="button" disabled={step === 0} onClick={() => changeStep(step - 1)}><ArrowLeft size={14} />Back</button><span>Step {step + 1} of {steps.length}</span>{step < steps.length - 1 ? <button className="button" onClick={() => changeStep(step + 1)}>Continue <ArrowRight size={14} /></button> : <button className="button" onClick={() => navigate("overview")}>Back to overview</button>}</div>
    </div><aside className="setup-notes"><span className="eyebrow">WHAT NEEDS YOU</span><h3>Keep the human parts human.</h3><p>Microsoft sign-in, Realm invitations, microphone permission and confirming what you hear need your input.</p><hr /><h3>One step at a time.</h3><p>You can revisit any step. Your account, Realm and audio preferences are saved locally; test results never stand in for gameplay.</p><div className="setup-privacy"><Shield size={17} /><span>Local dashboard. Encrypted account session. No recorded audio.</span></div></aside></div>
  </div>;
}

function Readiness({ label, ready, detail, pendingLabel = "Unverified" }: { label: string; ready?: boolean; detail: string; pendingLabel?: string }) {
  return <div className="setup-readiness"><span className={`setup-check-symbol ${ready === true ? "ready" : ""}`}>{ready === true ? <Check size={16} /> : "·"}</span><div><strong>{label}</strong><small>{detail}</small></div><Badge tone={ready === true ? "green" : "muted"}>{ready === true ? "Ready" : ready === false ? "Needs attention" : pendingLabel}</Badge></div>;
}
