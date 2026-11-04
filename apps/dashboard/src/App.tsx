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
import PlayerTwoMark from "../../../packages/ui/PlayerTwoMark";
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
  Mission,
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
    id: "session",
    name: "Session",
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
    const stored =
      sessionStorage.getItem("player-two-page") ??
      sessionStorage.getItem("waypoint-page");
    const saved = stored === "overview" ? "session" : stored;
    return navigation.some((item) => item.id === saved) ? saved! : "session";
  });
  const [menu, setMenu] = useState(false),
    [conversation, setConversation] = useState(false);
  const conversationDialog = useRef<HTMLDialogElement>(null);
  const navigate = (id: string) => {
    setPage(id);
    setMenu(false);
    setConversation(false);
    sessionStorage.setItem("player-two-page", id);
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
  const title = navigation.find((item) => item.id === page)?.name || "Session";
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
          onClick={() => navigate("session")}
          aria-label="Player Two home"
        >
          <PlayerTwoMark />
          <span>Player Two</span>
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
            aria-label="More tools"
            aria-keyshortcuts="Control+k Meta+k"
            aria-haspopup="dialog"
            onClick={() => setMenu(true)}
          >
            <Menu size={16} />
            <span>More tools</span>
          </button>
          <kbd className="navigation-shortcut" aria-hidden="true">
            Ctrl K
          </kbd>
        </div>
      </header>
      <main id="workspace-main" className={`play-main page-${page}`}>
        <nav className="console-tools" aria-label="Companion tools">
          {[
            ["session", "Session", Gamepad2],
            ["tasks", "Tasks", ListTodo],
            ["inventory", "Inventory", Backpack],
            ["resources", "Resources", Construction],
            ["studio", "Build studio", Wrench],
            ["communication", "Chat", MessageCircle],
            ["collaboration", "Help & teamwork", Users],
            ["companion", "My companion", HeartHandshake],
          ].map(([id, label, Icon]) => {
            const ToolIcon = Icon as typeof Gamepad2;
            return (
              <button
                key={id as string}
                aria-current={page === id ? "page" : undefined}
                onClick={() => navigate(id as string)}
              >
                <ToolIcon size={17} />
                <span>{label as string}</span>
                {id === "collaboration" && pending > 0 ? (
                  <b aria-hidden="true" title={pending + " pending requests"}>
                    {pending}
                  </b>
                ) : null}
              </button>
            );
          })}
        </nav>
        <div className="play-workarea-heading">
          <h1 tabIndex={-1}>{title}</h1>
          {common ? (
            <>
              <Controls {...common} />
              <button
                className="icon-button"
                aria-label="Open conversation panel"
                title="Open conversation panel"
                onClick={() => setConversation(true)}
              >
                <MessageCircle size={17} />
              </button>
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
            {page === "session" || page === "settings" ? (
              <SetupIssues state={state!} navigate={navigate} />
            ) : null}
            {page === "session" ? (
              <div className="console-session">
                <div className="console-session-work">
                  <SessionStage
                    {...common}
                    navigate={navigate}
                    talk={() =>
                      document
                        .querySelector<HTMLTextAreaElement>(
                          ".console-session-chat textarea",
                        )
                        ?.focus()
                    }
                  />
                </div>
                <aside
                  className="console-session-chat"
                  aria-label="Talk to your companion"
                >
                  <ConversationPane {...common} compact />
                </aside>
              </div>
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
          <span>Player Two · early access</span>
        </footer>
      </main>
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
          <span>Companion chat</span>
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
