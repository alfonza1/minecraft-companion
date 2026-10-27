# Minecraft Companion

Local Minecraft Java teammate and build workspace extending [Mineness](https://github.com/SpectrumTantrum/mineness). React/TypeScript, Mineflayer, Microsoft device authentication, Codex conversation/planning, local Whisper/Piper speech, SQLite and a real blueprint viewer.

**Current Realm blocker:** installed Mineflayer 4.39.0 / minecraft-protocol 1.68.0 support through **26.1**; Minecraft Java's current release is **26.3**. Unsupported Realms are refused. Authentication and selection are implemented but no licensed bot account or Realm gameplay was validated. Protocol support must catch up; changing dashboard settings cannot bypass it. Do not buy an account just to test this version.

## Launch

Dependencies, dashboard and free speech models are installed on this PC. Double-click **Start Minecraft Companion.cmd**, or:

```powershell
.\scripts\Start.ps1
```

Open **http://127.0.0.1:4365**. No browser opens automatically. Keep the console open; Ctrl+C shuts down the service. Dashboard Stop disconnects the bot/audio while keeping the dashboard available.

Use **Start planning offline** in Companion/Build Studio for conversation, voice and text architecture without a Minecraft connection. This explicit control enables requests; starting the session and remaining idle make zero model calls. Pause prevents further inference until explicit resume.

Fresh checkout:

```powershell
.\scripts\Bootstrap.ps1
# Optional desktop shortcut:
.\scripts\Bootstrap.ps1 -DesktopShortcut
```

Bootstrap installs lockfile dependencies, builds the dashboard and prepares private Python speech dependencies/models. Safe missing Node/Git/Python prerequisites use winget. Node 22.12+ required; this PC runs24. No new Java is needed for Realms. Minecraft files are preserved. Optional recipe extraction reads exact-version client JARs without modifying them. `.env.example` documents process environment variables; `.env` files are not automatically loaded.

## Account onboarding

1. Settings → **Connect Minecraft Account**, using the separate licensed bot account.
2. Follow the official Microsoft URL/device code. Enter passwords/MFA only at Microsoft. Never paste passwords, recovery codes or tokens into this app.
3. Invite the bot account and accept any pending invitation through Minecraft. Refresh and select an available Realm.
4. Set your player username for trusted in-game `@companion` messages.
5. Start Companion. The selected Realm is pinged and its protocol validated before login. Expired sessions, kicks and unavailable/unsupported Realms appear as errors.

Sessions use prismarine-auth's supported CacheFactory with **Windows DPAPI CurrentUser**, outside Git in `%LOCALAPPDATA%\MinecraftCompanion\auth`. Tokens never enter dashboard state. Connection preparation is cancellable. Reconnect uses bounded backoff, returns paused and never silently resumes interrupted work.

## Voice and Codex

Free local defaults: faster-whisper tiny.en CPU int8, Silero VAD and Piper LJ Speech neural TTS. Piper's dataset is public domain; its model card is retained. Windows SAPI is fallback. See [speech setup, evidence and licenses](services/voice/README.md).

- Explicitly enable browser voice, then select devices, PTT/hands-free, speed and volume. Browser noise suppression/echo cancellation are requested. Headphones improve reliable barge-in.
- Optional **desktop F8 voice** works while Minecraft is focused, with native input/output device selection. It polls only F8; no keyboard hook installation or system settings changes.
- Browser capture stops on pause/stop/disconnect/focus loss. Native F8 runs independently of browser focus. Physical microphone/headphone/F8 validation still requires the user.
- Barge-in cancels speech/current conversation inference while safe work can continue. Explicit stop/wait/forget-that/new-plan/cancel stops the gameplay plan. Emergency Stop disconnects.
- Microphone audio stays in RAM and is piped to local workers. No recording retention. Conversation text is stored locally and sent to Codex when requested.

Codex uses the existing authenticated CLI subscription. If needed, `codex login` restores login. A restricted native CLI process has shell, apps, hooks, plugins, browsing and delegation disabled, an empty working directory and validated structured JSON plans. Game chat/media cannot become shell commands. No paid speech API or OpenAI API key is required.

Actual request/input/output/cached-token usage is shown when supplied. Dollar costs/account limits are unknown. Configure hourly requests and lifetime input-token budget in Settings. CLI system overhead can contribute about20k input tokens per small request; cached counts are separate. No inference polling loop runs. Current-information browsing is not implemented.

## Survival controls

One runtime owns one body. Upstream MCP survives separately as `npm run upstream:mcp -- --username NAME`; never launch competing controllers for one account.

Available skills reuse Mineness observation, walking, following, tree collection, bounded approved-area mining and crafting. Initial deterministic controllers handle eating, surfacing, nearby threat retreat and basic in-reach defense. Movement disables terrain digging/towers, parkour, sprinting and large drops by default. These are initial controllers, not human-level survival competence.

Approve expendable natural terrain under **Companion → Approved mining area** before generic mining. Targets must be observed, within that area and at/above foot height. Models cannot grant that permission. Tree checks require natural soil and matching observed leaves; they cannot prove a tree was never player-built or decorated. Supervise important areas.

Pause gates new work before cancelling processes/gameplay and saves progress. In-flight library operations remain owned until settled; resume/new jobs cannot overlap them. Stop shuts down capture/inference and disconnects. A stuck dependency can keep resume blocked rather than permit conflicting actions.

## Build Studio and resource planning

Create a project using an installed supported Java version. Import complete blueprint JSON or Sponge `.schem` v1-v3. A bounded parser worker rejects invalid palettes, unknown blocks/states, oversized volumes and decompression bombs. MCEdit/Litematica are unsupported.

**Generate design** makes a real Codex request from a written description. Its complete saved design is validated and labeled reconstructed. Sharing text/title reference summaries is explicit. Uploaded binary pixels stay local: image/video architecture analysis is not implemented. YouTube supports bounded public oEmbed metadata only, without unrestricted downloads or invented dimensions/captions.

Three.js renders actual saved blocks with local textures, orbit/zoom, floor/roof/section filters and observed progress. Special shapes use voxel geometry, not a complete Minecraft model renderer.

Placement counts are exact for complete saved designs. Actual versioned crafting recipes/yields aggregate intermediate requirements before batch rounding. Placed blocks, required items, raw resources and contingency are separate. Existing exact-version vanilla JARs provide read-only smelting/stonecutting recipes/tags with SHA256 provenance (this PC has1.21.5). Missing production data and fuel choices stay explicitly unresolved.

Split globally or per material; manual user stock is labeled user-reported. Bot stock comes from live inventory observations and is allocated once across projects. It does not imply knowledge of your inventory or remote chests. Reservations prevent double spending. Explicit assigned wood gathering runs a bounded batch and reconciles observed inventory.

Approve every revised blueprint before construction. Current placement supports **inert full cubes only** and refuses conflicts, unloaded sites, unavailable materials and special/gravity/interactive blocks. No terrain clearing, OP permissions or server commands. Each placement and final completion are observed; persistent checkpoints are reverified on resume. Automatic scaffolding, oriented blocks, site preparation, resupply and destructive repair remain unfinished.

## Data, verification and limitations

SQLite/auth/models live outside Git under `%LOCALAPPDATA%\MinecraftCompanion`. Settings offers SQLite backup and JSON export; backup includes saved conversation but excludes the separate encrypted auth cache. Memory supports inspect/add/delete. JSON import, memory editing and automatic older-context summarization remain incomplete.

```powershell
npm run health
npm test
npm run typecheck
npm run build
node scripts/test-companion-game.mjs
```

See [verification](docs/VERIFICATION.md), [phase checklist](docs/IMPLEMENTATION.md), [build APIs](services/build-planner/README.md) and [contracts](docs/INTERFACES.md). Tests distinguish doubles, real parsers, actual process/audio/provider calls and local survival gameplay. None proves26.3 Realm compatibility.

Unfinished requested scope includes advanced cave/branch mining, farming, furnaces/chests/trading, armor optimization, guard coordination, Nether/End progression, strategic initiative, voice project reassignment, media vision/keyframes/captions, oriented construction/scaffolding/terrain/resupply/repair, player inventory companion, streaming speech, provider-selection UI, configurable hotkeys, conversation summarization and full project import. Stored autonomy preferences do not implement those behaviors. This is a functional foundation with explicit limits, not all eight completed phases.

The API binds **127.0.0.1 only**, with host/origin checks for HTTP/WebSockets. Remote access/authentication are unavailable. No public ports, purchases, paid accounts or sensitive system changes were made. Paper/RCON/skins/plugin workflows remain offline upstream tools and are not used for Realms. Original [Mineness README](docs/UPSTREAM.md), LICENSE and NOTICE retain attribution. Minecraft is a Mojang/Microsoft product; no affiliation is implied.
