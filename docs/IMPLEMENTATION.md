# Minecraft Companion implementation checklist

Evidence levels: implemented; automated tests passed; local gameplay passed; Realm gameplay passed. Passing a fixture does not imply Realm gameplay.

- [x] Microsoft device flow, encrypted session cache, profile and Realm list adapters, version gate, observed inventory, bounded reconnect implemented. Optional pinned local bridge connects the 26.1 client view to 26.3. **Licensed 26.3 Realm spawn and 45 passive seconds passed; translation still disables exact construction and resource jobs.** Player certificates are canonical DER, preserving provider signatures; explicit kicks stop retries, and brief spawns no longer reset the retry budget.
- [x] Six localhost dashboard pages plus five-step guided setup, controls, SQLite, WebSockets and desktop/mobile browser verification. Setup uses actual readiness checks and explicit audio/account/session actions.
- [x] Actual local STT/Piper and Codex calls, device selection, browser PTT/VAD, opt-in desktop F8, cancellation. **Physical audio/F8 and streaming speech unverified or unfinished.**
- [x] Reused movement/gathering/crafting executor with cancellation, mining-area approval and initial reflexes. Official1.21.5 vanilla crafting passed after explicit EULA acceptance. **Advanced survival/progression remains unfinished.**
- [x] Validated JSON/Sponge blueprints, real text-based Codex architecture, actual-block 3D preview, provenance and versioned BOM. **Media vision/keyframes/captions unfinished.**
- [x] Independent shares, manual user provenance, observed AI stock allocated once, reservations and bounded assigned wood batches. **Chests and voice reassignment unfinished.**
- [x] Approval-gated full-cube survival construction, observed verification, SQLite checkpoints and real interruption/resume. **Oriented blocks, terrain/scaffolding/resupply/repair unfinished.**
- [x] Windows bootstrap/launcher, diagnostics, security review and automated/runtime/browser evidence. Publication status is reported separately; a rejected push is not concealed.

These checked increments are subsets of the requested phases, not claims that the entire production specification is finished. See README for remaining requested scope and docs/VERIFICATION.md for evidence boundaries.

## Upstream analysis

Mineness src/actions.js provides cancellation/deadlines and single-body work. src/tools/play.js provides harvesting, crafting, following, delivery and bounded placement. src/tools/look_around.js supplies observation-limited world perception. Preserve these; adapt their registered handlers into a validated in-process executor. Retain original MCP entry point for offline upstream use; do not launch it alongside the new runtime.

Paper-only: mc-server/model-command, skin plugin/datapack/setup, RCON test fixtures, offline auth identity. None belongs in the Realm runtime. Realms use licensed Java identity, prismarine-auth cache, prismarine-realms and Mineflayer Microsoft support. Account invites and device authentication require human action. Protocol support must be established from installed minecraft-protocol rather than inferred from Minecraft's installation.

Hardware: Windows 11 Pro; Node 24.18.1/npm 11.16; Python 3.12.10; Git 2.49; Codex CLI 0.163.0 authenticated with ChatGPT; Java 20.0.1. AMD RX 7900 XTX plus integrated Radeon. 31 GiB installed RAM, about 3.4 GiB available at audit. Start small CPU int8 speech; no CUDA. Avoid installing another system JDK for Realm connectivity.

Workspace audit: six preexisting dirty repositories, including project-manager. Keep unrelated edits intact; only touch launcher configuration if registering this app. No unrelated repository checkpointing is authorized by this task.

## Dependency decisions

Checked published versions and actual installed source on 2026-10-27. The npm lockfile is the authoritative dependency manifest; Python uses services/voice/requirements-lock.txt. Existing Minecraft remains untouched.

| Library | Decision and evidence |
| --- | --- |
| mineflayer 4.39.0 / minecraft-protocol 1.68.0 | Node22+; native protocol list ends26.1. Unknown versions fail closed. Optional separately checksummed ViaProxy3.4.14 translates26.3; no exact resource/construction claims through projection. |
| ViaProxy3.4.14 | Official pinned GPL3 release; private Java adapter, loopback-only, no plaintext account cache. Only26.3 translation enabled; installed artifact/source hash and local gameplay evidence are distinct from Realm authentication. |
| minecraft-data 3.117.0 | Exact release names and recipes; no silent cross-version schematic conversion. |
| mineflayer-pathfinder 2.4.x | Retained upstream; real local movement/build positioning tested, no implicit terrain destruction. |
| mineflayer-collectblock 1.6.x / tool 1.2.x | Retained upstream vein/tool logic; custom safe target filtering. Dig/pickup tested. |
| mineflayer-pvp 1.3.2 | Published metadata last modified2022; not added untested beside the single controller. Initial deterministic defense/retreat instead. |
| mineflayer-auto-eat 5.0.3 | Evaluated; custom serialized eating avoids competing action ownership. Real eating still requires gameplay evidence. |
| armor-manager 2.0.1 / statemachine 1.7.0 | Metadata last modified2023; not installed on assumption of compatibility. Armor optimization/progression remain unfinished. |
| prismarine-schematic 1.3.0 | Bounded parsing wrapper validates palettes/states before dependency parsing; real NBT round trips tested. |
| prismarine-viewer 1.33.0 | Not required for blueprint rendering; Three.js renders the persisted blueprint with local minecraft-assets1.19.0. |
| speech | CPU INT8 tiny.en, Silero, Piper; no CUDA/ROCm changes. PyAV16.0.1 pinned after real compatibility failure with19. |
| Codex | Existing native0.163.0 supported exec interface; no redundant CLI installation or removed MCP server interface. Actual schema/usage/process cancellation tested. |

The initial npm audit had critical/high advisories. Safe updates plus Zod4 migration removed those. Remaining transitive moderate advisories are recorded in verification, not force-upgraded across authentication APIs without testing.
