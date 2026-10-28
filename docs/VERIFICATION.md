# Verification evidence

Workstation session: 2026-10-27, Windows11, Node24.18.1, Python3.12.10. No Realm, Microsoft password, physical microphone or user Minecraft world was used by tests. This is a functional foundation with explicit unverified scope.

## Automated and browser checks

`$env:COMPANION_TEST_LOCAL_SPEECH='1'; npm test` passed **77/77, zero skipped** after the account-worker startup fix. This includes upstream routing/cancellation, API host/origin and invalid input, exact observed inventory, SQLite recovery/backup, real Windows DPAPI encryption, validated Microsoft prompts, actual account-worker startup, pause/respawn/start races, strict schematic parsing, malicious uploads, exact crafting batching, local vanilla production recipes, reservations/splits, approval hashes, build cancellation, actual OS process cleanup, setup readiness, secure session authorization, projected-inventory exclusions and movement tick framing.

`npm run typecheck` and `npm run build` pass. Three.js is lazy-loaded; its compressed preview chunk is about127kB. The build reports a >500kB uncompressed chunk warning, not a runtime failure.

Headless browser checks used an isolated real API/SQLite database: all six pages at1440px and390px, no horizontal overflow or JavaScript page errors; actual memory create/delete, two-block blueprint import/preview/exact counts/approval, offline construction rejection, resource split/manual progress, mining permission approval/revocation, and offline planning start/pause/resume/stop. Lifecycle changes made zero model requests. Screenshots/results are stored locally under `.git/verification/dashboard/`; generated images are not committed.

## Real local survival protocol

`node scripts/test-companion-game.mjs`: **7 passed, 1 explicitly skipped**, isolated Flying-squid1.12.0, Minecraft1.16.5 survival, ephemeral loopback port and temporary world. Fixture server APIs seed the site and materials; companion work uses normal survival client packets, no OP or creative tools.

Observed successes:

- Spawn coordinates and survival game mode.
- Server inventory packets become world/dashboard inventory records.
- Actual pathfinding changes position.
- An approved surface target is dug and its dropped dirt reaches bot inventory.
- Six full stone blocks are physically placed; interrupted after two confirmations, checkpoint loaded from SQLite, resumed and final six placements verified. Exactly six stone items consumed.
- Pause cancels active movement and preserves an interrupted task.
- Transport loss reconnects a new body paused, requiring explicit resume.

**Crafting is not validated by this fixture.** It implements neither vanilla crafting recipes nor inventory transaction acknowledgments. An attempted real inventory click timed out. This test skips only that known unsupported transaction failure and fabricates neither acknowledgments nor crafted inventory. Official-server evidence below supplies the separate vanilla check; Realm crafting remains untested.

The first gathering run exposed upstream selecting ground beneath the player. The actual executor now filters a user-approved zone before taking target count and excludes below-foot targets. Tests cover that regression; no warning suppresses the original problem.

## Actual local speech and Codex

Installed Piper generated a117804-byte RIFF WAV for a casual cave sentence; local faster-whisper transcribed it correctly. A SAPI fallback round trip also passed. The opt-in automated speech test exercises Piper -> RAM WAV -> Whisper and rejects >45-second recordings. This does not prove physical mic/speaker, native F8 bindings, background browser permissions or hands-free echo performance.

Restricted installed Codex returned a schema-valid conversational response with no game actions and actual usage (one minimal smoke:20078 input/26 output tokens). A real architect request produced exactly four stone placements in a2x1x2 original foundation, labeled reconstructed. No media pixels were claimed to be analyzed. Unit fixtures also exercise real process cancellation, late model actions after pause, ordinary conversation during deterministic gameplay and interruption without deadlock.

`node scripts/test-companion-live.mjs --codex` passed all four checks: actual API Piper/Whisper, real black-hole conversation without Minecraft tools (19248 input/42 output tokens), real generated four-placement design/exact BOM/unapproved revision, and paused conversation/speech denial with unchanged request counts. It uses a disposable external database and actual subscription inference; it is separate from ordinary `npm test`. Tiny.en did misrecognize parts of the API test phrase while preserving the wood-collection intent; speech accuracy is not guaranteed.

## Official vanilla server

The user explicitly accepted the Minecraft EULA for a temporary localhost test server. `Setup-VanillaTest.ps1` downloads a private Temurin21 JRE, verifies SHA256 from Adoptium metadata, and verifies official Mojang1.21.5 server SHA1 `e6ec2f64e6080b9b5d9b471b291c33cc7f509733`. Files and the acceptance receipt stay outside Git/Minecraft. No system environment, Java installation or actual world is altered.

`node scripts/test-vanilla-game.mjs`: **7/7 passed**. Official survival spawn, real server inventory, logs -> four planks, sticks and a wooden pickaxe via a crafting table, crafted-pickaxe cobblestone mining/pickup, approved dirt gathering, and six-block construction interrupted after two confirmations then resumed from SQLite. Final six blocks were observed and inventory consumed exactly six of twelve stones after the final server slot packet arrived. The bot had no OP/Creative privileges. Fixture console setup seeds only the disposable world/materials. Server exit is awaited and the temporary world removed. Detailed results are in `.git/vanilla-gameplay-results.json`.

Git publication attempt: local feature commits are preserved, but `git push -u origin feat/minecraft-companion` returned HTTP403: `alfonza1` lacks write permission to `SpectrumTantrum/mineness`. No force push, fork, remote change or pull request was made.

## Review, dependencies and unverified scope

Code review found and corrected pause being undone by respawn, cancelled setup stuck at connecting, and pre-socket auth errors hanging indefinitely. Regression tests cover all three. Additional operation ownership keeps late library calls from overlapping new work; reconnect never resumes a job automatically.

Initial critical/high npm advisories were fixed through compatible updates and Zod4 migration. Remaining moderate transitive findings include UUID consumers in authentication/legacy protocol dependencies and the local test-server dependency tree. No automatic breaking authentication upgrades were applied. Run `npm audit` for current details. Localhost binding and bounded inputs reduce exposure but are not a claim of zero security risk.

No Microsoft account has completed the live device flow here. Native support still ends26.1; the separately tested translation path below does not establish licensed Realm authorization. Advanced survival, oriented construction/scaffolds/resupply/destructive repairs, image/video architecture analysis, full raw fuel optimization, streaming speech, configurable global hotkeys and the other README limitations remain incomplete. Local tests do not establish those features or26.3 production readiness.

## Guided setup and 26.3 protocol bridge

The guided setup is implemented and tested against a real isolated API/SQLite instance at1440px and390px. All five steps rendered without overflow or page errors. Actual controls started offline planning, paused and stopped with zero model requests. An explicit microphone-permission denial fixture verified that mounting never captures audio and leaving a wizard-owned audio session pauses it. Physical microphones, headphones and Microsoft login remain untested. Screenshots/results are under `.git/verification/setup/`.

Account setup initially failed before sending a device prompt: Node24 rejected the synthetic named `Titles` export from CommonJS `prismarine-auth`. The worker now uses the libraries' default CommonJS exports. A regression test launches the real worker and waits for a credential-free readiness handshake; it failed before the import fix and now passes. Startup failures are distinguished from interrupted sign-in without exposing stderr or credentials.

`node apps/dashboard/tests/account-connection.mjs --microsoft-device-flow` passed the actual browser-button -> API -> worker -> Microsoft -> live-dashboard path using an isolated cache/database. It verifies the official URL and actual code shape, with zero model/game requests or page errors. Evidence is `.git/verification/account/`; the screenshot masks the temporary code. This opt-in test requests a real Microsoft device prompt but never completes login or reads the user's saved session. Licensed account authentication and Realm access remain unverified.

Private Temurin25 and the official26.3 server were checksum-verified in a dedicated external cache. The test uses the user's existing explicit local-server EULA consent, an ephemeral loopback-only offline survival world, no OP bot and no real Realm. The pinned ViaProxy3.4.14 JAR is SHA256-verified; the Java adapter compiles from repository source and has separate source/artifact hashes. Microsoft tokens never enter Java, files, arguments or dashboard state; real Mojang session acceptance remains unverified.

`node scripts/test-modern-bridge.mjs` passed **6/6**: official26.3 survival spawn through the26.1 client protocol; at least60 stable physics ticks; unauthorized local username rejection while the legitimate player stays connected; actual server inventory events; survival pathfinding over3 blocks; and transport loss/reconnect with persistent inventory and an explicitly paused new body. Java exit and cleanup are awaited. Evidence is `.git/modern-bridge-results.json` and an external source/runtime-fingerprinted receipt. None of these offline tests authenticates a licensed account.

Tests exposed and corrected three concrete failures: stale artifacts correctly fail closed; ViaProxy's authentication enum requires uppercase `NONE`; and Mineflayer4.39 omits the `tick_end` packet required by26.3 ([matching upstream report](https://github.com/PrismarineJS/mineflayer/issues/4189)). The scoped adapter appends that packet after movement without altering positions or timing. A separate real login rejection exposed an unspawned pathfinder cleanup crash; a failing regression test now passes with the pre-spawn guard. Review also fixed a cancellation race that could start native authentication after pause.

Projected inventory has explicit provenance and is excluded from exact project allocation. Backend gates reject translated crafting, resource collection, assigned gathering and construction; tests ensure mapped items cannot satisfy exact assignments. Full-cube construction remains available on natively supported connections as proven by the earlier vanilla test.
