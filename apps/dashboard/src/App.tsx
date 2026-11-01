import { useEffect, useRef, useState } from "react";
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
import ToolMenu from "./ToolMenu";
import SessionStage from "./SessionStage";
import ResourceWorkbench from "./ResourceWorkbench";
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
    [conversation, setConversation] = useState(false);
  const conversationDialog = useRef<HTMLDialogElement>(null);
  const navigate = (id: string) => {
    setPage(id);
    setMenu(false);
    setConversation(false);
    sessionStorage.setItem("waypoint-page", id);
    requestAnimationFrame(() =>
      document.querySelector<HTMLElement>("#workspace-main h1")?.focus(),
    );
  };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setMenu((value) => !value);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    if (conversation) conversationDialog.current?.showModal();
    else conversationDialog.current?.close();
  }, [conversation]);
  const title = navigation.find((item) => item.id === page)?.name || "Overview";
  const common = state ? { state, mutate, busy } : null;
  const pending =
    state?.workspace?.assistance.filter(
      (request) => request.status === "pending",
    ).length || 0;
  return (
    <div className="play-desk">
      <a className="skip-link" href="#workspace-main">
        Skip to workspace
      </a>
      <DesktopBar />
      <header className="play-header">
        <button
          className="play-wordmark"
          onClick={() => navigate("overview")}
          aria-label="Waypoint home"
        >
          <WaypointMark />
          <span>waypoint</span>
        </button>
        <button
          className="play-session-select"
          onClick={() => navigate("games")}
        >
          <Gamepad2 size={17} />
          <span>{state?.workspace?.game.name || "Minecraft Survival"}</span>
          <ChevronRight size={14} />
        </button>
        <span className="play-connection">
          <i
            className={state?.connection.status === "connected" ? "online" : ""}
          />
          {state
            ? state.connection.status !== "connected" &&
              state.state === "ACTIVE"
              ? "Offline planning"
              : human(state.connection.status)
            : "Connecting"}
        </span>
        <div className="play-header-tools">
          <button className="text-button" onClick={() => navigate("settings")}>
            Settings
          </button>
          <button
            className="button play-tools-button"
            aria-label="Open navigation"
            aria-keyshortcuts="Control+k Meta+k"
            aria-haspopup="dialog"
            onClick={() => setMenu(true)}
          >
            <Menu size={16} />
            <span>Navigation</span>
          </button>
          <kbd className="navigation-shortcut" aria-hidden="true">
            Ctrl K
          </kbd>
        </div>
      </header>
      <main id="workspace-main" className={`play-main page-${page}`}>
        <div className="play-workarea-heading">
          <h1 tabIndex={-1}>{title}</h1>
          {common ? (
            <>
              <Controls {...common} />
              <button
                className="icon-button danger-text"
                aria-label="Emergency stop companion"
                title="Emergency stop companion"
                onClick={() =>
                  attempt(mutate("/control", { command: "emergency" }))
                }
              >
                <ShieldAlert size={17} />
              </button>
            </>
          ) : null}
        </div>
        {error ? (
          <div className="error-banner" role="alert">
            <ShieldAlert size={18} />
            <span>{error}</span>
            <button aria-label="Dismiss error" onClick={clearError}>
              <X size={17} />
            </button>
          </div>
        ) : null}
        {state && !connected ? (
          <div className="info-note gold" role="status">
            Live updates interrupted. Showing the last received state; actions
            may be unavailable until reconnection.
          </div>
        ) : null}
        {connected && state?.world && state.workspace?.session.stale ? (
          <div className="info-note gold" role="status">
            Game observations are out of date. Inventory and position show the
            last observation; project supplies need rechecking.
          </div>
        ) : null}
        {state?.connection.projected ? (
          <div className="info-note gold">
            Translated connection. Exact inventory and construction are
            unavailable.
          </div>
        ) : null}
        {!common ? (
          <div className="play-loading">
            <span className="eyebrow">LOCAL CONNECTION</span>
            <h2>Opening your play desk.</h2>
            <p>Start the local launcher if this takes more than a moment.</p>
          </div>
        ) : (
          <>
            {page === "overview" || page === "settings" ? (
              <SetupIssues state={state!} navigate={navigate} />
            ) : null}
            {page === "overview" ? (
              <SessionStage
                {...common}
                navigate={navigate}
                talk={() => setConversation(true)}
              />
            ) : null}
            {page === "mission" ? <Mission {...common} /> : null}
            {page === "resources" ? (
              <ResourceWorkbench
                {...common}
                onOpenStudio={() => navigate("studio")}
              />
            ) : null}
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
            {page === "communication" ? <ConversationPane {...common} /> : null}
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
              <Setup {...common} navigate={navigate} />
            ) : null}
            {page !== "setup" ? (
              <details className="play-voice" open={page === "communication"}>
                <summary>
                  Voice connection{" "}
                  <span>
                    {state!.voice.available
                      ? "Local voice available"
                      : "Setup needed"}
                  </span>
                </summary>
                <VoiceBridge state={state!} mutate={mutate} />
              </details>
            ) : null}
          </>
        )}
        <footer className="play-footer">
          <span>
            {connected
              ? "Connected to local runtime"
              : "Live updates reconnecting"}
          </span>
          <span>Waypoint · early access</span>
        </footer>
      </main>
      <nav className="play-dock" aria-label="Play desk">
        {[
          ["overview", "Session"],
          ["mission", "Plan"],
          ["resources", "Supplies"],
          ["communication", "Talk"],
        ].map(([id, label]) => (
          <button
            key={id}
            aria-current={page === id ? "page" : undefined}
            onClick={() => navigate(id)}
          >
            <span>{label}</span>
          </button>
        ))}
        <button
          className={pending ? "has-request" : ""}
          onClick={() => navigate("collaboration")}
        >
          {pending ? <b>{pending}</b> : null}
          <span>Together</span>
        </button>
        <button
          className="play-talk-toggle"
          aria-label="Open conversation panel"
          onClick={() => setConversation(true)}
        >
          <MessageCircle size={18} />
        </button>
      </nav>
      <ToolMenu
        open={menu}
        close={() => setMenu(false)}
        navigate={navigate}
        items={navigation}
      />
      <dialog
        className="conversation-sheet"
        ref={conversationDialog}
        onClose={() => setConversation(false)}
        aria-label="Companion conversation"
      >
        <header>
          <span>On the same channel.</span>
          <button
            className="icon-button"
            aria-label="Close conversation panel"
            onClick={() => setConversation(false)}
          >
            <X size={20} />
          </button>
        </header>
        {error ? (
          <div className="error-banner" role="alert">
            <ShieldAlert size={18} />
            <span>{error}</span>
            <button
              aria-label="Dismiss conversation error"
              onClick={clearError}
            >
              <X size={17} />
            </button>
          </div>
        ) : null}
        {common ? (
          <aside aria-label="Companion conversation">
            <ConversationPane {...common} />
          </aside>
        ) : null}
      </dialog>
    </div>
  );
}
