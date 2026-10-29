# Minecraft Companion implementation checklist

Evidence levels: implemented; automated tests passed; local gameplay passed; Realm gameplay passed. Passing a fixture does not imply Realm gameplay.

- [x] Microsoft device flow, encrypted session cache, profile and Realm list adapters, version gate, observed inventory, bounded reconnect implemented. **Pinned native26.3/protocol777 adapter passed a licensed passive Realm connection and 11 official localhost survival checks, including crafting, gathering, handoff and checkpointed construction.** A restricted translation fallback remains available. Newly added26.2/26.3 materials still have unvalidated metadata and remain gated for destructive jobs. Player certificates are canonical DER, preserving provider signatures; explicit kicks stop retries, and brief spawns no longer reset the retry budget.
- [x] Six localhost dashboard pages plus five-step guided setup, controls, SQLite, WebSockets and desktop/mobile browser verification. Setup uses actual readiness checks and explicit audio/account/session actions.
- [x] Actual local Whisper/Piper/Kokoro and Codex calls, nine full-precision Kokoro voice choices plus Piper, actual preview, persistent keyboard/chord/Mouse4/5 PTT, device selection, browser PTT/VAD and opt-in native desktop capture with cancellation. Actual waveform generation for all ten neural voices and browser key/preview tests passed. **Physical audio/global shortcut operation and streaming speech remain unverified or unfinished.**
- [x] Reused movement/gathering/crafting executor with cancellation, mining-area approval and initial reflexes. Server-confirmed dropping/handoff/equipping, zero-inference common commands, safe sprint settings, unique batch tree collection and correct native axe speeds are implemented. Official26.3 survival dropping, separate-player pickup and eight-log/two-tree collection passed. Official1.21.5 vanilla crafting also passed after explicit EULA acceptance. **Advanced survival/progression remains unfinished.**
- [x] Validated JSON/Sponge blueprints, real Codex architecture, actual-block 3D preview, provenance and versioned BOM. **Sampled upload vision and evidence-driven reconstruction passed actual Codex inference. Direct YouTube video/audio adapter and secure setup implemented; live Google inference awaits a user key. Complete frame coverage/local caption alignment remain unfinished.**
- [x] Independent shares, manual user provenance, observed AI stock allocated once, reservations and bounded assigned wood batches. **Shared project chest reconciliation and open-ended voice reassignment unfinished.** Supported selected-project half splits and wood/stone voice reassignment are implemented.
- [x] Approval-gated full-cube survival construction, observed verification, SQLite checkpoints and real interruption/resume. **Oriented blocks, terrain/scaffolding/resupply/repair unfinished.**
- [x] Windows bootstrap/launcher, diagnostics, security review and automated/runtime/browser evidence. Publication status is reported separately; a rejected push is not concealed.
- [x] Dedicated WebView2 desktop window, stable application identity, source-following desktop/Start/taskbar launcher and in-app update control. Actual native open/close/reopen/update checks passed; the taskbar pin target and AppID were read back after pinning through Windows. Native binaries are versioned outside Git and generated build files do not trigger update loops.

These checked increments are subsets of the requested phases, not claims that the entire production specification is finished. See README for remaining requested scope and docs/VERIFICATION.md for evidence boundaries.

## Teammate quality of life

- [x] Basic approved-plot mature crop harvesting/replanting, eligible adult animal hunting, owned-food cooking in an empty furnace, surplus/valuable deposits, bounded loaded surface exploration and chat resume of an approved build. Seven official localhost26.3 survival checks passed; no new Realm gameplay was claimed.
- [x] Deterministic idle-work priorities, stock targets, single-body ownership, safety gates, storage permissions, two-minute failure cooldown and Stop/Pause handling; automatic valuable deposits passed real local gameplay.
- [x] Warm local speech worker with actual cancellation/process cleanup and no recording files; full-precision Kokoro/Piper and INT8 Whisper weights unload after pause/stop or60idle seconds.
- [x] Faster Codex conversation profile and measured fixed-prompt provider latency/token comparison; model selection is preserved.
- [x] Explicit Codex live YouTube discovery, verified persistent choices, source-evidence reconstruction, blueprint-derived materials, assisted common-material half splits and human assignment of unsupported resources. Separate conversation/work models share current context. Actual uploaded video frames and work-model reconstruction passed; direct Google video inference still needs live account verification.

- [x] Temporary and nested action requests save remaining work, perform the new request and resume the original job; general conversation continues independently.
- [x] Pause/crash checkpoints, task stack UI, discard/resume controls and Stop-wins cancellation checks.
- [x] Help-me travel/food support, conservative bounded defense with risk gates; real travel/food handoff passed, hostile combat remains unverified.
- [x] Editable mining/building/travel routines, approved-chest restocking, better usable tool selection and missing-supply reports.
- [x] Exact requested handoffs from unreserved stock; approved chest lookup and missing natural-log gathering.
- [x] Named observed places with Realm/dimension boundaries.
- [x] Deduplicated quiet/useful/social updates and optional existing voice playback; physical audio still requires user verification.
- [x] Bounded navigation recovery without terrain destruction.
- [x] Saved death sites and last-observed inventory, risk assessment and actual survival pickup recovery.
- [ ] New voice feedback sounds/listening-indicator proposal: intentionally excluded at the user’s request.

Official localhost26.3 fixture: **17/17 passed**, with zero model requests. This validates the tested survival paths, not every possible Realm situation. See [teammate controls and limits](TEAMMATE.md).

## Upstream analysis

Mineness src/actions.js provides cancellation/deadlines and single-body work. src/tools/play.js provides harvesting, crafting, following, delivery and bounded placement. src/tools/look_around.js supplies observation-limited world perception. Preserve these; adapt their registered handlers into a validated in-process executor. Retain original MCP entry point for offline upstream use; do not launch it alongside the new runtime.

Paper-only: mc-server/model-command, skin plugin/datapack/setup, RCON test fixtures, offline auth identity. None belongs in the Realm runtime. Realms use licensed Java identity, prismarine-auth cache, prismarine-realms and Mineflayer Microsoft support. Account invites and device authentication require human action. Protocol support must be established from installed minecraft-protocol rather than inferred from Minecraft's installation.

Hardware: Windows 11 Pro; Node 24.18.1/npm 11.16; Python 3.12.10; Git 2.49; Codex CLI 0.163.0 authenticated with ChatGPT; Java 20.0.1. AMD RX 7900 XTX plus integrated Radeon. 31 GiB installed RAM, about 3.4 GiB available at audit. Start small CPU int8 speech; no CUDA. Avoid installing another system JDK for Realm connectivity.

Workspace audit: six preexisting dirty repositories, including project-manager. Keep unrelated edits intact; only touch launcher configuration if registering this app. No unrelated repository checkpointing is authorized by this task.

## Dependency decisions

Checked published versions and actual installed source on 2026-10-27. The npm lockfile is the authoritative dependency manifest; Python uses services/voice/requirements-lock.txt. Existing Minecraft remains untouched.

| Library | Decision and evidence |
| --- | --- |
| mineflayer 4.39.0 / minecraft-protocol 1.68.0 | Node22+; released native protocol list ends26.1. A separate pinned/checksummed native26.3 overlay adds protocol777 after local survival and passive Realm validation; details and source revisions in services/native-26.3. Unknown or mismatched protocols fail closed. ViaProxy3.4.14 remains a restricted fallback. |
| ViaProxy3.4.14 | Official pinned GPL3 release; private Java adapter, loopback-only, no plaintext account cache. Only26.3 translation enabled; installed artifact/source hash and local gameplay evidence are distinct from Realm authentication. |
| minecraft-data 3.117.0 | Exact release names and recipes; no silent cross-version schematic conversion. |
| mineflayer-pathfinder 2.4.x | Retained upstream; real local movement/build positioning tested, no implicit terrain destruction. |
| mineflayer-collectblock 1.6.x / tool 1.2.x | Retained for upstream compatibility. Companion tree batches use coordinate-deduplicated targets and direct best-tool selection with modern enchantments; real dig/pickup tested. |
| mineflayer-pvp 1.3.2 | Published metadata last modified2022; not added untested beside the single controller. Initial deterministic defense/retreat instead. |
| mineflayer-auto-eat 5.0.3 | Evaluated; custom serialized eating avoids competing action ownership. Real eating still requires gameplay evidence. |
| armor-manager 2.0.1 / statemachine 1.7.0 | Metadata last modified2023; not installed on assumption of compatibility. Armor optimization/progression remain unfinished. |
| prismarine-schematic 1.3.0 | Bounded parsing wrapper validates palettes/states before dependency parsing; real NBT round trips tested. |
| prismarine-viewer 1.33.0 | Not required for blueprint rendering; Three.js renders the persisted blueprint with local minecraft-assets1.19.0. |
| speech | CPU INT8 tiny.en, Silero, full-precision Kokoro82M with nine local choices and Piper fallback; no CUDA/ROCm changes. kokoro-onnx0.6.1 and checksummed model assets pinned. PyAV16.0.1 retained. |
| Codex | Existing native0.163.0 supported exec interface; no redundant CLI installation or removed MCP server interface. Actual schema/usage/process cancellation tested. |

The initial npm audit had critical/high advisories. Safe updates plus Zod4 migration removed those. Remaining transitive moderate advisories are recorded in verification, not force-upgraded across authentication APIs without testing.
