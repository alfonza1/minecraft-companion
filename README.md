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

Click **Open guided setup** on Overview or Settings (or **Setup** in navigation). Five steps check local services, display Microsoft device sign-in, select/ping invited Realms, test your own microphone/speakers and start a first session. Opening setup performs no login, microphone capture, gameplay or model request. Audio checks require an explicit click; leaving a wizard-owned offline audio session pauses it.

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
- **Push-to-talk key → Change key** records a keyboard key, optional Ctrl/Alt/Shift chord, or Mouse4/5. F8 remains the default and Reset restores it. The binding persists locally and also works in browser voice while the app is focused. Changing/resetting stops capture; enable it again afterward. Ordinary typing fields ignore letter shortcuts in browser mode. The game still receives your shortcut, so choose an unused binding.
- Optional **Enable desktop voice** works while Minecraft is focused, with native input/output device selection. It polls the configured key/modifiers using Windows GetAsyncKeyState; no keyboard hook installation or system settings changes. Browser PTT ends on focus loss; native PTT runs independently of focus. Both stop on pause/stop/disconnect. Physical microphone/headphone/global-key operation still needs a user check.
- Barge-in cancels speech/current conversation inference while safe work can continue. Explicit stop/wait/forget-that/new-plan/cancel stops the gameplay plan. Emergency Stop disconnects.
- Microphone audio stays in RAM and is piped to local workers. No recording retention. Conversation text is stored locally and sent to Codex when requested.

Codex uses the existing authenticated CLI subscription. If needed, `codex login` restores login. A restricted native CLI process has shell, apps, hooks, plugins, browsing and delegation disabled, an empty working directory and validated structured JSON plans. Game chat/media cannot become shell commands. No paid speech API or OpenAI API key is required.

Actual request/input/output/cached-token usage is shown when supplied. Dollar costs/account limits are unknown. Configure hourly requests and lifetime input-token budget in Settings. CLI system overhead can contribute about20k input tokens per small request; cached counts are separate. No inference polling loop runs. Current-information browsing is not implemented.

## Survival controls

One runtime owns one body. Upstream MCP survives separately as `npm run upstream:mcp -- --username NAME`; never launch competing controllers for one account.

Available skills reuse Mineness observation, walking, following, tree collection, bounded approved-area mining and crafting. Item dropping, visible-player handoff and equipping use server-confirmed inventory. Initial deterministic controllers handle eating, surfacing, nearby threat retreat and basic in-reach defense. Movement disables terrain digging/towers, parkour and large drops. **Companion → Travel pace** defaults to brisk: normal survival sprinting when health/hunger are at least 14 and no hostile is within 12 blocks; choose normal to conserve food. These are initial controllers, not human-level survival competence.

Commands such as “get 16 oak logs”, “give me the wood”, “drop 3 oak logs”, “follow me” and “come here” bypass model inference. A new direct action cancels existing work and waits for its body to stop; Pause/Stop still take precedence. General questions continue through Codex. Tree gathering batches unique coordinates across natural trees, equips the fastest owned tool and waits for landing before digging. It stops when inventory is full and reports collected inventory separately from mined blocks. Give the companion an axe for faster chopping; this controller does not automatically craft one. The native26.3 adapter remaps inherited material/tool IDs so an actual axe has its proper vanilla digging speed. It does not increase Minecraft's permitted mining speed.

Handoffs walk toward the configured visible player and throw the requested owned items using ordinary inventory clicks. Counts are reconciled against the server after transfer, including cancellation. The dashboard never claims access to the recipient's inventory. Missing server confirmation marks inventory unverified and blocks exact allocation, gathering/crafting and construction until a full inventory update arrives.

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

Unfinished requested scope includes advanced cave/branch mining, farming, furnace/chest production workflows and trading, armor optimization, guard coordination, Nether/End progression, strategic initiative, voice project reassignment, media vision/keyframes/captions, oriented construction/scaffolding/terrain/resupply/repair, player inventory companion, streaming speech, alternative STT/cloud-provider settings, conversation summarization and full project import. Stored autonomy preferences do not implement those behaviors. This is a functional foundation with explicit limits, not all eight completed phases.

The API binds **127.0.0.1 only**, with host/origin checks for HTTP/WebSockets. Remote access/authentication are unavailable. No public ports, purchases, paid accounts or sensitive system changes were made. Paper/RCON/skins/plugin workflows remain offline upstream tools and are not used for Realms. Original [Mineness README](docs/UPSTREAM.md), LICENSE and NOTICE retain attribution. Minecraft is a Mojang/Microsoft product; no affiliation is implied.
