import { useEffect, useState } from "react";
import {
  Activity,
  Backpack,
  Bell,
  ChevronRight,
  Compass,
  Construction,
  Gamepad2,
  HeartHandshake,
  LayoutDashboard,
  ListTodo,
  Menu,
  MessageCircle,
  Pause,
  Play,
  Plug,
  Settings2,
  ShieldAlert,
  Square,
  Target,
  Terminal,
  Users,
  Wrench,
  X,
} from "lucide-react";
import WaypointMark from "../../../packages/ui/WaypointMark";
import { useCompanion } from "./api";
import Companion from "./Companion";
import Inventory from "./Inventory";
import Settings from "./Settings";
import Setup from "./Setup";
import SharedTasks from "./SharedTasks";
import Studio from "./Studio";
import VoiceBridge from "./VoiceBridge";
import DesktopBar from "./DesktopBar";
import SetupIssues from "./SetupIssues";
import { attempt, Badge, Empty, human, Panel, type Common } from "./shared";
import {
  WorkspaceOverview,
  Mission,
  Resources,
  Assistance,
  ActivityFeed,
  Games,
  Extensions,
  Community,
  Diagnostics,
} from "./Workspace";
import { CompanionHome, ConversationPane } from "./CompanionHome";

const navigation = [
  {
    group: "Together",
    id: "overview",
    name: "Overview",
    icon: LayoutDashboard,
  },
  {
    group: "Together",
    id: "companion",
    name: "My companion",
    icon: HeartHandshake,
  },
  { group: "Together", id: "mission", name: "Current mission", icon: Target },
  { group: "Together", id: "tasks", name: "Tasks & plans", icon: ListTodo },
  { group: "Together", id: "inventory", name: "Inventory", icon: Backpack },
  { group: "Together", id: "resources", name: "Resources", icon: Construction },
  {
    group: "Together",
    id: "collaboration",
    name: "Collaboration",
    icon: Users,
  },
  { group: "Together", id: "activity", name: "Activity", icon: Activity },
  {
    group: "Together",
    id: "communication",
    name: "Communication",
    icon: MessageCircle,
  },
  {
    group: "Minecraft Survival",
    id: "studio",
    name: "Build studio",
    icon: Construction,
  },
  { group: "Platform", id: "games", name: "Games", icon: Gamepad2 },
  { group: "Platform", id: "extensions", name: "Extensions", icon: Plug },
  { group: "Platform", id: "community", name: "Community", icon: Users },
  { group: "Platform", id: "settings", name: "Settings", icon: Settings2 },
  { group: "Platform", id: "setup", name: "Setup", icon: Wrench },
  {
    group: "Developer",
    id: "diagnostics",
    name: "Diagnostics & logs",
    icon: Terminal,
  },
];
const descriptions: Record<string, string> = {
  overview: "A little company. A shared adventure.",
  companion: "Your companion, your pace, your way to play.",
  mission: "The goal, the next step, and anything in the way.",
  tasks: "Shared work with clear responsibilities.",
  inventory: "Everything your companion is actually carrying.",
  resources: "What you have. What you need. Who’s getting it.",
  collaboration: "A hand when it matters. A plan you both understand.",
  activity: "The adventure as it happens. No hidden thoughts.",
  communication: "Talk about the game. Or absolutely anything else.",
  studio: "Minecraft references, materials and approved construction.",
  games: "Starting in Minecraft. Open to worlds beyond.",
  extensions: "Small capabilities. New possibilities.",
  community: "Help shape the next adventure.",
  settings: "Your models, account, voice and permissions.",
  setup: "Choose a game and get ready for your first session.",
  diagnostics: "Execution evidence and local service health.",
};
function Controls({ state, mutate, busy }: Common) {
  const active = ["ACTIVE", "BUSY"].includes(state.state);
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
        <Play size={14} />
        {state.state === "PAUSED" ? "Resume companion" : "Start companion"}
      </button>
      <button
        className="button"
        disabled={!active}
        onClick={() => attempt(mutate("/control", { command: "pause" }))}
      >
        <Pause size={14} />
        Pause
      </button>
      <button
        className="button icon-button"
        aria-label="Stop and disconnect"
        title="Stop and disconnect"
        disabled={
          state.state === "DISCONNECTED" &&
          state.auth.status !== "authenticating" &&
          state.connection.status !== "connecting"
        }
        onClick={() => attempt(mutate("/control", { command: "stop" }))}
      >
        <Square size={14} />
      </button>
    </div>
  );
}
export default function App() {
  const { state, error, connected, busy, mutate, clearError } = useCompanion();
  const [page, setPage] = useState(() => {
    const saved = sessionStorage.getItem("waypoint-page");
    return navigation.some((item) => item.id === saved) ? saved! : "overview";
  });
  const [menu, setMenu] = useState(false),
    [rail, setRail] = useState(
      () => localStorage.getItem("waypoint-chat") === "open",
    );
  const navigate = (value: string) => {
    setPage(value);
    setMenu(false);
    sessionStorage.setItem("waypoint-page", value);
  };
  useEffect(() => {
    localStorage.setItem("waypoint-chat", rail ? "open" : "closed");
  }, [rail]);
  const title = navigation.find((item) => item.id === page)?.name || "Overview";
  const help =
    state?.workspace?.assistance.filter(
      (request) => request.status === "pending",
    ).length || 0;
  const name = state?.profile?.name || state?.auth.username || "Your companion";
  const common = state ? { state, mutate, busy } : null;
  return (
    <div className={`ws-shell ${rail ? "with-conversation" : ""}`}>
      <a className="skip-link" href="#workspace-main">
        Skip to workspace
      </a>
      {menu ? (
        <button
          className="ws-scrim"
          aria-label="Close navigation"
          onClick={() => setMenu(false)}
        />
      ) : null}
      <aside className={`ws-sidebar ${menu ? "open" : ""}`}>
        <button
          className="ws-brand"
          onClick={() => navigate("overview")}
          aria-label="Waypoint home"
        >
          <WaypointMark />
          <span>
            waypoint<small>AI gaming companion</small>
          </span>
        </button>
        <button className="ws-game-select" onClick={() => navigate("games")}>
          <span className="ws-game-icon">
            <Gamepad2 size={20} />
          </span>
          <span>
            Minecraft Survival<small>First supported world</small>
          </span>
          <ChevronRight size={14} />
        </button>
        <nav aria-label="Main navigation">
          {navigation.map((item, index) => {
            const Icon = item.icon;
            return (
              <div key={item.id}>
                {navigation[index - 1]?.group !== item.group ? (
                  <p className="ws-nav-label">{item.group}</p>
                ) : null}
                <button
                  className={`ws-nav-item ${page === item.id ? "selected" : ""}`}
                  aria-current={page === item.id ? "page" : undefined}
                  aria-label={item.name}
                  onClick={() => navigate(item.id)}
                >
                  <Icon size={17} />
                  <span>{item.name}</span>
                  {item.id === "collaboration" && help ? <b>{help}</b> : null}
                </button>
              </div>
            );
          })}
        </nav>
        <div className="ws-sidebar-foot">
          <span className={`status-dot ${connected ? "online" : ""}`} />
          <span>
            {connected ? "Local workspace online" : "Reconnecting…"}
            <small>Free. Open source. Yours.</small>
          </span>
        </div>
      </aside>
      <div className="ws-main-shell">
        <DesktopBar />
        <header className="ws-topbar">
          <button
            className="icon-button ws-menu"
            aria-label="Open navigation"
            onClick={() => setMenu(!menu)}
          >
            <Menu size={20} />
          </button>
          <div className="ws-breadcrumb">
            <Gamepad2 size={17} />
            <span>Minecraft Survival</span>
            <ChevronRight size={13} />
            <strong>{title}</strong>
          </div>
          <div className="ws-top-actions">
            <Badge
              tone={
                state?.connection.status === "connected" ? "green" : "muted"
              }
            >
              {state ? human(state.connection.status) : "Connecting"}
            </Badge>
            <button
              className="icon-button ws-help-button"
              aria-label={`Needs your help${help ? ` (${help})` : ""}`}
              onClick={() => navigate("collaboration")}
            >
              <Bell size={18} />
              {help ? <i /> : null}
            </button>
            <button
              className="icon-button"
              aria-label={
                rail ? "Close conversation panel" : "Open conversation panel"
              }
              aria-expanded={rail}
              onClick={() => setRail(!rail)}
            >
              <MessageCircle size={18} />
            </button>
            <button
              className="icon-button danger-text"
              aria-label="Emergency stop companion"
              title="Emergency stop companion"
              disabled={!state}
              onClick={() =>
                attempt(mutate("/control", { command: "emergency" }))
              }
            >
              <ShieldAlert size={18} />
            </button>
            <button
              className="ws-initials"
              onClick={() => navigate("companion")}
              aria-label="Companion profile"
            >
              {name.slice(0, 2).toUpperCase()}
            </button>
          </div>
        </header>
        <div className="ws-body">
          <main id="workspace-main" className="ws-content">
            <div className="ws-page-heading">
              <div>
                <span className="eyebrow">
                  {page === "studio"
                    ? "MINECRAFT MODULE"
                    : "YOUR COMPANION WORKSPACE"}
                </span>
                <h1>{title}</h1>
                <p>{descriptions[page]}</p>
              </div>
              {common ? <Controls {...common} /> : null}
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
            {state && !connected ? (
              <div className="info-note gold" role="status">
                Live updates interrupted. Showing the last received state;
                actions may be unavailable until reconnection.
              </div>
            ) : null}
            {connected && state?.world && state.workspace?.session.stale ? (
              <div className="info-note gold" role="status">
                Game observations are out of date. Inventory and position show
                the last observation; available project supplies are unverified.
              </div>
            ) : null}
            {!common ? (
              <Panel>
                <Empty title="Connecting to your workspace">
                  Start the local launcher. This page reconnects automatically.
                </Empty>
              </Panel>
            ) : (
              <>
                {page === "overview" || page === "settings" ? (
                  <SetupIssues state={state!} navigate={navigate} />
                ) : null}
                {state!.connection.projected ? (
                  <div className="info-note gold">
                    Translated connection. Inventory and construction quantities
                    are unverified; exact operations are disabled.
                  </div>
                ) : null}
                {state!.planning ? (
                  <div className="ws-session-note">
                    <Compass size={15} />
                    Offline conversation session · no game actions available
                  </div>
                ) : null}
                {page === "overview" ? (
                  <WorkspaceOverview {...common} navigate={navigate} />
                ) : null}
                {page === "mission" ? <Mission {...common} /> : null}
                {page === "resources" ? <Resources {...common} /> : null}
                {page === "inventory" ? <Inventory state={state!} /> : null}
                {page === "tasks" ? (
                  <>
                    <Mission {...common} compact />
                    <SharedTasks {...common} />
                  </>
                ) : null}
                {page === "collaboration" ? (
                  <>
                    <Assistance {...common} />
                    <SharedTasks {...common} />
                  </>
                ) : null}
                {page === "activity" ? <ActivityFeed state={state!} /> : null}
                {page === "companion" ? (
                  <>
                    <CompanionHome {...common} />
                    <details className="ws-advanced">
                      <summary>
                        Gameplay preferences, locations & operational memory
                      </summary>
                      <Companion {...common} settingsOnly />
                    </details>
                  </>
                ) : null}
                {page === "communication" ? (
                  <ConversationPane {...common} />
                ) : null}
                {page === "studio" ? <Studio {...common} /> : null}
                {page === "games" ? (
                  <Games {...common} navigate={navigate} />
                ) : null}
                {page === "extensions" ? <Extensions {...common} /> : null}
                {page === "community" ? <Community /> : null}
                {page === "diagnostics" ? <Diagnostics {...common} /> : null}
                {page === "settings" ? (
                  <Settings {...common} navigate={navigate} />
                ) : null}
                {page === "setup" ? (
                  <>
                    <div className="ws-session-note">
                      <Gamepad2 size={16} />
                      Selected game: Minecraft Survival ·{" "}
                      <button
                        className="text-button"
                        onClick={() => navigate("games")}
                      >
                        View games
                      </button>
                    </div>
                    <Setup {...common} navigate={navigate} />
                  </>
                ) : null}
                {page !== "setup" ? (
                  <VoiceBridge state={state!} mutate={mutate} />
                ) : null}
                <footer className="ws-footer">
                  <span>
                    <i className={`status-dot ${connected ? "online" : ""}`} />
                    {connected
                      ? "Connected to local runtime"
                      : "Live updates reconnecting"}
                  </span>
                  <span>Waypoint · Minecraft Survival · early access</span>
                </footer>
              </>
            )}
          </main>
          {rail && common ? (
            <aside
              className="ws-conversation-rail"
              aria-label="Companion conversation"
            >
              <div className="ws-rail-heading">
                <span>Stay in the conversation</span>
                <button
                  className="icon-button"
                  aria-label="Close conversation panel"
                  onClick={() => setRail(false)}
                >
                  <X size={16} />
                </button>
              </div>
              <ConversationPane {...common} compact />
            </aside>
          ) : null}
        </div>
      </div>
    </div>
  );
}
