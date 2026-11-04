import { lazy, Suspense, useMemo } from "react";
import {
  ArrowRight,
  MessageCircle,
  Navigation,
  ShieldAlert,
} from "lucide-react";
import { Assistance } from "./Workspace";
import { human, ItemIcon, time, type Common } from "./shared";

const BuildPreview = lazy(() => import("./BuildPreview"));

export default function SessionStage({
  state,
  mutate,
  busy,
  navigate,
  talk,
}: Common & { navigate: (page: string) => void; talk: () => void }) {
  const workspace = state.workspace;
  const activity = workspace?.activity;
  const progress = activity?.progress;
  const paused = state.state === "PAUSED";
  const disconnected = state.connection.status !== "connected";
  const blocked =
    !paused &&
    !disconnected &&
    ["blocked", "waiting for player", "recovering"].includes(
      activity?.state || "",
    );
  const context = paused
    ? "paused"
    : disconnected
      ? "disconnected"
      : blocked
        ? "blocked"
        : (activity?.state || "idle").replaceAll(" ", "-");
  const descriptor = state.currentTask?.descriptor;
  const itemName =
    descriptor?.args?.item ||
    descriptor?.args?.block ||
    descriptor?.args?.name ||
    (descriptor?.tool === "chop_tree" && descriptor.args?.species
      ? `${descriptor.args.species.replace(/_log$/, "")}_log`
      : null);
  const project = state.projects.find(
    (project) => project.id === workspace?.mission?.id,
  );
  const blueprint = useMemo(
    () => project?.blueprint,
    [project?.id, project?.revision],
  );
  const gathering = context === "gathering";
  const exploring = ["exploring", "navigating"].includes(context);
  const building = context === "building" && blueprint;
  const title = paused
    ? "Companion paused"
    : disconnected
      ? "Companion disconnected"
      : blocked
        ? "Action needed"
        : context === "idle"
          ? "Ready for a task"
          : context === "planning"
            ? "Thinking through the plan."
            : activity?.label || "What shall we do?";
  const actionDescriptions: Record<string, string> = {
    chop_tree: "Chopping trees for the current goal.",
    gather_blocks: "Collecting blocks for the current goal.",
    craft_item: "Making the items in the current plan.",
    resume_approved_build: "Working through the approved blueprint.",
    explore_nearby:
      "Checking nearby terrain within the approved exploration boundary.",
  };
  const description = paused
    ? "Your place in the plan is saved. Resume when you’re ready to play."
    : disconnected
      ? "Start the companion to join your selected Realm, or use chat to plan offline."
      : descriptor && activity?.detail === descriptor.tool?.replaceAll("_", " ")
        ? actionDescriptions[descriptor.tool] || activity?.detail
        : activity?.detail;
  const carried =
    state.world?.inventory.filter(
      (item) => item.slot >= 9 && item.slot <= 44,
    ) || [];
  const counts = Object.entries(
    carried.reduce<Record<string, number>>((result, item) => {
      result[item.name] = (result[item.name] || 0) + item.count;
      return result;
    }, {}),
  ).slice(0, 6);
  const position = state.world?.position;
  const requests =
    workspace?.assistance.filter((request) => request.status === "pending") ||
    [];
  const fraction =
    progress && progress.total > 0
      ? Math.min(1, Math.max(0, progress.completed / progress.total))
      : null;
  return (
    <>
      <section
        className={`session-stage context-${context}`}
        aria-label="Active companion session"
      >
        <div className="stage-kicker">
          <span className="session-signal" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span>{state.profile?.name || "Your companion"}</span>
          <span className="stage-state">{human(context)}</span>
        </div>
        <div className="stage-composition">
          <div className="stage-story">
            <span className="eyebrow">
              {workspace?.mission && workspace.mission.title !== title
                ? "Working toward"
                : "Current activity"}
            </span>
            {workspace?.mission && workspace.mission.title !== title ? (
              <button
                className="stage-mission"
                onClick={() => navigate("mission")}
              >
                {workspace.mission.title}
                <ArrowRight size={15} />
              </button>
            ) : null}
            <h2>{title}</h2>
            <p>{description}</p>
            <div className="stage-actions">
              <button className="button primary" onClick={talk}>
                <MessageCircle size={17} />
                {disconnected ? "Talk about a plan" : "Talk to companion"}
              </button>
              <button
                className="text-button"
                onClick={() => navigate(disconnected ? "setup" : "mission")}
              >
                {disconnected ? "Check your setup" : "Open the plan"}
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
          <div className="stage-focus">
            {gathering ? (
              <div className="gathering-object">
                <span className="eyebrow">
                  {itemName ? human(itemName) : "CURRENT RESOURCE"}
                </span>
                <div className="gathering-orbit">
                  {fraction !== null ? (
                    <svg
                      className="gathering-ring"
                      viewBox="0 0 120 120"
                      aria-hidden="true"
                    >
                      <circle className="ring-track" cx="60" cy="60" r="54" />
                      <circle
                        className="ring-value"
                        cx="60"
                        cy="60"
                        r="54"
                        pathLength="100"
                        strokeDasharray={`${fraction * 100} 100`}
                      />
                    </svg>
                  ) : null}
                  {itemName ? (
                    <ItemIcon key={itemName} name={itemName} />
                  ) : null}
                </div>
                {progress ? (
                  <>
                    <div className="gathering-count">
                      <strong>{progress.completed}</strong>
                      <span>/ {progress.total}</span>
                    </div>
                    <span>{progress.unit}</span>
                    <p>{progress.basis}</p>
                  </>
                ) : (
                  <p>
                    Gathering is underway. A verified count will appear when the
                    action reports one.
                  </p>
                )}
              </div>
            ) : building ? (
              <div className="stage-blueprint">
                <span className="eyebrow">SAVED DESIGN · {project?.name}</span>
                <Suspense fallback={<p>Opening the saved blueprint…</p>}>
                  <BuildPreview
                    blueprint={blueprint!}
                    checkpoint={project?.checkpoint}
                  />
                </Suspense>
              </div>
            ) : exploring && position ? (
              <div className="stage-location">
                <Navigation size={34} />
                <span className="eyebrow">LAST OBSERVED POSITION</span>
                <div className="coordinate-readout">
                  {(["x", "y", "z"] as const).map((axis) => (
                    <span key={axis}>
                      <small>{axis.toUpperCase()}</small>
                      <strong>{Math.floor(position[axis])}</strong>
                    </span>
                  ))}
                </div>
                <p>
                  {human(state.world?.dimension)} ·{" "}
                  {time(state.world!.observedAt)}
                </p>
                <small>Position observation, not a live map.</small>
              </div>
            ) : blocked ? (
              <div className="stage-blocker">
                <ShieldAlert size={35} />
                <span className="eyebrow">LET’S GET THIS UNSTUCK</span>
                <h3>
                  {requests[0]?.title || "The current step needs attention."}
                </h3>
                <p>
                  {requests[0]?.detail ||
                    state.connection.error ||
                    "Open the plan to review the failed step and saved actions."}
                </p>
                <button
                  className="text-button"
                  onClick={() => navigate("collaboration")}
                >
                  Review what’s needed <ArrowRight size={16} />
                </button>
              </div>
            ) : null}
          </div>
        </div>
        {fraction !== null ? (
          <div className="stage-progress">
            <div
              className="stage-progress-track"
              role="progressbar"
              aria-label="Current action progress"
              aria-valuemin={0}
              aria-valuemax={progress!.total}
              aria-valuenow={progress!.completed}
            >
              <i style={{ width: `${fraction * 100}%` }} />
            </div>
            <span>
              {progress!.completed} of {progress!.total} {progress!.unit} ·{" "}
              {progress!.basis}
            </span>
          </div>
        ) : null}
        <div className="stage-next">
          <span className="eyebrow">Up next</span>
          <p>
            {paused
              ? "Explicit resume before further actions."
              : disconnected
                ? "Connect when you want to play. Offline planning is available."
                : activity?.next[0] ||
                  "No next step queued. Tell your companion what you have in mind."}
          </p>
          <button
            aria-label="View upcoming tasks"
            onClick={() => navigate("tasks")}
          >
            <ArrowRight size={20} />
          </button>
        </div>
      </section>
      {state.world ? (
        <div className="session-world" aria-label="Observed game context">
          <span>{human(state.world.dimension)}</span>
          <span>
            Health <strong>{state.world.health} / 20</strong>
          </span>
          <span>
            Food <strong>{state.world.food} / 20</strong>
          </span>
          <span>
            Position{" "}
            <strong>
              {Math.floor(position!.x)}, {Math.floor(position!.y)},{" "}
              {Math.floor(position!.z)}
            </strong>
          </span>
          <span>Observed {time(state.world.observedAt)}</span>
        </div>
      ) : null}
      {requests.length ? (
        <div className="stage-assistance">
          <Assistance state={state} mutate={mutate} busy={busy} compact />
        </div>
      ) : null}
      <section className="session-pocket" aria-label="Carried supplies">
        <div>
          <span className="eyebrow">In the backpack</span>
          <h3>
            {state.world
              ? `${carried.length} of 36 slots occupied`
              : "Not in the world yet"}
          </h3>
          <small>
            {state.world
              ? `Observed ${time(state.world.observedAt)}${state.world.inventoryExact === false ? " · translated, unverified" : ""}`
              : "Inventory appears after a real connection."}
          </small>
        </div>
        <div className="pocket-items">
          {counts.map(([name, count]) => (
            <button
              key={name}
              onClick={() => navigate("inventory")}
              title={`${count} ${human(name)}`}
            >
              <ItemIcon name={name} />
              <span>{count}</span>
              <small>{human(name)}</small>
            </button>
          ))}
        </div>
        <button className="text-button" onClick={() => navigate("inventory")}>
          Open inventory <ArrowRight size={16} />
        </button>
      </section>
    </>
  );
}
