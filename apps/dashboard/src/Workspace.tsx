import { useEffect, useState } from "react";
import {
  Activity,
  ArrowRight,
  Backpack,
  Check,
  CheckCircle2,
  Compass,
  Gamepad2,
  Heart,
  HeartHandshake,
  Layers3,
  MapPin,
  MessageCircle,
  Package,
  Plug,
  RefreshCw,
  Search,
  Target,
} from "lucide-react";
import type { CompanionState } from "../../../packages/shared-types";
import type { WorkProgress } from "../../../packages/game-adapters";
import { api } from "./api";
import {
  attempt,
  Badge,
  Empty,
  human,
  ItemIcon,
  Panel,
  time,
  type Common,
} from "./shared";
import { CompanionAvatar, ModePicker } from "./CompanionHome";

export const projectUrl = "https://github.com/alfonza1/minecraft-companion";
export function Resources({ state }: Common) {
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [sort, setSort] = useState("missing"),
    [kind, setKind] = useState("raw");
  const rows = (state.workspace?.resources || [])
    .filter(
      (row) =>
        row.kind === kind &&
        human(row.name).toLowerCase().includes(query.toLowerCase()) &&
        (filter === "all" ||
          (filter === "needed" && (row.missing === null || row.missing > 0)) ||
          (filter === "gathering" && row.gathering) ||
          (filter === "completed" && (row.remainingToPlace === 0 || row.missing === 0)) ||
          (filter === "player" && row.userAssigned > 0) ||
          (filter === "companion" && row.agentAssigned > 0)),
    )
    .sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name)
        : sort === "progress"
          ? b.verifiedPlaced / Math.max(1, b.required) -
            a.verifiedPlaced / Math.max(1, a.required)
          : (b.missing ?? Infinity) - (a.missing ?? Infinity),
    );
  return (
    <>
      <div className="ws-resource-heading">
        <Package size={25} />
        <div>
          <h2>The resource command center</h2>
          <p>
            Placed blocks, carried supplies and your contributions stay
            separate.
          </p>
        </div>
        <Badge>
          {state.world?.inventoryExact === false
            ? "Unverified inventory"
            : state.world
              ? "Inventory observed"
              : "Inventory unknown"}
        </Badge>
      </div>
      <div className="ws-filter-pills" aria-label="Resource accounting view">
        <button
          className={kind === "raw" ? "selected" : ""}
          aria-pressed={kind === "raw"}
          onClick={() => setKind("raw")}
        >
          Raw gathering plan
        </button>
        <button
          className={kind === "placement" ? "selected" : ""}
          aria-pressed={kind === "placement"}
          onClick={() => setKind("placement")}
        >
          Finished building items
        </button>
      </div>
      <p className="note">
        Alternative views of the same design. Do not add raw ingredients and
        their crafted products together.
      </p>
      <div className="section-toolbar">
        <label className="search-field">
          <Search size={16} />
          <input
            aria-label="Search resources"
            placeholder="Find a material…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label className="ws-sort">
          Sort
          <select
            aria-label="Sort resources"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="missing">Amount missing</option>
            <option value="progress">Build progress</option>
            <option value="name">Name</option>
          </select>
        </label>
      </div>
      <div className="ws-filter-pills">
        {["all", "needed", "gathering", "completed", "player", "companion"].map(
          (value) => (
            <button
              key={value}
              className={filter === value ? "selected" : ""}
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {value === "player"
                ? "Assigned to you"
                : value === "companion"
                  ? "Assigned to companion"
                  : human(value)}
            </button>
          ),
        )}
      </div>
      {rows.length ? (
        <div className="ws-resource-grid">
          {rows.map((row) => (
            <article className="ws-resource-card" key={row.id}>
              <header>
                <div className="ws-item-pedestal">
                  <ItemIcon name={row.name} />
                </div>
                <div>
                  <h3>{human(row.name)}</h3>
                  <small>
                    {row.required.toLocaleString()}{" "}
                    {kind === "raw" ? "raw ingredients" : "building items"} ·{" "}
                    {row.projectName}
                  </small>
                </div>
                <Badge
                  tone={
                    row.gathering ? "green" : row.missing ? "gold" : "muted"
                  }
                >
                  {row.gathering
                    ? "Gathering"
                    : row.remainingToPlace === 0
                      ? "Built"
                      : row.missing === null
                        ? "Unknown"
                        : row.missing
                          ? "Needed"
                          : "Stock ready"}
                </Badge>
              </header>
              <Progress
                progress={{
                  completed: Math.min(row.required, row.verifiedPlaced + (row.availableForProject || 0)),
                  total: row.required,
                  unit: "accounted for",
                  basis:
                    kind === "raw"
                      ? "Recipe-derived demand covered by verified construction plus inventory allocated to this project. Construction is not attributed to either player."
                      : "Verified construction plus inventory allocated to this project; retained when supplies are consumed.",
                }}
              />
              <p className="note">{row.verifiedPlaced} covered by construction · {row.availableForProject ?? "unknown"} available from inventory.</p>
              <div className="ws-resource-numbers">
                <div>
                  <strong>{row.inventory ?? "—"}</strong>
                  <small>Carried</small>
                </div>
                <div>
                  <strong>{row.storage}</strong>
                  <small>Storage snapshot</small>
                </div>
                <div>
                  <strong>{row.missing ?? "—"}</strong>
                  <small>Missing carried stock</small>
                </div>
              </div>
              <dl className="ws-accounting">
                <div>
                  <dt>Your assignment</dt>
                  <dd>
                    {row.userAssigned} · {row.userReported} reported
                  </dd>
                </div>
                <div>
                  <dt>Companion assignment</dt>
                  <dd>
                    {row.agentAssigned} · {row.agentAllocated} last reconciled
                  </dd>
                </div>
                <div>
                  <dt>Reserved elsewhere</dt>
                  <dd>{row.reservedElsewhere}</dd>
                </div>
              </dl>
              <p className="note">{row.reason}</p>
              <details>
                <summary>Accounting & provenance</summary>
                <p className="note">
                  {row.source}. Storage is last observed, not a promise of
                  accessible stock. Your reported contributions are not added to
                  inventory. Build progress counts placements, not promises.
                </p>
                <p className="note">
                  Storage checked:{" "}
                  {row.storageObservedAt
                    ? new Date(row.storageObservedAt).toLocaleString()
                    : "not observed"}
                </p>
              </details>
            </article>
          ))}
        </div>
      ) : (
        <Panel>
          <Empty
            icon={Package}
            title={
              state.workspace?.resources.length
                ? "No matching materials"
                : "Give the supplies a purpose"
            }
          >
            Create or select a building project to calculate real quantities.
            Adjust responsibilities in Collaboration.
          </Empty>
        </Panel>
      )}
      <Panel
        title="Production requirements"
        eyebrow="FROM RAW MATERIAL TO FINISHED BLOCK"
      >
        {state.projects
          .filter((project) => project.materials)
          .map((project) => (
            <details key={project.id}>
              <summary>{project.name} · recipe-derived requirements</summary>
              <p className="note">
                The plan uses version-specific recipes and their yields.
                Temporary scaffolding is handled separately by the build
                executor.
              </p>
              <div className="ws-recipe-list">
                {(Array.isArray(project.materials?.raw)
                  ? project.materials.raw
                  : []
                ).map((row: any, index: number) => (
                  <div key={row.name || index}>
                    <ItemIcon name={row.name} />
                    <strong>{human(row.name)}</strong>
                    <span>{row.quantity}</span>
                  </div>
                ))}
              </div>
              <p className="note">
                Open Build studio’s material calculator for crafting
                prerequisites and source uncertainty.
              </p>
            </details>
          ))}
      </Panel>
    </>
  );
}
export function ActivityFeed({
  state,
  compact = false,
}: {
  state: CompanionState;
  compact?: boolean;
}) {
  const [filter, setFilter] = useState("all");
  const tasks = state.tasks
    .filter((task) => filter === "all" || task.status === filter)
    .slice(compact ? -5 : -50)
    .reverse();
  return (
    <Panel title="Along the way" eyebrow="OBSERVED EXECUTION">
      {!compact ? (
        <div className="ws-filter-pills">
          {["all", "running", "completed", "blocked", "interrupted"].map(
            (value) => (
              <button
                key={value}
                aria-pressed={filter === value}
                className={filter === value ? "selected" : ""}
                onClick={() => setFilter(value)}
              >
                {human(value)}
              </button>
            ),
          )}
        </div>
      ) : null}
      {tasks.length ? (
        <div className="ws-activity-feed">
          {tasks.map((task) => (
            <article key={task.id}>
              <span className={`ws-activity-symbol ${task.status}`}>
                {task.status === "completed" ? (
                  <Check size={16} />
                ) : (
                  <Activity size={16} />
                )}
              </span>
              <div>
                <strong>{human(task.name || task.tool)}</strong>
                <p>
                  {task.summary ||
                    task.result?.message ||
                    `${human(task.status)} ${task.descriptor?.args?.item ? human(task.descriptor.args.item) : ""}`}
                </p>
                <small>
                  {task.endedAt || task.startedAt
                    ? new Date(task.endedAt || task.startedAt).toLocaleString()
                    : "Time not recorded"}
                </small>
              </div>
              <Badge>{human(task.status)}</Badge>
            </article>
          ))}
        </div>
      ) : (
        <Empty icon={Activity} title="Your adventure will leave a trail">
          Task starts, completed actions and blockers appear here. Technical
          logs stay in Diagnostics.
        </Empty>
      )}
    </Panel>
  );
}
export function Games({
  state,
  mutate,
  busy,
  navigate,
}: Common & { navigate: (page: string) => void }) {
  const game = state.workspace?.game;
  return (
    <>
      <div className="ws-games-intro">
        <Gamepad2 size={33} />
        <h2>
          One companion.
          <br />
          New worlds ahead.
        </h2>
        <p>
          Minecraft Survival is our first environment. Future integrations need
          real adapters, permissions and gameplay validation.
        </p>
      </div>
      <article className="ws-game-card">
        <div className="ws-game-landscape" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
          <span>
            <Gamepad2 size={70} />
          </span>
        </div>
        <div>
          <span className="eyebrow">AVAILABLE · EARLY ACCESS</span>
          <h2>{game?.name || "Minecraft Survival"}</h2>
          <p>
            Gather, craft, build and share the adventure with an AI companion.
            Secure Microsoft account login, local voice and a workspace
            connected to real game events.
          </p>
          <div className="ws-capabilities">
            {(game?.capabilities || []).map((capability) => (
              <span key={capability}>{human(capability)}</span>
            ))}
          </div>
          <p className="note">
            Windows is the full desktop/Realm target. Other platforms support
            experimental offline planning. A licensed bot account is required.
          </p>
          <button
            className="button primary"
            disabled={busy}
            onClick={() =>
              attempt(
                mutate("/workspace/game", {
                  gameId: "minecraft-survival",
                }).then(() =>
                  navigate(state.settings.realmId ? "overview" : "setup"),
                ),
              )
            }
          >
            Open Minecraft workspace <ArrowRight size={15} />
          </button>
        </div>
      </article>
      <Panel title="Future worlds" eyebrow="COMMUNITY RESEARCH">
        <div className="ws-future-worlds">
          {[
            [
              "Survival & crafting",
              "Resource management, discovery and shared shelters.",
            ],
            [
              "Strategy & tactics",
              "Planning, objectives and decisions made together.",
            ],
            [
              "Cooperative adventures",
              "Quests, teamwork and stories worth remembering.",
            ],
          ].map(([name, detail]) => (
            <div key={name}>
              <Compass size={22} />
              <h3>{name}</h3>
              <p>{detail}</p>
              <Badge>Proposal category · not playable</Badge>
            </div>
          ))}
        </div>
        <a
          className="button"
          href={`${projectUrl}/issues/new?template=game-integration.yml`}
          target="_blank"
          rel="noreferrer"
        >
          Propose a game integration <ArrowRight size={14} />
        </a>
      </Panel>
    </>
  );
}
export function Extensions({ state, busy }: Common) {
  const [extensions, setExtensions] = useState<any[]>([]),
    [error, setError] = useState(""),
    [result, setResult] = useState<unknown>(null),
    [running, setRunning] = useState(false);
  useEffect(() => {
    let live = true;
    api("/extensions")
      .then((data) => {
        if (live)
          setExtensions(Array.isArray(data) ? data : data.extensions || []);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, []);
  const run = async (id: string) => {
    setError("");
    setRunning(true);
    try {
      setResult(await api(`/extensions/${id}/run`, {}));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
    }
  };
  return (
    <Panel
      title="Small tools. Real capabilities."
      eyebrow="INSTALLED EXTENSIONS"
    >
      <p className="note">
        These trusted extensions are installed with the application. Importing
        arbitrary executable plugins is not supported.
      </p>
      {error ? (
        <p role="alert" className="inline-error">
          {error}
        </p>
      ) : null}
      {extensions.map((extension) => (
        <article className="ws-extension" key={extension.id}>
          <Plug size={24} />
          <div>
            <h3>{extension.name || extension.id}</h3>
            <p>{extension.description}</p>
            <small>
              Contract version {extension.apiVersion} · {extension.kind}
            </small>
          </div>
          <button
            className="button"
            disabled={
              busy || running || !["ACTIVE", "BUSY"].includes(state.state)
            }
            onClick={() => void run(extension.id)}
          >
            Inspect current state
          </button>
        </article>
      ))}
      {result ? (
        <pre className="diagnostic-output">
          {JSON.stringify(result, null, 2)}
        </pre>
      ) : null}
      <a
        className="text-button"
        href={`${projectUrl}/blob/feat/minecraft-companion/docs/EXTENSIONS.md`}
        target="_blank"
        rel="noreferrer"
      >
        Build an extension <ArrowRight size={14} />
      </a>
    </Panel>
  );
}
export function Community() {
  return (
    <>
      <div className="ws-community-hero">
        <HeartHandshake size={36} />
        <h2>
          Better company.
          <br />
          Built together.
        </h2>
        <p>
          Players, tinkerers and developers are welcome. Help make a companion
          you actually enjoy playing with.
        </p>
        <a
          className="button primary"
          href={`${projectUrl}/blob/feat/minecraft-companion/CONTRIBUTING.md`}
          target="_blank"
          rel="noreferrer"
        >
          Find your first contribution <ArrowRight size={15} />
        </a>
      </div>
      <div className="ws-future-worlds">
        {[
          [
            "Suggest a world",
            "Investigate supported automation and game permissions before starting an adapter.",
            "issues/new?template=game-integration.yml",
          ],
          [
            "Make the teammate better",
            "Improve existing survival skills, voice, memories or workspace interactions.",
            "issues",
          ],
          [
            "Explore the engineering",
            "Read the architecture, inspect measured tests and propose an experiment.",
            "blob/feat/minecraft-companion/docs/ARCHITECTURE.md",
          ],
        ].map(([name, text, path]) => (
          <Panel title={name} key={name}>
            <p>{text}</p>
            <a
              className="text-button"
              href={`${projectUrl}/${path}`}
              target="_blank"
              rel="noreferrer"
            >
              Explore <ArrowRight size={14} />
            </a>
          </Panel>
        ))}
      </div>
      <p className="note">
        Community ideas are proposals, not announced integrations. No fabricated
        votes, launch dates or contributor counts.
      </p>
    </>
  );
}
export function Diagnostics({ state }: Common) {
  const [query, setQuery] = useState(""),
    [level, setLevel] = useState("all"),
    [health, setHealth] = useState<any>(null),
    [error, setError] = useState("");
  const logs = state.logs
    .filter(
      (log) =>
        (level === "all" || log.level === level) &&
        log.message.toLowerCase().includes(query.toLowerCase()),
    )
    .slice()
    .reverse();
  return (
    <>
      <Panel
        title="Local service health"
        action={
          <button
            className="button"
            onClick={() =>
              void api("/health")
                .then(setHealth)
                .catch((e) => setError(e.message))
            }
          >
            <RefreshCw size={15} />
            Run check
          </button>
        }
      >
        <div className="ws-diagnostic-summary">
          <Badge>{human(state.state)}</Badge>
          <span>
            {state.ai?.provider || "codex"} ·{" "}
            {state.ai?.modelState?.active?.model ||
              state.ai?.modelState?.last?.model ||
              "No model run recorded"}
          </span>
          <span>
            {state.usage.requests} requests ·{" "}
            {(
              state.usage.inputTokens + state.usage.outputTokens
            ).toLocaleString()}{" "}
            reported tokens
          </span>
        </div>
        {error ? <p role="alert">{error}</p> : null}
        {health ? (
          <pre className="diagnostic-output">
            {JSON.stringify(health, null, 2)}
          </pre>
        ) : null}
        <p className="note">
          Token counts are reported usage, not an account balance or estimated
          bill. Raw model thoughts are never shown.
        </p>
      </Panel>
      <Panel title="Execution timings">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Stage</th>
                <th>Median</th>
                <th>P95</th>
                <th>Runs</th>
                <th>Failures</th>
              </tr>
            </thead>
            <tbody>
              {state.performance?.map((row) => (
                <tr key={row.stage}>
                  <td>{row.stage}</td>
                  <td>{row.medianMs.toFixed(0)} ms</td>
                  <td>{row.p95Ms.toFixed(0)} ms</td>
                  <td>{row.count}</td>
                  <td>{row.failures}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!state.performance?.length ? (
          <p className="quiet-empty">No measured work yet.</p>
        ) : null}
      </Panel>
      <Panel title="Runtime logs" eyebrow="DEVELOPER VIEW">
        <div className="section-toolbar">
          <label className="search-field">
            <Search size={15} />
            <input
              aria-label="Search logs"
              placeholder="Search execution events…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <select
            aria-label="Log level"
            value={level}
            onChange={(e) => setLevel(e.target.value)}
          >
            <option value="all">All levels</option>
            <option value="info">Info</option>
            <option value="error">Errors</option>
            <option value="warn">Warnings</option>
          </select>
        </div>
        <div className="ws-log-list">
          {logs.map((log, index) => (
            <div key={`${log.at}-${index}`}>
              <time>{time(log.at)}</time>
              <Badge tone={log.level === "error" ? "red" : "muted"}>
                {log.level}
              </Badge>
              <p>{log.message}</p>
            </div>
          ))}
          {!logs.length ? (
            <p className="quiet-empty">No matching events.</p>
          ) : null}
        </div>
      </Panel>
    </>
  );
}
export function Progress({
  progress,
}: {
  progress: WorkProgress | null | undefined;
}) {
  if (!progress)
    return (
      <p className="ws-unquantified">
        Progress appears when work can be measured.
      </p>
    );
  const complete = Math.min(progress.total, progress.completed);
  return (
    <div className="ws-progress">
      <div>
        <strong>
          {complete.toLocaleString()}{" "}
          <span>
            / {progress.total.toLocaleString()} {progress.unit}
          </span>
        </strong>
        <span>
          {progress.total ? Math.floor((complete / progress.total) * 100) : 0}%
        </span>
      </div>
      <progress
        value={complete}
        max={Math.max(1, progress.total)}
        aria-label={`${progress.unit} progress`}
      />
      <small>{progress.basis}</small>
    </div>
  );
}
export function WorkspaceOverview({
  state,
  mutate,
  busy,
  navigate,
}: Common & { navigate: (page: string) => void }) {
  const w = state.workspace,
    activity = w?.activity,
    name = state.profile?.name || state.auth.username || "Your companion";
  const needed =
    w?.resources.filter(
      (row) => row.kind === "raw" && (row.missing === null || row.missing > 0),
    ) || [];
  return (
    <>
      <div className="ws-overview-hero">
        <div className="ws-companion-presence">
          <CompanionAvatar status={activity?.state || state.state} />
          <div>
            <span className="eyebrow">HERE FOR THE ADVENTURE</span>
            <h2>{name}</h2>
            <Badge
              tone={state.connection.status === "connected" ? "green" : "muted"}
            >
              {state.connection.status === "connected"
                ? "In your world"
                : state.planning
                  ? "Ready to talk offline"
                  : "Waiting to join you"}
            </Badge>
            <p>
              {state.profile?.modeSelected
                ? `${human(state.profile.mode)} mode`
                : "Your existing play preferences are active."}
            </p>
            <button
              className="text-button"
              onClick={() => navigate("companion")}
            >
              Make it your own <ArrowRight size={14} />
            </button>
          </div>
        </div>
        <div className="ws-now">
          <div className="ws-now-heading">
            <span className="eyebrow">RIGHT NOW</span>
            <Badge
              tone={
                activity?.state === "blocked"
                  ? "gold"
                  : ["disconnected", "paused", "idle"].includes(
                        activity?.state || "disconnected",
                      )
                    ? "muted"
                    : "green"
              }
            >
              {human(activity?.state || state.state)}
            </Badge>
          </div>
          <h2>{activity?.label || "Let’s find our next adventure."}</h2>
          <p>
            {activity?.detail ||
              "Connect your companion, or start an offline conversation."}
          </p>
          <Progress progress={activity?.progress} />
          <div className="ws-next">
            <ArrowRight size={15} />
            <span>
              {activity?.next[0] ||
                "No next action queued. You choose what happens next."}
            </span>
          </div>
        </div>
      </div>
      <ModePicker state={state} mutate={mutate} busy={busy} />
      <div className="ws-overview-grid">
        <div>
          <Mission state={state} mutate={mutate} busy={busy} compact />
          <Panel
            title="Supplies for the next step"
            eyebrow="RESOURCES"
            action={
              <button
                className="text-button"
                onClick={() => navigate("resources")}
              >
                Open resources <ArrowRight size={14} />
              </button>
            }
          >
            {needed.length ? (
              <div className="ws-resource-shortlist">
                {needed.slice(0, 4).map((row) => (
                  <div key={row.id}>
                    <ItemIcon name={row.name} />
                    <span>
                      <strong>{human(row.name)}</strong>
                      <small>
                        {row.gathering
                          ? "Companion is gathering"
                          : row.userAssigned
                            ? "Shared with you"
                            : "Needed for the plan"}
                      </small>
                    </span>
                    <b>
                      {row.missing === null
                        ? "Unverified"
                        : `${row.missing} missing`}
                    </b>
                  </div>
                ))}
              </div>
            ) : (
              <Empty
                icon={Package}
                title={
                  w?.resources.length
                    ? "Supplies accounted for"
                    : "No material plan yet"
                }
              >
                Create a project in Build studio to see actual requirements and
                split the gathering.
              </Empty>
            )}
          </Panel>
        </div>
        <div>
          <Assistance state={state} mutate={mutate} busy={busy} compact />
          <Panel title="In your world" eyebrow="MINECRAFT SURVIVAL">
            <div className="ws-vitals">
              <span>
                <Heart size={16} />
                <strong>{state.world?.health ?? "—"}</strong>
                <small>Health / 20</small>
              </span>
              <span>
                <Package size={16} />
                <strong>{state.world?.food ?? "—"}</strong>
                <small>Food / 20</small>
              </span>
              <span>
                <Backpack size={16} />
                <strong>
                  {state.world?.inventory.filter(
                    (item) => item.slot >= 9 && item.slot <= 44,
                  ).length ?? "—"}
                </strong>
                <small>Slots / 36</small>
              </span>
            </div>
            <div className="ws-world-location">
              <MapPin size={17} />
              <span>
                {state.world
                  ? `${Math.floor(state.world.position.x)}, ${Math.floor(state.world.position.y)}, ${Math.floor(state.world.position.z)}`
                  : "Location not observed"}
                <small>
                  {state.world
                    ? human(state.world.dimension)
                    : "Connect to see your companion’s surroundings"}
                </small>
              </span>
            </div>
            <button
              className="text-button"
              onClick={() => navigate("inventory")}
            >
              Inspect backpack <ArrowRight size={14} />
            </button>
          </Panel>
        </div>
      </div>
      <Panel title="A conversation away" className="ws-conversation-invitation">
        <div>
          <MessageCircle size={27} />
          <p>
            Need a hand, a new plan, or just a chat? Your companion can keep
            safe work going while you talk.
          </p>
        </div>
        <button className="button" onClick={() => navigate("communication")}>
          Start a conversation <ArrowRight size={15} />
        </button>
      </Panel>
      <ActivityFeed state={state} compact />
    </>
  );
}
export function Mission({
  state,
  mutate,
  busy,
  compact = false,
}: Common & { compact?: boolean }) {
  const mission = state.workspace?.mission,
    frames = state.taskStack?.frames || [],
    frame = frames.at(-1);
  return (
    <Panel
      title={mission?.title || frame?.label || "An open adventure"}
      eyebrow="CURRENT MISSION"
      action={
        <Badge>
          {human(mission?.status || frame?.status || "No active goal")}
        </Badge>
      }
    >
      {mission ? (
        <>
          <Progress progress={mission.progress} />
          {mission.sections.length ? (
            <ol className="ws-milestones">
              {mission.sections.map((section) => (
                <li
                  key={section.name}
                  className={
                    section.verified === section.total ? "complete" : ""
                  }
                >
                  <span className="ws-milestone-icon">
                    {section.verified === section.total ? (
                      <Check size={14} />
                    ) : (
                      <Layers3 size={14} />
                    )}
                  </span>
                  <div>
                    <strong>{human(section.name)}</strong>
                    <small>
                      {section.verified} / {section.total} placements observed
                    </small>
                  </div>
                  <progress
                    aria-label={`${section.name} placements`}
                    value={section.verified}
                    max={Math.max(1, section.total)}
                  />
                </li>
              ))}
            </ol>
          ) : (
            <p className="quiet-empty">
              Approve a complete blueprint to track verified building sections.
            </p>
          )}
          <small className="note">
            {mission.verifiedAt
              ? `Last verification ${new Date(mission.verifiedAt).toLocaleString()}. Changes outside observation remain unknown.`
              : "Construction is not yet observed."}
          </small>
        </>
      ) : !frame ? (
        <Empty icon={Target} title="What are we doing today?">
          Ask your companion for a hand, make a build plan, or start a
          conversation. No mission is required to hang out.
        </Empty>
      ) : null}
      {frames.length ? (
        <div className="ws-plan-stack">
          {frames
            .slice()
            .reverse()
            .map((task) => (
              <details key={task.id} open={!compact && task.id === frame?.id}>
                <summary>
                  <Badge tone={task.status === "blocked" ? "gold" : "muted"}>
                    {human(task.status)}
                  </Badge>
                  <strong>{task.label}</strong>
                  <small>
                    Step {task.step} of {task.steps}
                  </small>
                </summary>
                {task.error ? (
                  <p role="status" className="inline-error">
                    {task.error}
                  </p>
                ) : null}
                <ol className="ws-plan-steps">
                  {task.actions.map((action, index) => (
                    <li
                      key={index}
                      className={
                        index < task.step - 1
                          ? "complete"
                          : index === task.step - 1
                            ? "current"
                            : ""
                      }
                    >
                      <span>
                        {index < task.step - 1 ? (
                          <Check size={13} />
                        ) : (
                          index + 1
                        )}
                      </span>
                      <div>
                        <strong>{human(action.tool)}</strong>
                        <small>
                          {Object.entries(action.args)
                            .map(
                              ([key, value]) =>
                                `${human(key)}: ${typeof value === "object" ? JSON.stringify(value) : String(value)}`,
                            )
                            .join(" · ")}
                        </small>
                      </div>
                    </li>
                  ))}
                </ol>
                <p className="note">
                  Sequential execution steps; this is not a percentage of the
                  entire goal.
                </p>
                <div className="ws-actions">
                  <button
                    className="button"
                    disabled={
                      busy ||
                      task.id !== frame?.id ||
                      task.owner === "player" ||
                      !["ACTIVE", "BUSY"].includes(state.state)
                    }
                    onClick={() => attempt(mutate("/teammate/tasks/resume"))}
                  >
                    Resume next saved task
                  </button>
                  {(
                    [
                      "claim",
                      "transfer",
                      "defer",
                      "prioritize",
                      "cancel",
                    ] as const
                  ).map((action) => (
                    <button
                      className="button"
                      key={action}
                      disabled={
                        busy ||
                        (action === "prioritize" &&
                          (!state.taskStack?.held ||
                            Boolean(state.currentTask)))
                      }
                      onClick={() =>
                        attempt(
                          mutate(`/workspace/tasks/${task.id}`, {
                            action,
                            revision: task.revision || 0,
                          }),
                        )
                      }
                    >
                      {
                        {
                          claim: "I’ll take this task",
                          transfer: "Give to companion",
                          defer: "Postpone",
                          prioritize: "Do this next",
                          cancel: "Cancel task",
                        }[action]
                      }
                    </button>
                  ))}
                </div>
                <p className="note">
                  Owner: {task.owner === "player" ? "you" : "companion"}.
                  Transferred or postponed work stays held until explicitly
                  resumed. Reordering moves the entire task, preserving its
                  prerequisites.
                </p>
              </details>
            ))}
        </div>
      ) : null}
    </Panel>
  );
}
export function Assistance({
  state,
  mutate,
  busy,
  compact = false,
}: Common & { compact?: boolean }) {
  const [filter, setFilter] = useState("pending");
  const requests = state.workspace?.assistance || [];
  const shown = compact
    ? requests.filter((r) => r.status === "pending").slice(0, 2)
    : requests.filter((r) => filter === "all" || r.status === filter);
  const labels = {
    player: "I’ll handle it",
    companion: "Assign to companion",
    replan: "Change the plan",
    defer: "Defer request",
  };
  return (
    <Panel
      title="Needs your help"
      eyebrow="WE’VE GOT THIS TOGETHER"
      action={
        <span className="ws-count">
          {requests.filter((r) => r.status === "pending").length}
        </span>
      }
    >
      {!compact ? (
        <div className="ws-filter-pills">
          {["pending", "accepted", "deferred", "resolved", "all"].map(
            (value) => (
              <button
                key={value}
                className={filter === value ? "selected" : ""}
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
              >
                {human(value)}
              </button>
            ),
          )}
        </div>
      ) : null}
      {shown.length ? (
        shown.map((request) => (
          <article
            className={`ws-help-request ${request.priority}`}
            key={request.id}
          >
            <div>
              <span className="ws-help-icon">
                <HeartHandshake size={20} />
              </span>
              <Badge tone={request.priority === "urgent" ? "red" : "gold"}>
                {human(request.type)} · {human(request.status)}
              </Badge>
            </div>
            <h3>{request.title}</h3>
            <p>{request.detail}</p>
            {request.owner ? (
              <small>
                Owned by {request.owner === "player" ? "you" : "your companion"}
              </small>
            ) : null}
            {request.resolution ? (
              <p className="note">{request.resolution}</p>
            ) : null}
            <div className="ws-actions">
              {request.actions.map((action) => (
                <button
                  className={`button ${action === "player" ? "primary" : ""}`}
                  key={action}
                  disabled={
                    busy ||
                    (action === "companion" &&
                      !["ACTIVE", "BUSY"].includes(state.state))
                  }
                  onClick={() =>
                    attempt(
                      mutate(
                        `/workspace/assistance/${encodeURIComponent(request.id)}`,
                        { action, revision: request.revision },
                      ),
                    )
                  }
                >
                  {action === "companion" &&
                  request.item &&
                  !/^(oak|spruce|birch)_log$/.test(request.item)
                    ? "Ask companion to find"
                    : labels[action]}
                </button>
              ))}
            </div>
          </article>
        ))
      ) : (
        <div className="ws-all-clear">
          <CheckCircle2 size={25} />
          <strong>
            {filter === "pending" || compact
              ? "No requests waiting on you"
              : "Nothing in this view"}
          </strong>
          <p>
            {compact
              ? "Important requests appear here when your companion needs you."
              : "Decisions are saved across screens and restarts. Reporting supplies does not verify delivery."}
          </p>
        </div>
      )}
    </Panel>
  );
}
