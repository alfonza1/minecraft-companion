# Minecraft Companion

Local Minecraft Java teammate and build workspace extending [Mineness](https://github.com/SpectrumTantrum/mineness). React/TypeScript, Mineflayer, Microsoft device authentication, Codex conversation/planning, local Whisper/Piper speech, SQLite and a real blueprint viewer.

**Realm compatibility:** the pinned native adapter connects directly to **26.3**, protocol777, using Mineflayer's Microsoft authentication. A licensed Realm connection passed a passive check without translation or kicks. The official local 26.3 survival fixture passed inventory, movement, crafting, gathering, full-cube building/checkpoint recovery and reconnect tests. These are separate from untested Realm gameplay. New 26.2/26.3 materials still need validated gathering/construction metadata. See [native adapter boundaries](services/native-26.3/README.md). The optional [bridge](services/protocol-bridge/README.md) remains a restricted fallback when the native adapter is absent.

## Launch

**Teammate tools:** temporary requests now save and resume the previous job. In **Companion**, configure routines, named places, approved supply chests, update frequency and death recovery. Try “help me,” “get ready to mine,” “bring me a stack of oak logs,” or “resume previous task.” Stop clears saved tasks; Pause preserves them. [Controls, examples and tested limits](docs/TEAMMATE.md).

Dependencies, dashboard and free speech models are installed on this PC. Double-click **Start Minecraft Companion.cmd**, or:

```powershell
.\scripts\Start.ps1
```

Open **http://127.0.0.1:4365**. No browser opens automatically. Keep the console open; Ctrl+C shuts down the service. Dashboard Stop disconnects the bot/audio while keeping the dashboard available.

Choose **Setup** in navigation whenever you need the guided checks. Overview and Settings show an issue banner only for confirmed account/service/Realm connection problems or a missing Realm selection. An offline/paused bot, unchecked startup session or disabled microphone does not mean setup is unfinished. Five steps check local services, display Microsoft device sign-in, select/ping invited Realms, test your own microphone/speakers and start a first session. Opening setup performs no login, microphone capture, gameplay or model request. Audio checks require an explicit click; leaving a wizard-owned offline audio session pauses it.

The Windows desktop launcher is installed with `powershell -NoProfile -File scripts/Install-DesktopLauncher.ps1 -DesktopShortcut` (also used by Bootstrap's `-DesktopShortcut`). It opens a dedicated **Minecraft Companion** window using the installed Evergreen WebView2 runtime, with its own icon, application identity and isolated profile. It does not open an Edge browser window. The desktop, Start-menu and taskbar shortcuts target the stable launcher, which always reads this working copy. The taskbar pin was installed through Windows and its target/application identity verified on this PC.

Source fingerprints detect uncommitted dashboard/backend edits; opening the launcher rebuilds changes and starts the localhost service. Native desktop sources are also rebuilt into versioned directories, so the pinned target stays valid. Generated .NET `bin/obj` folders do not cause update loops. **Apply local updates** refreshes a disconnected service and the view; a live session is preserved and the bar explains that you must Stop before applying backend updates. Closing the window leaves the service running; use Stop to disconnect your teammate. Reopening with a saved Realm rechecks the selected account's cached Microsoft session. First-time sign-in remains an explicit setup action.

Desktop builds require the .NET10 SDK (already installed here); Bootstrap's `-DesktopShortcut` installs it through winget if missing. WebView2 SDK1.0.3800.47 is pinned in `apps/desktop/packages.lock.json`, and restore uses locked mode. WebView2's runtime is already installed on this Windows11 PC and receives Microsoft's Evergreen updates. Binaries, the desktop profile and launcher logs stay under `%LOCALAPPDATA%/MinecraftCompanion/launcher`, outside Git. The normal desktop app exposes no debugging port. Its explicit test-only debugging mode binds to loopback and uses a separate profile.

Use **Start planning offline** in Companion/Build Studio for conversation, voice and text architecture without a Minecraft connection. This explicit control enables requests; starting the session and remaining idle make zero model calls. Pause prevents further inference until explicit resume.

Fresh checkout:

```powershell
.\scripts\Bootstrap.ps1
# Optional desktop shortcut:
.\scripts\Bootstrap.ps1 -DesktopShortcut
```

Bootstrap installs lockfile dependencies and the checksummed native26.3 adapter, builds the dashboard, prepares private Python speech dependencies/models and installs the optional protocol bridge. Safe missing Node/Git/Python prerequisites use winget. Node 22.12+ required; this PC runs24. Native connections need no Java; the bridge reuses a compatible JDK or installs a private checksummed one outside Minecraft. Use `-SkipBridge` for native-only setup. After a standalone `npm ci`, run `npm run setup:native` to restore the adapter. Minecraft files are preserved. Optional recipe extraction reads exact-version client JARs without modifying them. `.env.example` documents process environment variables; `.env` files are not automatically loaded.

## Account onboarding

1. Setup → **Minecraft account** → **Connect Minecraft account**, using the separate licensed bot account.
   To choose another Microsoft account, use **Connect in private window**. It requests a fresh device code and opens Microsoft Edge InPrivate (Chrome Incognito is the fallback). Previous encrypted caches are preserved in the application data directory; the selected session persists across restarts. If a code is already displayed, **Open in private window** reopens that same sign-in. **Open account setup privately** opens the official Java profile page when profile setup is required. Private windows open only after your click; browser policy can prevent private mode. If private launching is unavailable, use the official link's context menu to open it privately.
2. Follow the official Microsoft URL/device code. Enter passwords/MFA only at Microsoft. Never paste passwords, recovery codes or tokens into this app.
   If Minecraft reports **profile required**, finish the bot account's Java username setup on Minecraft.net or in the official launcher, then use **Check Java profile again**. The saved Microsoft session is reused; a missing Java profile is distinct from an unverified license or a temporary profile service failure.
3. Invite the bot account and accept any pending invitation through Minecraft. Refresh and select an available Realm.
4. Set your player username for trusted in-game `@companion` messages.
5. Check Realm compatibility, then connect in **First session**. The selected Realm is pinged and its protocol validated before login. If its status endpoint closes, an exact recognized `activeVersion` from the authenticated Realms service can establish compatibility; the UI identifies that source. Unknown versions are never guessed. Native/translated protocols are distinguished. Expired sessions, kicks and unavailable/unsupported Realms appear as errors.

Sessions use prismarine-auth's supported CacheFactory with **Windows DPAPI CurrentUser**, outside Git in `%LOCALAPPDATA%\MinecraftCompanion\auth`. Tokens never enter dashboard state. Connection preparation is cancellable. Reconnect uses bounded backoff, returns paused and never silently resumes interrupted work.

## Voice and Codex

Free local defaults: faster-whisper tiny.en CPU int8, Silero VAD and full-precision Kokoro neural TTS. **Settings → Voice & audio → Companion voice** offers nine Kokoro American/British voices plus the lightweight Piper LJ Speech alternative. Recommended uses Kokoro Heart when installed. **Preview voice** generates a fixed local sample without microphone capture or Codex; previews are blocked while paused. Kokoro models/voices use Apache-2.0; Piper's dataset is public domain and its model card is retained. Windows SAPI remains a fallback. See [speech setup, evidence and licenses](services/voice/README.md).

- Explicitly enable browser voice, then select devices, PTT/hands-free, speed and volume. Browser noise suppression/echo cancellation are requested. Headphones improve reliable barge-in.
- Settings voice previews now reuse prepared full-quality samples rather than reloading Python/the neural model on every click. All installed voices are prepared during speech setup; cached samples survive restarts and speed changes preserve pitch without re-synthesis. Only the fixed public test sentence is stored. Missing samples prepare once with a cancellable loading label; ordinary conversation speech is not cached.
- **Push-to-talk key → Change key** records a keyboard key, optional Ctrl/Alt/Shift chord, or Mouse4/5. F8 remains the default and Reset restores it. The binding persists locally and also works in browser voice while the app is focused. Changing/resetting pauses capture, then restores your saved desktop voice setting. Ordinary typing fields ignore letter shortcuts in browser mode. The game still receives your shortcut, so choose an unused binding.
- Desktop voice defaults on for active connected sessions and restores after explicit resume. Its enabled preference and native microphone/speaker choices persist across app restarts; Disable remains off until you enable it again. It polls the configured key/modifiers using Windows GetAsyncKeyState; no keyboard hook installation or system settings changes. Browser PTT ends on focus loss; native PTT runs independently of focus. Both stop on pause/stop/disconnect. Physical microphone/headphone/global-key operation still needs a user check.
- Barge-in cancels speech/current conversation inference while safe work can continue. Explicit stop/wait/forget-that/new-plan/cancel stops the gameplay plan. Emergency Stop disconnects.
- Microphone audio stays in RAM and is piped to local workers. No recording retention. Conversation text is stored locally and sent to Codex when requested.

Codex uses the existing authenticated CLI subscription. If needed, `codex login` restores login. A restricted native CLI process has shell, apps, hooks, plugins, browsing and delegation disabled, an empty working directory and validated structured JSON plans. Game chat/media cannot become shell commands. No paid speech API or OpenAI API key is required.

**Settings → AI models & reasoning → Companion model** lists the selected provider’s visible model catalog and saves your choice. Automatic resolves its reported default. The panel distinguishes the current request from the next selection and last completed request. Changing the selection leaves an in-flight request on its original provider/model. Refreshing models performs metadata queries without model turns. Catalog discovery does not guarantee account access. Codex retains its [official model discovery interface](https://learn.chatgpt.com/docs/app-server#list-models-modellist).

**Settings → AI models & reasoning → Model provider** switches between Codex, Claude Code and OpenCode. Each provider remembers its own model choice. Switching affects the next AI request without resetting gameplay, saved work or memories. The panel distinguishes the running request from the next selection and includes searchable real model catalogs. Codex remains the default for existing installs.

- **Claude Code:** uses the installed native Claude Code executable through the pinned official Agent SDK and your subscription sign-in. Click **Sign in to Claude Code**, finish the official browser flow, then **Refresh models**. There is no paid API-key fallback, password/token field or copied credential. Claude Code currently reports signed out here, so real Claude inference remains unverified until the user signs in. This is a personal local integration; account/model access remains governed by Claude Code. [Official CLI/authentication reference](https://code.claude.com/docs/en/cli-reference).
- **OpenCode:** uses the installed OpenCode v2 stateless generation API with existing configured provider credentials, including `abliteration-ai/abliterated-model-large-v2`. Each request has a private password-protected localhost worker, receives prompt data over HTTP, and exits after completion/cancellation. No OpenCode coding session or executable model tools are started. Hosted models use your existing provider billing; local models require their own server to be running. This experimental v2 endpoint may change with future versions. [Official API reference](https://dev.opencode.ai/v2/docs/api#generate).

Conversation context goes to the provider selected for that request. Providers share the same validated actions, approval controls, persistent tasks and pause/stop gates. OpenCode's stateless endpoint does not report token counts: request limits apply, but token totals and the input-token cap cannot account for those calls. Such completed requests are counted separately and totals labelled incomplete. Errors/cancellations can also omit usage. No dollar cost or account quota is invented. Catalog discovery starts no inference turns.

**Settings → AI models & reasoning → Low token mode** is an optional, persistent switch, off by default. Its expandable explanation lists every change. It disables new AI blueprint generation/redesign and omits optional coding-skill instructions from new Codex requests. Conversation uses four previous messages (400 characters each), five relevant notes (300 characters each), inventory totals and compact world/task summaries instead of full records. Simple recognized inventory/count, position, health and task-status questions get local replies without Codex. Other questions and complex planning still use your selected model, with brief replies requested. Smaller context can require clarification; older history and memories stay stored locally.

Live inventory, dashboard updates, voice, deterministic safety/gameplay, handoffs and automatic task resume remain enabled. **Inventory pickup updates already consume zero model tokens.** Blueprint imports, previews, exact material calculation, assignments and approved construction also remain available. Model choice, reasoning effort and usage limits do not change. The switch applies to the next request without cancelling an in-flight request. Turning it off restores normal context and AI design access. Codex's own overhead still applies; no fixed savings percentage is promised. The installed CLI accepts the documented [skill instruction configuration](https://learn.chatgpt.com/docs/agent-configuration/subagents); no private conversation was submitted to benchmark savings.

Actual request/input/output/cached-token usage is shown when supplied. Dollar costs/account limits are unknown. The local input-token cap is off by default; usage is still tracked. Settings → AI models & reasoning → Limit input tokens enables an optional cap. When enabled, Start new token budget renews that allowance without erasing lifetime usage. The separate hourly request limit and provider/account limits still apply. CLI system overhead can contribute about20k input tokens per small request; cached counts are separate. No inference polling loop runs. General current-information browsing is not enabled. Explicit YouTube discovery uses Codex live web search.

## Survival controls

One runtime owns one body. Upstream MCP survives separately as `npm run upstream:mcp -- --username NAME`; never launch competing controllers for one account.

Available skills reuse Mineness observation, walking, following, tree collection, bounded approved-area mining and crafting. Item dropping, visible-player handoff and equipping use server-confirmed inventory. Initial deterministic controllers handle eating, surfacing, nearby threat retreat and basic in-reach defense. Movement disables terrain digging/towers, parkour and large drops. **Companion → Travel pace** defaults to brisk: normal survival sprinting when health/hunger are at least 14 and no hostile is within 12 blocks; choose normal to conserve food. These are initial controllers, not human-level survival competence.

Commands such as “get 16 oak logs”, “give me the wood”, “drop 3 oak logs”, “follow me” and “come here” bypass model inference. A new direct action cancels existing work and waits for its body to stop; Pause/Stop still take precedence. General questions continue through Codex. Tree gathering batches unique coordinates across natural trees, equips the fastest owned tool and waits for landing before digging. It stops when inventory is full and reports collected inventory separately from mined blocks. Give the companion an axe for faster chopping; this controller does not automatically craft one. The native26.3 adapter remaps inherited material/tool IDs so an actual axe has its proper vanilla digging speed. It does not increase Minecraft's permitted mining speed.

Handoffs walk toward the configured visible player and throw the requested owned items using ordinary inventory clicks. Counts are reconciled against the server after transfer, including cancellation. The dashboard never claims access to the recipient's inventory. Missing server confirmation marks inventory unverified and blocks exact allocation, gathering/crafting and construction until a full inventory update arrives.

Approve expendable natural terrain under **Companion → Approved mining area** before generic mining. Targets must be observed, within that area and at/above foot height. Models cannot grant that permission. Tree checks require natural soil and matching observed leaves; they cannot prove a tree was never player-built or decorated. Supervise important areas.

Pause gates new work before cancelling processes/gameplay and saves progress. In-flight library operations remain owned until settled; resume/new jobs cannot overlap them. Stop shuts down capture/inference and disconnects. A stuck dependency can keep resume blocked rather than permit conflicting actions.

## Build Studio and resource planning

Create a project using an installed supported Java version. Import complete blueprint JSON or Sponge `.schem` v1-v3. A bounded parser worker rejects invalid palettes, unknown blocks/states, oversized volumes and decompression bombs. MCEdit/Litematica are unsupported.

**Generate design** makes a real Codex request from a written description. Its complete saved design is validated and labeled reconstructed. Sharing reference data is explicit. Uploaded media stays local until you select and consent to source analysis. Codex inspects sampled uploaded frames/screenshots; optional Gemini inspects public YouTube video/audio. No unrestricted YouTube downloading or invented measurements.

Three.js renders actual saved blocks with local textures, orbit/zoom, floor/roof/section filters and observed progress. Special shapes use voxel geometry, not a complete Minecraft model renderer.

Placement counts are exact for complete saved designs. Actual versioned crafting recipes/yields aggregate intermediate requirements before batch rounding. Placed blocks, required items, raw resources and contingency are separate. Existing exact-version vanilla JARs provide read-only smelting/stonecutting recipes/tags with SHA256 provenance (this PC has1.21.5). Missing production data and fuel choices stay explicitly unresolved.

Split globally or per material; manual user stock is labeled user-reported. Bot stock comes from live inventory observations and is allocated once across projects. It does not imply knowledge of your inventory or remote chests. Reservations prevent double spending. Explicit assigned wood gathering runs a bounded batch and reconciles observed inventory.

Approve every revised blueprint before construction. Placement supports **inert cubes, dry stairs/slabs, paired closed doors, oriented logs/pillars, fences and panes**. It uses block faces, cursor height, heading and actual server states, and confirms inventory before restocking. Doors are placed after the shell to preserve access. Approved supply chests and common crafting can refill construction in batches; an entire house need not fit in inventory. No terrain clearing, OP permissions or server commands. Completion and resumed checkpoints are checked against the observed world.

In **Build studio → Automatic worksite**, choose the coordinates and prepare the worksite while the companion is connected nearby. Review the temporary-block count/boundary, then **Start construction**. The saved plan can build a normal stair ramp, perimeter platforms and shaped-placement braces using dirt or cobblestone, then remove acknowledged temporary blocks. Pause/stop preserves their ownership records; cleanup is available separately. Changed or unconfirmed blocks stop cleanup. Designs are bounded to32×16×32 and512temporary blocks; clear observed space and a grounded northwest entrance are required. This does not guarantee access to every large interior or roof.

Enable **Gather missing common raw materials** to fetch oak/spruce/birch logs and cobblestone/dirt/sand within64blocks, craft supported common recipes and a workbench if needed, then return to construction. Approve the mining area once in **Companion → Safe mining area** for nonwood resources. Known project footprints and named bases are protected. Tree recognition uses observed soil/canopy, not knowledge of ownership. **Cover my remaining common-material share too** allows fetching your remaining share; disable it to honor the split. Temporary supplies and the four-plank workbench are separate extras; the workbench stays at the site. Scarce supplies, furnace/stonecutter production, worn tools, full inventory, night, danger and inaccessible sources can still require help. Gathering is bounded, with no endless retries or model polling. Run `node scripts/test-native-game.mjs --automatic-build` and `--building-only` for isolated survival checks.

## Data, verification and limitations

SQLite/auth/models live outside Git under `%LOCALAPPDATA%\MinecraftCompanion`. Settings offers SQLite backup and JSON export; backup includes saved conversation but excludes the separate encrypted auth cache. Memory supports inspect/add/delete. JSON import, memory editing and automatic older-context summarization remain incomplete.

```powershell
npm run health
npm test
npm run typecheck
npm run build
node scripts/test-companion-game.mjs
# Optional official-server tests, after accepting the linked Minecraft EULA:
.\scripts\Setup-VanillaTest.ps1 -AcceptMinecraftEula
node scripts/test-vanilla-game.mjs
# Optional current-version bridge test, with the same explicit EULA requirement:
.\scripts\Setup-ModernTest.ps1 -AcceptMinecraftEula
node scripts/test-modern-bridge.mjs
# Native current-version survival (no translation, no account):
node scripts/test-native-game.mjs
# Guided setup browser checks (no physical microphone or login):
node apps/dashboard/tests/setup-integration.mjs
# Explicit live Codex requests, using a disposable app database:
node scripts/test-companion-live.mjs --codex
```

See [verification](docs/VERIFICATION.md), [phase checklist](docs/IMPLEMENTATION.md), [build APIs](services/build-planner/README.md) and [contracts](docs/INTERFACES.md). Tests distinguish doubles, real parsers, actual process/audio/provider calls and local survival gameplay. Official1.21.5 and native26.3 vanilla crafting passed with actual inventory transactions. The private test JRE is outside Minecraft and never changes system Java/PATH. Passive licensed26.3 Realm login is separately verified; Realm crafting/gathering/construction remain untested.

Unfinished requested scope includes advanced cave/branch mining, creating/expanding farms, general furnace production workflows and trading, armor optimization, guard coordination, Nether/End progression, unrestricted strategic initiative, open-ended voice project reassignment, full-video coverage/local caption alignment, general terrain preparation/repair, unrestricted building supply chains, player inventory companion, provider-token speech streaming, alternative STT settings, conversation summarization and full project import. See [current capabilities and limitations](docs/CAPABILITIES.md). These are bounded implemented slices, not all eight completed phases.

The API binds **127.0.0.1 only**, with host/origin checks for HTTP/WebSockets. Remote access/authentication are unavailable. No public ports, purchases, paid accounts or sensitive system changes were made. Paper/RCON/skins/plugin workflows remain offline upstream tools and are not used for Realms. Original [Mineness README](docs/UPSTREAM.md), LICENSE and NOTICE retain attribution. Minecraft is a Mojang/Microsoft product; no affiliation is implied.

## YouTube choices and separate conversation model

Say **“Find medieval cottage options on YouTube”** or use **Build Studio → Find on YouTube**. Search sends only your query and saved building-style preferences to Codex live web search. Public oEmbed verifies the returned video links; the app retains the latest ten searches. Natural, medieval and cottagecore are the default preferences, editable in saved memory. This search currently requires Codex as the work provider; other providers can use pasted YouTube references. Ordinary chat never starts browsing automatically.

Choose a result, then use **Analyze the actual source**. Public YouTube video/audio analysis uses an optional Google AI Studio key saved encrypted outside Git. Uploaded screenshots and sampled video frames use your existing Codex login after explicit sharing consent. Review the evidence and source-reported materials, then use **Reconstruct this build + calculate materials**. This preserves the identified structure/palette rather than generating an inspired substitute. Hidden or missed details remain uncertain; exact counts describe the resulting saved blueprint, not a guaranteed exact tutorial copy. The older inspired-design option remains inside its own optional disclosure. Import an authorized complete schematic for the strongest source accuracy. The survival builder checks each block/state against tested placement adapters; unsupported details are preserved and reported as construction blockers.

The assisted plan splits supported common materials 50/50, with odd leftovers assigned to you. Materials without a validated acquisition route go entirely to you and show why. This is a conservative skill assessment, not knowledge of distant resource availability or an equal estimate of gathering time. Furnace fuel remains separate when unresolved. Change any assignment in Shared tasks. Say **“split the materials in half”**, **“I’ll get all the stone, you get the wood”**, or **“what materials do we need?”** for the selected reference project. Existing reported/observed contributions are preserved. Gathering remains approval-gated; assigned automatic gathering currently supports oak/spruce/birch logs, while approved-area mining is a separate explicit skill.

In **Settings → AI models & reasoning**, enable **Separate conversation model** and choose **Conversation model**. **Companion model** handles work plans, designs and research. Each provider saves its own choices. Both receive current world/task/project state, shared memory and recent conversation on each turn; switching never clears saved work. Explicit common commands remain deterministic and use no model. Ambiguous requests that the conversation model identifies as gameplay are replanned by the work model before execution, so those turns can use two requests. Pause/cancellation gates both. Low-token mode compacts this same shared context.

The installed account accepted `gpt-6-luna` for conversation and `gpt-6.1-sol` for work. A fixed Luna greeting took about5.1seconds in one test; this is not an instant-response guarantee. Warm local speech avoids repeated model loading, but provider, speech and network latency still apply.

## Actual source analysis

In Build Studio, open **Direct YouTube connection** and save your own Google AI Studio key in the password field. Do not paste it into chat. Use a key with billing disabled for free-tier-only operation; the app cannot verify your billing tier, access or future pricing. Free-tier data may be used by Google to improve its products. No billing is enabled and no paid fallback runs. The default video model is `gemini-3.8-flash`. [Video input](https://ai.google.dev/gemini-api/docs/video-understanding), [pricing/data use](https://ai.google.dev/gemini-api/docs/pricing).

Alternatively, upload permitted PNG/JPEG/WebP images or MP4/WebM video and use your existing Codex work model. Select up to eight references with at most one video. Current limits: images8MiB on the backend, video24MiB in the UI, known duration up to60minutes, dimensions up to4096×4096. PyAV decodes up to24 video frames at960px in a bounded private process with file/network subprotocols disabled. Sampled visuals do not include local audio transcription or every tutorial stage. Frames are removed after the request. Decoder/model timeouts and attachment limits bound processing; no new model dependencies are installed.

Both routes produce source evidence with measurements, visible/spoken/inferred observations, timestamps, source-reported materials and unresolved details. Review it before reconstruction. Codex turns that evidence into box operations that expand into the actual blueprint, up to50,000placements,128blocks per axis and262,144cells volume. It preserves identified geometry/palette and reports unsupported states instead of replacing them to fit the builder. Hidden details require review; exact quantities describe only the saved blueprint. Assisted gathering shares are computed afterward; construction remains separately approval-gated.

Pause/Stop joins decoding/Codex cancellation. Google uses tracked background interaction IDs, explicit remote cancellation and deletion after retrieval/cancellation. Failed cleanup remains visible and blocks another Google analysis until resolved. A connection failure before Google returns a job ID cannot prove whether remote work started; inspect the Google account before retrying. Provider retention/data-use policies still apply. Keys are DPAPI-encrypted under private provider-secrets and excluded from settings/state/export responses.


## Faster work and difficult materials

Construction prepares a bounded section supply batch, groups nearby placements by height/material,
crafts several recipe repetitions per workbench session, and adds access scaffolds as higher layers
need them. It checks usable tools and can withdraw plain replacements from explicitly approved
chests. Actual server placement, inventory and mining confirmations remain required.

Say **“get another stack of oak logs”**, **“keep building”**, or **“find bamboo”** for deterministic
commands. Temporary requests continue to use the existing resume-after-help setting.
Difficult or unavailable materials produce a spoken request and a persistent card in **Shared tasks**.
The assisted split defaults biome-specific and unsupported supplies to you. An explicit search checks nearby loaded Overworld surface terrain and can expand to256 blocks,
saving breadcrumbs to retrace home. Longer trips need saved Home/Base or confirmed server spawn within64 blocks,
a clear observed route to it and eight food items. Valuable cargo must be deposited first;
protected or reserved valuables that cannot be deposited block departure. It saves observed
source locations and returns early when food, health or daylight reserve drops. It does not guarantee
a distant jungle or automatically harvest an unapproved source. Temporary dirt/cobblestone platforms
need no bamboo; the Minecraft scaffolding item does need bamboo and string.

Speech weights warm at activation and remain loaded while active, trading some RAM for lower latency.
Both desktop PTT and browser voice play sentence-sized audio while subsequent sentences synthesize.
Pause/Stop cancels actual synthesis and releases the worker. The AI's validated response must arrive
before speech starts; this is not provider-token streaming or instant thinking.
**Settings → Diagnostics → Where time goes** shows measured stage timings without model calls or
invented costs. See [limits, tuning and evidence](docs/SPEED-IMPLEMENTATION.md).


Loot is deposited only in approved chests within32 blocks of saved Home/Base.
With no saved home, the fallback is the server-reported spawn point for that Realm/dimension.
Spawn is learned from the Minecraft protocol and cached locally; the bot never assumes its
login coordinates or a default `(0,0,0)` value are spawn. If the required storage is unknown,
unavailable, full or too far away, it retains its items and asks for help. Supply withdrawals
still obey their own approved-chest permissions. Longer searches also use spawn as their
return anchor when Home/Base is unset.


## Independent food, terrain and storage

With **Stay productive between my requests** enabled, the teammate now starts food
searches even when no eligible animal is already nearby. It previews observed paths
on ordinary slopes, prioritizes observed wild animals, rescans as it moves, can make
a workbench and wooden axe from unreserved common wood, and returns after its search.
It checks known food stock once rather than repeatedly walking back to empty chests.
Say **look around**, **walk around**, or **check for food** to start deterministic skills.

Home/spawn storage can bootstrap a workbench/chest, gather missing common wood from
observed natural trees, and create another separate chest when existing approved
storage fills. Only clear, grounded sites are used; existing blocks and project sites
are protected. New companion-owned chests permit deposits and common supply withdrawals;
rare, named, enchanted and reserved supplies remain protected. Limits:12 automatic
chests per home area, three expansion passes per task,64-block food-search radius,
12 food-scouting legs and bounded action deadlines. Terrain previews reject digging,
block placement, water/lava and drops beyond ordinary one-block steps. This is not
unrestricted cave navigation, fishing, farm creation or guaranteed survival.

Evidence: `node scripts/test-native-game.mjs --independence` uses an isolated official
26.3 survival server. It tests gathering missing wood from a one-log start, actual
crafting/placement/deposits, full-chest expansion, and food scouting across a low hill
with automatic wooden-axe preparation and confirmed meat pickup/return. No personal
Realm is used for these destructive fixture tests.


## Cooking without a setup checklist

Food gathering now cooks its raw catch, and productive mode prioritizes uncooked food
even when it already carries a full food stack. The Cook button/voice command prepares
its own prerequisites: a wooden pickaxe if needed, eight cobblestone from safe exposed
Overworld rock, a crafting table/furnace and fuel. It uses spare coal/charcoal first
when sufficient, otherwise gathers common wood and crafts planks for fuel. Coal mining
is not required. All inputs/fuel must be unreserved and unprotected.

Quarrying is limited to12 blocks,32-block observations and four scouting steps within48
blocks. It avoids digging below its feet, the immediate Home/spawn area, known chests
and saved build footprints. No unsafe tunneling or terrain clearing. Cooking handles
up to eight items per batch within a four-minute action budget. Missing safe sources,
danger or uncertain server inventory stop the job with an actionable reason.

Furnaces are placed on clear observed ground at Home/spawn when known. Occupied foreign
furnaces are left alone; an interrupted own batch resumes only when its scoped checkpoint,
input/output and fuel match. Deposits and cooked output use server inventory confirmation.
A paused furnace may continue smelting on the Minecraft server; resuming recovers its
matching batch without restarting it or mixing somebody else's work.
