import {
  Backpack,
  Box,
  ChevronRight,
  Compass,
  Construction,
  LayoutDashboard,
  LoaderCircle,
  MessageCircle,
  Pause,
  Play,
  Settings2,
  Shield,
  ShieldAlert,
  Square,
  Users,
  Wrench,
  X,
} from "lucide-react";
import { useState } from "react";
import { useCompanion } from "./api";
import Companion from "./Companion";
import Inventory from "./Inventory";
import Overview from "./Overview";
import Settings from "./Settings";
import Setup from "./Setup";
import { attempt, Badge, Empty, human, Panel, type Common } from "./shared";
import SharedTasks from "./SharedTasks";
import Studio from "./Studio";
import VoiceBridge from "./VoiceBridge";
const navigation = [
  { id: "overview", name: "Overview", icon: LayoutDashboard },
  { id: "inventory", name: "Inventory", icon: Backpack },
  { id: "studio", name: "Build studio", icon: Construction },
  { id: "tasks", name: "Shared tasks", icon: Users },
  { id: "companion", name: "Companion", icon: MessageCircle },
  { id: "settings", name: "Settings", icon: Settings2 },
  { id: "setup", name: "Setup", icon: Wrench },
];
function Controls({ state, mutate, busy }: Common) {
  const active = state.state === "ACTIVE" || state.state === "BUSY";
  return (
    <div className="runtime-controls">
      <button
        className="button primary"
        disabled={
          busy || active || (!state.settings.realmId && !state.planning)
        }
        onClick={() =>
          attempt(
            mutate("/control", {
              command: state.state === "PAUSED" ? "resume" : "start",
            }),
          )
        }
      >
        <Play size={15} />
        {state.state === "PAUSED" ? "Resume companion" : "Start companion"}
      </button>
      <button
        className="button"
        disabled={!active}
        onClick={() => attempt(mutate("/control", { command: "pause" }))}
      >
        <Pause size={15} />
        Pause
      </button>
      <button
        className="button icon-button"
        aria-label="Stop and disconnect"
        title="Stop and disconnect"
        disabled={state.state === "DISCONNECTED" && state.auth.status !== "authenticating" && state.connection.status !== "connecting"}
        onClick={() => attempt(mutate("/control", { command: "stop" }))}
      >
        <Square size={15} />
      </button>
    </div>
  );
}

export default function App() {
  const { state, error, connected, busy, mutate, clearError } = useCompanion();
  const [page, setPage] = useState("overview");
  const title = navigation.find((n) => n.id === page)?.name || "Overview";
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setPage("overview");
          }}
          aria-label="Minecraft Companion home"
        >
          <span className="brand-mark">
            <Box size={26} />
          </span>
          <span>
            MINECRAFT<strong>COMPANION</strong>
          </span>
        </a>
        <div className="workspace-label">YOUR WORKSPACE</div>
        <nav aria-label="Main navigation">
          {navigation.map(({ id, name, icon: Icon }) => (
            <button
              key={id}
              className={`nav-item ${page === id ? "selected" : ""}`}
              onClick={() => setPage(id)}
            >
              <Icon size={19} />
              <span>{name}</span>
              {page === id ? <ChevronRight size={14} /> : null}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="local-indicator">
            <span className={`status-dot ${connected ? "online" : ""}`} />
            <div>
              <strong>Local workspace</strong>
              <small>
                {connected ? "Live connection" : "Connecting to local service"}
              </small>
            </div>
            <Shield size={16} />
          </div>
          <span className="sidebar-caption">
            Your world. A little more company.
          </span>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <ChevronRight size={13} />
            <strong>{title}</strong>
          </div>
          <div className="topbar-right">
            <span className="local-only">
              <Shield size={13} />
              LOCAL ONLY
            </span>
            <Badge
              tone={
                state?.state === "ACTIVE" || state?.state === "BUSY"
                  ? "green"
                  : state?.state === "ERROR"
                    ? "red"
                    : "muted"
              }
            >
              {state ? human(state.state) : "Connecting"}
            </Badge>
            <button
              className="icon-button danger-text"
              aria-label="Emergency stop companion"
              title="Emergency stop companion"
              disabled={!state}
              onClick={() =>
                attempt(mutate("/control", { command: "emergency" }))
              }
            >
              <ShieldAlert size={17} />
            </button>
            <button
              className="avatar"
              title="Account settings"
              onClick={() => setPage("settings")}
            >
              {state?.auth.username?.slice(0, 2).toUpperCase() || (
                <Users size={17} />
              )}
            </button>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <p className="eyebrow">MINECRAFT COMPANION</p>
              <h1>{title}</h1>
              <p>
                {
                  (
                    {
                      overview: "A good teammate, wherever the adventure goes.",
                      inventory:
                        "Everything your companion is actually carrying.",
                      studio:
                        "From a reference to your next place to call home.",
                      tasks: "A shared plan. A fair share of the work.",
                      companion: "Make yourselves at home.",
                      settings: "Your account, your voice, your way to play.",
                      setup: "A guided path from your PC to your first session.",
                    } as Record<string, string>
                  )[page]
                }
              </p>
            </div>
            {state ? (
              <Controls state={state} mutate={mutate} busy={busy} />
            ) : null}
          </div>
          {error ? (
            <div className="error-banner" role="alert">
              <ShieldAlert size={18} />
              <span>{error}</span>
              <button aria-label="Dismiss error" onClick={clearError}>
                <X size={16} />
              </button>
            </div>
          ) : null}
          {!state ? (
            <Panel>
              <Empty icon={LoaderCircle} title="Connecting to your workspace">
                Start the local launcher to connect. This page will reconnect
                automatically.
              </Empty>
            </Panel>
          ) : (
            <>
              <div className="content-fade" key={page}>
                {state.world && state.connection.projected ? <div className="info-note gold"><p><strong>Realm {state.connection.serverVersion} · translated client {state.connection.version}.</strong> Newer blocks and items may appear as substitutes. Exact construction, crafting, resource collection and inventory reconciliation are disabled.</p></div> : null}
                {state.planning ? (
                  <div className="info-note gold">
                    <Compass size={18} />
                    <p>
                      <strong>Offline planning is active.</strong> Talk, use
                      voice, and design blueprints with Codex. No Minecraft bot
                      is connected and no gameplay actions can run.
                    </p>
                  </div>
                ) : !state.world &&
                  (page === "companion" || page === "studio") ? (
                  <div className="planning-invitation">
                    <div>
                      <h3>Plan before you head into the world</h3>
                      <p>
                        Start an offline session for conversation and blueprint
                        design. Your messages are sent to Codex only when you
                        ask.
                      </p>
                    </div>
                    <button
                      className="button"
                      disabled={busy}
                      onClick={() =>
                        attempt(mutate("/control", { command: "plan" }))
                      }
                    >
                      <Compass size={15} />
                      Start planning offline
                    </button>
                  </div>
                ) : null}
                {page === "overview" ? (
                  <Overview
                    state={state}
                    mutate={mutate}
                    busy={busy}
                    navigate={setPage}
                  />
                ) : page === "inventory" ? (
                  <Inventory state={state} />
                ) : page === "studio" ? (
                  <Studio state={state} mutate={mutate} busy={busy} />
                ) : page === "tasks" ? (
                  <SharedTasks state={state} mutate={mutate} busy={busy} />
                ) : page === "companion" ? (
                  <Companion state={state} mutate={mutate} busy={busy} />
                ) : page === "setup" ? (
                  <Setup state={state} mutate={mutate} busy={busy} navigate={setPage} />
                ) : (
                  <Settings state={state} mutate={mutate} busy={busy} navigate={setPage} />
                )}
              </div>
              {page !== "setup" ? <VoiceBridge state={state} mutate={mutate} /> : null}
              <footer>
                <span>
                  <span className={`status-dot ${connected ? "online" : ""}`} />
                  {connected
                    ? "Connected to local runtime"
                    : "Live updates reconnecting"}
                </span>
                <span>
                  {state.connection.projected
                    ? `Realm ${state.connection.serverVersion} · client ${state.connection.version}`
                    : state.connection.version
                    ? `Minecraft Java ${state.connection.version}`
                    : "Minecraft Java Edition"}
                  <span className="footer-divider">/</span>Survival, together.
                </span>
              </footer>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
