import { useState, type ReactNode } from "react";
import {
  contributions,
  docs,
  lifecycle,
  pages,
  repository,
  source,
} from "./content";
import evaluation from "../public/evaluation.json";
import PlayerTwoMark from "../../../packages/ui/PlayerTwoMark";
export const base = import.meta.env.BASE_URL;
const href = (path: string) => base + path.replace(/^\//, "");
const sourceLink = (file: string) => source + "/" + file;
function Arrow() {
  return <span aria-hidden="true">↗</span>;
}
function Logo() {
  return (
    <a className="wordmark" href={href("/")} aria-label="Player Two home">
      <PlayerTwoMark />
      Player Two
    </a>
  );
}
function LinkButton({
  to,
  children,
  quiet = false,
}: {
  to: string;
  children: ReactNode;
  quiet?: boolean;
}) {
  return (
    <a className={"button" + (quiet ? " quiet" : "")} href={to}>
      {children}
      <Arrow />
    </a>
  );
}
function Header({ route }: { route: string }) {
  const [open, setOpen] = useState(false);
  return (
    <header className="header">
      <Logo />
      <span className="brand-context">A shared place to play.</span>
      <button
        className="menu-toggle"
        aria-expanded={open}
        aria-controls="primary-navigation"
        onClick={() => setOpen(!open)}
      >
        {open ? "Close" : "Menu"}
      </button>
      <nav
        id="primary-navigation"
        className={open ? "open" : ""}
        aria-label="Main navigation"
      >
        {[
          ["/games/", "Games"],
          ["/features/", "Workspace"],
          ["/how-it-works/", "How it works"],
          ["/docs/", "Docs"],
        ].map(([path, label]) => (
          <a
            key={path}
            href={href(path)}
            aria-current={route === path ? "page" : undefined}
          >
            {label}
          </a>
        ))}
        <a href={source}>
          GitHub <Arrow />
        </a>
      </nav>
      <a className="header-cta" href={href("/get-started/")}>
        Get started <Arrow />
      </a>
    </header>
  );
}
function Footer() {
  return (
    <footer>
      <div className="footer-top">
        <div>
          <Logo />
          <p>
            An open-source AI gaming companion.
            <br />
            Minecraft Survival today. More worlds to investigate together.
          </p>
        </div>
        <div className="footer-links">
          {pages
            .filter(([path]) => path !== "/")
            .map(([path, title]) => (
              <a key={path} href={href(path)}>
                {title}
              </a>
            ))}
          <a href={source}>GitHub</a>
          <a href={sourceLink("SECURITY.md")}>Security</a>
          <a href={sourceLink("LICENSE")}>Apache-2.0</a>
          <a href={base + "font-license.txt"}>Font licenses</a>
        </div>
      </div>
      <div className="footer-bottom">
        <span>Free software. No ads or feature unlocks.</span>
        <p>
          Independent project, not affiliated with Mojang or Microsoft.
          Minecraft Java Edition and a separate licensed bot account are
          required for Realm play. Optional models and services may charge
          separately.
        </p>
      </div>
    </footer>
  );
}
function Intro({
  label,
  title,
  children,
}: {
  label: string;
  title: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="page-intro">
      <span className="eyebrow">{label}</span>
      <div>
        <h1>{title}</h1>
        <p>{children}</p>
      </div>
    </section>
  );
}
function SectionHeading({
  label,
  title,
  children,
}: {
  label: string;
  title: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="section-heading">
      <div>
        <span className="eyebrow">{label}</span>
        <h2>{title}</h2>
      </div>
      {children && <div className="section-aside">{children}</div>}
    </div>
  );
}
function ProductImage({ eager = false }: { eager?: boolean }) {
  const [fixture, setFixture] = useState(false);
  const filename = fixture ? "gathering-fixture.png" : "dashboard.png";
  return (
    <figure className="workspace-preview">
      <div className="preview-toolbar">
        <span>INSIDE THE WORKSPACE</span>
        <div aria-label="Workspace screenshot">
          <button aria-pressed={!fixture} onClick={() => setFixture(false)}>
            Disconnected session
          </button>
          <button aria-pressed={fixture} onClick={() => setFixture(true)}>
            Gathering test fixture
          </button>
        </div>
      </div>
      <a
        href={base + filename}
        aria-label="Open actual companion workspace screenshot"
      >
        <img
          src={base + filename}
          width="1440"
          height="900"
          loading={eager ? "eager" : "lazy"}
          alt={
            fixture
              ? "Actual Player Two application rendered with synthetic gathering test data; not recorded gameplay"
              : "Actual Player Two workspace in a disconnected test session; no live gameplay data is invented"
          }
        />
      </a>
      <figcaption>
        <strong>The local workspace / actual application</strong>
        <span>
          {fixture
            ? "Synthetic test fixture · not recorded gameplay"
            : "Disconnected test session · open image for detail"}
        </span>
      </figcaption>
    </figure>
  );
}
function Home() {
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">
            PLAYER TWO / OPEN-SOURCE AI GAMING COMPANION
          </span>
          <h1>
            Good company.
            <br />
            <em>Better games.</em>
          </h1>
          <div className="hero-brief">
            <p>
              An AI companion to share the work, talk through a plan, or just
              hang out while you play.
            </p>
            <p className="hero-game">
              Starting with <strong>Minecraft Survival.</strong>
            </p>
            <LinkButton to={href("/get-started/")}>
              Get started — free
            </LinkButton>
            <a className="text-link" href={source}>
              Explore the source <Arrow />
            </a>
          </div>
        </div>
        <ProductImage eager />
      </section>
      <section className="section play-notes">
        <SectionHeading
          label="WHAT IT’S LIKE TO PLAY TOGETHER"
          title={<>A hand with the game. Company for the rest.</>}
        />
        <div className="play-notes-body">
          <article>
            <h3>Give it a useful job.</h3>
            <p>
              Gather supplies, prepare for a trip or work on an approved build.
              See what is happening, what comes next and where it needs a hand.
            </p>
          </article>
          <article>
            <h3>Keep a conversation going.</h3>
            <p>
              Talk about the game or something else entirely. Adjust the tone
              and talkativeness; save the moments you want it to remember.
            </p>
          </article>
          <article>
            <h3>Make the decisions together.</h3>
            <p>
              Split resources, change a responsibility or pause the whole
              session. Help requests explain the blocker before asking you to
              act.
            </p>
          </article>
        </div>
      </section>
      <section className="home-game">
        <div>
          <span className="eyebrow">FIRST SUPPORTED GAME / EARLY ACCESS</span>
          <h2>Minecraft Survival.</h2>
          <p>
            Gather, craft, build and explore through a legitimate Java client.
            It is a bounded, experimental teammate — not a promise of unattended
            mastery.
          </p>
          <a className="text-link" href={href("/games/")}>
            See what is supported <Arrow />
          </a>
        </div>
        <dl className="spec-list">
          <div>
            <dt>Playing together</dt>
            <dd>Shared goals, resource assignments and voice conversation</dd>
          </div>
          <div>
            <dt>What it observes</dt>
            <dd>Its inventory, nearby entities and loaded world state</dd>
          </div>
          <div>
            <dt>What you control</dt>
            <dd>Permissions, plans, memories and when it stops</dd>
          </div>
          <div>
            <dt>Getting connected</dt>
            <dd>Windows · Minecraft Java · separate licensed account</dd>
          </div>
        </dl>
      </section>
      <section className="open-invitation">
        <span className="eyebrow">
          THE PLATFORM GROWS WITH ITS CONTRIBUTORS
        </span>
        <h2>Make it your own.</h2>
        <div>
          <p>
            A clearer observation. A better recovery. A permitted way into
            another game. The code, contracts and tests are here for you to
            inspect and improve.
          </p>
          <LinkButton to={href("/contribute/")} quiet>
            Find your contribution
          </LinkButton>
          <a className="text-link" href={href("/how-it-works/")}>
            Understand the engineering <Arrow />
          </a>
        </div>
      </section>
    </>
  );
}
function Code({ children }: { children: string }) {
  const [message, setMessage] = useState("Copy");
  async function copy() {
    try {
      await navigator.clipboard.writeText(children);
      setMessage("Copied");
    } catch {
      setMessage("Select and copy the code");
    }
  }
  return (
    <div className="code-block">
      <button onClick={() => void copy()}>{message}</button>
      <pre
        tabIndex={0}
        role="region"
        aria-label="Commands; scroll horizontally if needed"
      >
        <code>{children}</code>
      </pre>
    </div>
  );
}
function GettingStarted() {
  const [os, setOs] = useState("Windows"),
    [provider, setProvider] = useState("Local Ollama");
  return (
    <>
      <Intro
        label="GET STARTED"
        title={
          <>
            Set up your
            <br />
            side of the desk.
          </>
        }
      >
        Install locally, choose a model and meet your companion in Minecraft.
        The software is free. A game account and optional hosted inference are
        separate.
      </Intro>
      <div className="setup-layout">
        <aside className="setup-sidebar">
          <h2>Before you begin</h2>
          <ul className="checklist">
            <li>Git and Node.js 24 LTS</li>
            <li>Minecraft Java Edition</li>
            <li>A separate licensed bot account</li>
            <li>An invitation to your Realm</li>
          </ul>
          <p>
            Windows supports the full Realm and desktop-voice setup. macOS/Linux
            currently support experimental browser planning.
          </p>
          <a className="text-link" href={sourceLink("docs/TROUBLESHOOTING.md")}>
            Troubleshooting <Arrow />
          </a>
          <a className="text-link" href={repository + "/releases"}>
            Source releases <Arrow />
          </a>
        </aside>
        <div className="setup-steps">
          <section>
            <span className="step-label">01 / INSTALL</span>
            <h2>Start with your operating system.</h2>
            <div className="segmented" aria-label="Operating system">
              {["Windows", "macOS", "Linux"].map((name) => (
                <button
                  key={name}
                  aria-pressed={os === name}
                  onClick={() => setOs(name)}
                >
                  {name}
                </button>
              ))}
            </div>
            <p>
              {os === "Windows"
                ? "Install Git and Node.js 24 LTS, then use PowerShell. The setup script installs locked project dependencies, verifies the Minecraft adapter and builds the workspace."
                : "Install Git and Node.js 24 LTS, then use your terminal. This experimental path supports browser planning. Secure Realm authentication and native desktop voice still require Windows."}
            </p>
            <Code>
              {"git clone --branch feat/minecraft-companion --recurse-submodules " +
                repository +
                ".git\ncd minecraft-companion\nnpm run install:agent\nnpm start"}
            </Code>
            <p className="fine">
              You can also extract a versioned source release and run the last
              two commands inside its folder. There is no signed standalone
              installer yet.
            </p>
            <p className="inline-links">
              <a href="https://nodejs.org/en/download">
                Install Node.js <Arrow />
              </a>
              <a href="https://git-scm.com/downloads">
                Install Git <Arrow />
              </a>
            </p>
          </section>
          <section>
            <span className="step-label">02 / MODEL</span>
            <h2>Choose where it thinks.</h2>
            <div className="segmented" aria-label="Model provider">
              {["Local Ollama", "Existing subscription"].map((name) => (
                <button
                  key={name}
                  aria-pressed={provider === name}
                  onClick={() => setProvider(name)}
                >
                  {name}
                </button>
              ))}
            </div>
            {provider === "Local Ollama" ? (
              <>
                <p>
                  Install <a href="https://ollama.com/download">Ollama</a> and a
                  locally runnable model that fits your hardware. In Setup,
                  choose <strong>Ollama (local, free)</strong>, refresh the
                  model list and select the installed model.
                </p>
                <Code>{"ollama pull qwen3:8b"}</Code>
                <p className="fine">
                  An example, not a performance guarantee. Check the model’s
                  license and memory requirements. The adapter contacts
                  127.0.0.1:11434 and excludes cloud-tagged models. Do not
                  configure your local service to forward private prompts
                  elsewhere without understanding the consequences.
                </p>
              </>
            ) : (
              <>
                <p>
                  Select your existing Codex, Claude Code or OpenCode provider
                  in Setup and complete its supported login. Player Two never
                  needs your provider account password.
                </p>
                <p className="fine">
                  External providers may require a subscription or charge for
                  usage. They receive the context needed for each request.
                  Claude’s proprietary SDK is an optional separate installation.
                  Video and image analysis use their own supported provider and
                  sharing controls.
                </p>
                <Code>{"npm run setup:claude"}</Code>
                <p className="fine">
                  Only run this optional command when choosing the Claude
                  provider and accepting its vendor terms.
                </p>
              </>
            )}
          </section>
          <section>
            <span className="step-label">03 / GAME</span>
            <h2>Meet in Minecraft.</h2>
            <p>
              Open <code>http://127.0.0.1:4365</code>, choose Minecraft
              Survival, then Setup. Select{" "}
              <strong>Connect Minecraft account</strong> and complete
              Microsoft’s official device-code flow with the bot’s account.
              Select an invited Realm and check compatibility before joining.
            </p>
            <div className="callout">
              <strong>Your credentials stay yours.</strong>
              <p>
                Complete password and MFA prompts on Microsoft’s site. Windows
                protects cached tokens with DPAPI outside the repository. Never
                paste credentials into chat or a project file.
              </p>
            </div>
          </section>
          <section>
            <span className="step-label">04 / FIRST SESSION</span>
            <h2>Check the sound. Pick a small goal.</h2>
            <p>
              On Windows, optional local speech setup installs Whisper and
              Kokoro/Piper. Choose a microphone, output device and push-to-talk
              binding. Test the audio, save Home and approve supply chests.
            </p>
            <Code>
              {os === "Windows"
                ? ".\\scripts\\Bootstrap.ps1 -SkipBridge -DesktopShortcut"
                : "npm run check:install"}
            </Code>
            <p>
              Try “follow me,” then a small gathering request in a disposable
              world. Pause preserves work. Stop disconnects. My companion holds
              the mode, personality and memory controls.
            </p>
          </section>
          <section>
            <span className="step-label">05 / UPDATES</span>
            <h2>Keep the work. Update the code.</h2>
            <p>
              Back up your data in Settings and stop the companion. In a clean
              checkout, fast-forward the same branch and rerun installation.
              Preserve local changes before updating.
            </p>
            <Code>
              {"git pull --ff-only\nnpm run install:agent\nnpm start"}
            </Code>
            <p className="fine">
              Private data lives outside the source folder. Docker is not a
              supported replacement for the full desktop audio/authentication
              setup.
            </p>
          </section>
        </div>
      </div>
    </>
  );
}
function Games() {
  return (
    <>
      <Intro
        label="GAMES"
        title={
          <>
            One game today.
            <br />
            Room for the next.
          </>
        }
      >
        Minecraft Survival is playable in early access. Everything beyond it
        needs a real integration, permission to use it and evidence that it
        works.
      </Intro>
      <section className="game-spec">
        <div className="game-name">
          <span className="availability">AVAILABLE / EARLY ACCESS</span>
          <h2>
            Minecraft
            <br />
            Survival
          </h2>
          <LinkButton to={href("/get-started/")}>Set up Minecraft</LinkButton>
        </div>
        <div>
          <dl className="spec-list">
            <div>
              <dt>Edition</dt>
              <dd>Java Edition · invited Realms</dd>
            </div>
            <div>
              <dt>Account</dt>
              <dd>Separate licensed bot account · Microsoft device login</dd>
            </div>
            <div>
              <dt>Primary platform</dt>
              <dd>Windows desktop and native voice</dd>
            </div>
            <div>
              <dt>Version</dt>
              <dd>Pinned native 26.3 adapter; checked before connection</dd>
            </div>
          </dl>
          <p className="fine">
            macOS/Linux browser planning is experimental. A compatible protocol
            is necessary, not proof that every skill works in every world.
          </p>
        </div>
      </section>
      <div className="support-table">
        <div>
          <h3>Useful today</h3>
          <p>
            Bounded gathering, food preparation, gear upkeep, exposed surface
            iron, observed inventory, shared resource plans and approved
            blueprint construction.
          </p>
        </div>
        <div>
          <h3>Still needs a human</h3>
          <p>
            Unrestricted cave mining, difficult supply chains, arbitrary terrain
            changes and unseen reference geometry. You approve permissions and
            designs before work begins.
          </p>
        </div>
      </div>
      <section className="proposal-brief">
        <div>
          <span className="eyebrow">FUTURE GAMES / OPEN RESEARCH</span>
          <h2>
            Pick a world.
            <br />
            Start with a<br />
            cooperative task.
          </h2>
        </div>
        <div>
          <p>
            A game name in a menu does not make an integration. Bring a small
            objective and a permitted interface; we can investigate the rest
            together.
          </p>
          <ol>
            <li>
              <strong>Connect legitimately.</strong>
              <span>
                Use official APIs, supported mod interfaces or other authorized
                access. Respect terms and anti-cheat.
              </span>
            </li>
            <li>
              <strong>Observe an outcome.</strong>
              <span>
                Define what the companion can know, change and verify.
              </span>
            </li>
            <li>
              <strong>Stop and recover.</strong>
              <span>
                Test permissions, cancellation and what happens when the plan
                fails.
              </span>
            </li>
          </ol>
          <div className="inline-links">
            <a
              className="text-link"
              href={repository + "/issues/new?template=game-integration.yml"}
            >
              Propose an integration <Arrow />
            </a>
            <a className="text-link" href={sourceLink("docs/GAME-ADAPTERS.md")}>
              Read the contract <Arrow />
            </a>
          </div>
        </div>
      </section>
      <p className="callout">
        The repository includes a non-playable strategy fixture for testing a
        second observation shape. It has no game client and is not available in
        the production game selector.
      </p>
    </>
  );
}
function Lifecycle() {
  const [active, setActive] = useState(0);
  return (
    <div className="lifecycle">
      <div className="lifecycle-rail" aria-label="Agent lifecycle stages">
        {lifecycle.map((stage, i) => (
          <button
            key={stage.name}
            aria-pressed={active === i}
            onClick={() => setActive(i)}
          >
            <span>{String(i + 1).padStart(2, "0")}</span>
            {stage.name}
            <span aria-hidden="true">→</span>
          </button>
        ))}
      </div>
      <div className="lifecycle-detail" aria-live="polite">
        <div>
          <span className="eyebrow">{lifecycle[active].code}</span>
          <h3>{lifecycle[active].name}</h3>
        </div>
        <div>
          <p>{lifecycle[active].text}</p>
          <a className="text-link" href={sourceLink(lifecycle[active].file)}>
            Inspect this implementation <Arrow />
          </a>
        </div>
      </div>
    </div>
  );
}
function Architecture() {
  return (
    <>
      <Intro
        label="HOW IT WORKS"
        title={
          <>
            Follow one
            <br />
            request.
          </>
        }
      >
        A player asks for help. The companion works with what it can actually
        observe, executes bounded actions and checks what changed.
      </Intro>
      <div className="request-example">
        <span className="eyebrow">EXAMPLE REQUEST / NOT A LIVE SESSION</span>
        <blockquote>
          “Get eight oak logs.
          <br />
          I’ll work on the house.”
        </blockquote>
        <p>
          A recognized command can skip model planning. The same execution,
          permission and observation boundaries still apply.
        </p>
      </div>
      <Lifecycle />
      <section className="section">
        <SectionHeading
          label="THE ACTUAL IMPLEMENTATION"
          title={
            <>
              A shared workspace.
              <br />A game-specific body.
            </>
          }
        />
        <div className="architecture-flow">
          <div>
            <span>Player</span>
            <strong>Voice + workspace</strong>
            <small>Goals, conversation, approvals</small>
          </div>
          <b aria-hidden="true">→</b>
          <div>
            <span>Core</span>
            <strong>Orchestrator + state</strong>
            <small>Context, validation, tasks</small>
          </div>
          <b aria-hidden="true">→</b>
          <div>
            <span>Minecraft</span>
            <strong>Skills + Mineflayer</strong>
            <small>Actions and server feedback</small>
          </div>
        </div>
        <p className="architecture-caption">
          Observed events return through the game adapter to missions, resources
          and assistance. SQLite preserves tasks, projects and user-controlled
          memories.
        </p>
      </section>
      <div className="explanation-list">
        {[
          [
            "Plans have limits.",
            "Models return structured actions, not shell commands. The validator rejects unsupported tools and invalid arguments. General conversation cannot invoke gameplay tools. Permissions and actual state are checked again during execution.",
          ],
          [
            "Memory has a source.",
            "Explicit notes and saved moments remain inspectable. A conversation quote proves what was said, not that an adventure happened. Disabling memory removes retained notes and moments from prompts while preserving operational safety context.",
          ],
          [
            "The world is only partly visible.",
            "The client observes loaded terrain, nearby entities and its own items. It cannot know your full inventory or inspect an unloaded chest. Freshness and provenance belong beside every resource count.",
          ],
          [
            "Work can be interrupted.",
            "The runtime owns each operation until it settles. Pause closes admission gates before cancellation. Temporary requests can preserve prior work, and reconnection returns paused rather than silently resuming in a changed world.",
          ],
          [
            "More games need more engineering.",
            "The observation adapter declares identity, capabilities and workspace data. Minecraft actions and navigation remain specific to Minecraft. A new playable game needs its own permitted connection, executor and safety validation.",
          ],
        ].map(([title, text]) => (
          <section key={title}>
            <h3>{title}</h3>
            <p>{text}</p>
          </section>
        ))}
      </div>
      <div className="page-end-link">
        <LinkButton to={sourceLink("docs/ARCHITECTURE.md")} quiet>
          Read the architecture guide
        </LinkButton>
      </div>
    </>
  );
}
const situations = [
  {
    name: "Gather supplies",
    title: "Know what is in the bag.",
    text: "Current work, observed pickups and the remaining requirement stay together. Carried items, stored snapshots and resources assigned to each player are distinct.",
    limit:
      "A gathering delta can include a handoff. Unknown or stale stock stays unknown; no invented completion percentage.",
    file: "docs/WORKSPACE.md",
  },
  {
    name: "Build together",
    title: "Turn a reference into a shared plan.",
    text: "Import a supported schematic or analyze an authorized reference. Review the actual blueprint, divide materials and approve construction. The workspace tracks verified sections and requests missing supplies.",
    limit:
      "Counts can be exact for the saved blueprint. A video cannot reveal every hidden block. Construction and supply-chain limits still apply.",
    file: "services/build-planner/README.md",
  },
  {
    name: "Talk & remember",
    title: "Leave room for a conversation.",
    text: "Talk while safe work continues, choose a communication style and keep a quote or completed task as a memory. Change modes when you want focused teamwork or a quieter hangout.",
    limit:
      "The companion is AI. No human feelings, exclusive friendship or invented shared history. Voice latency depends on your hardware and provider.",
    file: "docs/COMPANION-PERSONALITY.md",
  },
  {
    name: "Lend a hand",
    title: "See the blocker. Make a decision.",
    text: "A persistent help request explains the missing material or failed step. Claim the work, assign a supported task, defer it or hold the plan for new instructions.",
    limit:
      "Accepting responsibility does not verify delivery. A rare-resource search finds a source; it does not promise to acquire the material.",
    file: "docs/GAME-ADAPTERS.md",
  },
];
function Features() {
  const [selected, setSelected] = useState(0),
    item = situations[selected];
  return (
    <>
      <Intro
        label="THE WORKSPACE"
        title={
          <>
            Less checking in.
            <br />
            More playing.
          </>
        }
      >
        A shared desk for the current session: the companion’s work, your
        responsibilities and the conversation. Technical logs have their own
        place.
      </Intro>
      <div className="situation-tabs" aria-label="Workspace situations">
        {situations.map((s, i) => (
          <button
            key={s.name}
            aria-pressed={selected === i}
            onClick={() => setSelected(i)}
          >
            {s.name}
          </button>
        ))}
      </div>
      <section className="situation-detail">
        <div>
          <span className="eyebrow">{item.name}</span>
          <h2>{item.title}</h2>
        </div>
        <div>
          <p>{item.text}</p>
          <p className="fine">{item.limit}</p>
          <a className="text-link" href={sourceLink(item.file)}>
            Read the behavior guide <Arrow />
          </a>
        </div>
      </section>
      <ProductImage />
      <section className="workspace-functions">
        <div>
          <span className="eyebrow">DURING A SESSION</span>
          <h2>
            Keep the useful
            <br />
            things close.
          </h2>
        </div>
        <dl className="spec-list">
          <div>
            <dt>Session stage</dt>
            <dd>Current activity, objective and observed progress</dd>
          </div>
          <div>
            <dt>Material workbench</dt>
            <dd>
              Raw and crafted requirements, allocations and storage provenance
            </dd>
          </div>
          <div>
            <dt>Conversation</dt>
            <dd>Text, configured voice, personality and retained moments</dd>
          </div>
          <div>
            <dt>Human assistance</dt>
            <dd>Persistent requests with real ownership and task updates</dd>
          </div>
          <div>
            <dt>Developer tools</dt>
            <dd>Searchable logs, model identity, timing and reported usage</dd>
          </div>
        </dl>
      </section>
      <section className="plain-split">
        <h2>
          Your control
          <br />
          does not disappear.
        </h2>
        <div>
          <p>
            Pause stops new gameplay and model work. Stop disconnects. Blueprint
            approval, mining permissions and resource protections remain
            explicit. The workspace reflects the authoritative backend after
            reconnect.
          </p>
          <p className="fine">
            No safety controller guarantees survival. Start with small goals in
            a disposable world and supervise valuable projects.
          </p>
          <LinkButton to={href("/get-started/")} quiet>
            Set up your first session
          </LinkButton>
        </div>
      </section>
    </>
  );
}
function Documentation() {
  const [query, setQuery] = useState(""),
    [route, setRoute] = useState("All guides");
  const belongs = (group: string) =>
    route === "All guides" ||
    (route === "For players"
      ? ["Start here", "Use the companion", "Use the agent"].includes(group)
      : ["Develop", "Understand", "Maintain", "Research"].includes(group));
  const filtered = docs.filter(
    (doc) =>
      belongs(doc.group) &&
      (doc.title + " " + doc.group + " " + doc.text)
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <>
      <Intro
        label="DOCUMENTATION"
        title={
          <>
            Find your way.
            <br />
            Then go deeper.
          </>
        }
      >
        Start a session, understand a count or follow an action into the source.
        These guides describe the software that exists today.
      </Intro>
      <div className="docs-tools">
        <div className="segmented" aria-label="Documentation audience">
          {["All guides", "For players", "For developers"].map((value) => (
            <button
              key={value}
              aria-pressed={route === value}
              onClick={() => setRoute(value)}
            >
              {value}
            </button>
          ))}
        </div>
        <label className="doc-search">
          <span>Search documentation</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Try voice, cancellation or resources"
          />
        </label>
      </div>
      <p className="fine doc-count" role="status">
        {filtered.length} guides · opens source documentation on GitHub
      </p>
      <div className="doc-list">
        {filtered.map((doc) => (
          <a key={doc.file} href={sourceLink(doc.file)}>
            <span className="eyebrow">{doc.group}</span>
            <div>
              <h2>{doc.title}</h2>
              <p>{doc.text}</p>
            </div>
            <Arrow />
          </a>
        ))}
      </div>
      {!filtered.length && (
        <div className="callout">
          <p>
            No matching guide. Try a broader topic or another reading route.
          </p>
          <button
            className="text-link"
            onClick={() => {
              setQuery("");
              setRoute("All guides");
            }}
          >
            Clear search
          </button>
        </div>
      )}
      <section className="reading-route">
        <h2>New to the code?</h2>
        <p>
          Read Architecture, run the observation extension example, then inspect
          the game adapter contract. That gives you one small path through the
          system before tackling gameplay execution.
        </p>
        <a className="text-link" href={sourceLink("docs/EXTENSIONS.md")}>
          Start with an observer <Arrow />
        </a>
      </section>
    </>
  );
}
function Engineering() {
  return (
    <>
      <Intro
        label="ENGINEERING"
        title={
          <>
            Show the evidence.
            <br />
            Keep the limits.
          </>
        }
      >
        A reproducible contract test is useful. It is not a survival benchmark.
        Every published number below belongs to a named report and a bounded
        method.
      </Intro>
      <section className="evaluation-record">
        <div className="report-title">
          <span className="eyebrow">PUBLISHED CONTRACT EVALUATION</span>
          <h2>
            {evaluation.passed}
            <span>checks passed</span>
          </h2>
          <p>{evaluation.scope}</p>
        </div>
        <dl className="report-details">
          <div>
            <dt>Failed / skipped</dt>
            <dd>
              {evaluation.failed} / {evaluation.skipped}
            </dd>
          </div>
          <div>
            <dt>Recorded</dt>
            <dd>{evaluation.measuredAt}</dd>
          </div>
          <div>
            <dt>Source commit</dt>
            <dd>
              <a href={repository + "/commit/" + evaluation.sourceCommit}>
                {evaluation.sourceCommit.slice(0, 12)} <Arrow />
              </a>
            </dd>
          </div>
          <div>
            <dt>Game / model requests</dt>
            <dd>
              {evaluation.gameplayActions} / {evaluation.modelRequests}
            </dd>
          </div>
          <div>
            <dt>Method</dt>
            <dd>Synthetic contract fixtures; no game connection</dd>
          </div>
        </dl>
        <a className="text-link report-link" href={base + "evaluation.json"}>
          Inspect the raw report <Arrow />
        </a>
      </section>
      <section className="reproduce">
        <div>
          <span className="eyebrow">RUN IT YOURSELF</span>
          <h2>
            Same source.
            <br />
            Visible checks.
          </h2>
          <p>
            The report includes the environment, selected suites and measurement
            scope. Suite wall time is not model planning latency.
          </p>
          <a className="text-link" href={sourceLink("docs/EVALUATION.md")}>
            Full methodology <Arrow />
          </a>
        </div>
        <Code>
          {
            "npm ci --ignore-scripts\nnpm run setup:native\nnpm test\nnpm run typecheck\nnpm run build\nnpm run evaluate"
          }
        </Code>
      </section>
      <section className="section">
        <SectionHeading
          label="WHAT THE REPORT CAN TELL YOU"
          title="Measured, observed, or still unknown."
        />
        <div className="measurement-table">
          <div>
            <strong>Automated contracts</strong>
            <span className="evidence-state">Measured in the report</span>
            <p>
              Validation, lifecycle gates, resource accounting and synthetic
              recovery cases.
            </p>
          </div>
          <div>
            <strong>Real survival behavior</strong>
            <span className="evidence-state">Separate local fixtures</span>
            <p>
              Specific controlled gameplay scenarios, with their own setup and
              limitations.
            </p>
          </div>
          <div>
            <strong>General reliability</strong>
            <span className="evidence-state pending">Not established</span>
            <p>
              No broad success rate across arbitrary seeds, terrain or
              long-running missions.
            </p>
          </div>
          <div>
            <strong>Model comparisons</strong>
            <span className="evidence-state pending">Not benchmarked</span>
            <p>
              No model leaderboard or monetary estimate inferred from token
              counts.
            </p>
          </div>
        </div>
      </section>
      <div className="explanation-list">
        <section>
          <h3>Resource truth arrives late.</h3>
          <p>
            Inventory events may arrive after an action finishes. Server
            confirmation, reservation ownership and freshness labels prevent
            optimistic updates from becoming false progress.
          </p>
        </section>
        <section>
          <h3>Failure is part of execution.</h3>
          <p>
            Tasks carry checkpoints and bounded recovery. A blocker becomes
            visible work for the player, not an endless model retry loop.
          </p>
        </section>
        <section>
          <h3>Latency has several owners.</h3>
          <p>
            Direct commands and deterministic skills avoid unnecessary
            inference. Speech, model generation and game execution still need
            separate measurements; an instant reply is not promised.
          </p>
        </section>
      </div>
    </>
  );
}
function Contribute() {
  return (
    <>
      <Intro
        label="CONTRIBUTE"
        title={
          <>
            Make one
            <br />
            thing better.
          </>
        }
      >
        A useful contribution can be a clearer error, a tested recovery or a
        better way to work together. Start with a real problem and a small,
        reviewable change.
      </Intro>
      <section className="contribution-start">
        <div>
          <span className="eyebrow">A RUNNABLE FIRST STEP</span>
          <h2>
            Observe something.
            <br />
            Explain it well.
          </h2>
          <p>
            The included inventory observer receives a copied world snapshot and
            returns validated output. It has no bot mutation handle. Follow the
            example, change its summary and test unknown as well as observed
            inventory.
          </p>
          <a
            className="text-link"
            href={sourceLink("examples/extensions/inventory-summary.js")}
          >
            Open the example <Arrow />
          </a>
        </div>
        <div>
          <Code>
            {
              "node --test test/extensions.test.js\nnode --test test/workspace.test.js"
            }
          </Code>
          <p className="fine">
            Installed extensions are trusted code, not a sandbox. New action
            modules require runtime integration, permissions and actual gameplay
            tests.
          </p>
          <a className="text-link" href={sourceLink("docs/EXTENSIONS.md")}>
            Read the extension contract <Arrow />
          </a>
        </div>
      </section>
      <section className="section">
        <SectionHeading
          label="CONTRIBUTION PATHS"
          title="Find a problem worth solving."
        >
          <a className="text-link" href={repository + "/issues"}>
            Browse issues <Arrow />
          </a>
        </SectionHeading>
        <div className="contribution-list">
          {contributions.map(([level, title, text]) => (
            <article key={title}>
              <span className="level-label">{level}</span>
              <div>
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
      <section className="contribution-rules">
        <h2>
          Before you send
          <br />a pull request.
        </h2>
        <ol>
          <li>Describe the observed problem and expected behavior.</li>
          <li>
            Preserve permissions, cancellation and truthful resource counts.
          </li>
          <li>
            Add evidence appropriate to the change; label fixtures as fixtures.
          </li>
          <li>
            Leave secrets, private conversations and game assets out of Git.
          </li>
        </ol>
        <LinkButton to={sourceLink("CONTRIBUTING.md")} quiet>
          Read the contributor guide
        </LinkButton>
      </section>
      <section className="plain-split">
        <h2>
          Thinking about
          <br />
          another game?
        </h2>
        <div>
          <p>
            Start with a permitted connection and one cooperative task. The
            shared observation contract is ready to inspect; Minecraft’s action
            executor is not a universal game controller.
          </p>
          <a
            className="text-link"
            href={repository + "/issues/new?template=game-integration.yml"}
          >
            Write a game proposal <Arrow />
          </a>
        </div>
      </section>
    </>
  );
}
function Roadmap() {
  const groups = [
    {
      label: "IN YOUR HANDS",
      title: "The current foundation.",
      summary: "Minecraft Survival and the shared companion workspace.",
      items: [
        "Bounded survival skills and approved construction",
        "Actual inventory, resource plans and assistance",
        "Conversation, local voice and optional saved moments",
        "Tested game-observation and extension contracts",
      ],
    },
    {
      label: "NEXT USEFUL WORK",
      title: "Make the first world better.",
      summary: "Priorities, not dated delivery promises.",
      items: [
        "Wider controlled survival tests and clearer recovery",
        "Secure macOS/Linux credential and voice support",
        "Signed installers and clean-machine setup validation",
        "Dependency advisory reduction and accessibility fixes",
      ],
    },
    {
      label: "OPEN RESEARCH",
      title: "Earn the next capability.",
      summary: "These are investigations, not available features.",
      items: [
        "A second game with a permitted integration",
        "Safer cave mining and broader build supply chains",
        "Measured model and hardware comparisons",
        "Multiple embodied agents with explicit ownership",
      ],
    },
  ];
  return (
    <>
      <Intro
        label="ROADMAP"
        title={
          <>
            Keep it useful.
            <br />
            Open the next door.
          </>
        }
      >
        The direction is a companion for more games. Progress starts by
        improving the world it can play in now and making each new claim earn
        its evidence.
      </Intro>
      <div className="roadmap">
        {groups.map((group) => (
          <section key={group.label}>
            <div>
              <span className="eyebrow">{group.label}</span>
              <h2>{group.title}</h2>
              <p>{group.summary}</p>
            </div>
            <ul>
              {group.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <section className="roadmap-invitation">
        <h2>Bring a concrete proposal.</h2>
        <p>
          Explain the cooperative goal, the interface it could use and how we
          could test the result. GitHub issues are the current public proposal
          system. There are no invented vote counts or unannounced release
          dates.
        </p>
        <LinkButton to={repository + "/issues/new/choose"}>
          Propose the next step
        </LinkButton>
        <a className="text-link" href={sourceLink("docs/ROADMAP.md")}>
          Read the development roadmap <Arrow />
        </a>
      </section>
    </>
  );
}
export default function App({ route }: { route: string }) {
  const content: Record<string, ReactNode> = {
    "/": <Home />,
    "/get-started/": <GettingStarted />,
    "/games/": <Games />,
    "/how-it-works/": <Architecture />,
    "/features/": <Features />,
    "/docs/": <Documentation />,
    "/engineering/": <Engineering />,
    "/contribute/": <Contribute />,
    "/roadmap/": <Roadmap />,
  };
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <div className="site-shell">
        <Header route={route} />
        <main id="main">
          {content[route] || (
            <Intro label="PAGE NOT FOUND" title="Find your way back.">
              <a href={href("/")}>Return to the homepage</a>
            </Intro>
          )}
        </main>
        <Footer />
      </div>
    </>
  );
}
