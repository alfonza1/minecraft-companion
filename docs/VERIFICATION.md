# Verification evidence

Workstation session: 2026-10-27, Windows11, Node24.18.1, Python3.12.10. No Realm, Microsoft password, physical microphone or user Minecraft world was used by tests. This is a functional foundation with explicit unverified scope.

## Automated and browser checks

`$env:COMPANION_TEST_LOCAL_SPEECH='1'; npm test` passed **67/67, zero skipped** during integration. This includes upstream routing/cancellation, API host/origin and invalid input, exact observed inventory, SQLite recovery/backup, real Windows DPAPI encryption, validated Microsoft prompts, pause/respawn/start races, strict schematic parsing, malicious uploads, exact crafting batching, local vanilla production recipes, reservations/splits, approval hashes, build cancellation and actual OS process cleanup.

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

No Microsoft account has completed the live device flow here. Current26.3 Realm compatibility is blocked by installed protocol support ending26.1. Advanced survival, oriented construction/scaffolds/resupply/destructive repairs, image/video architecture analysis, full raw fuel optimization, streaming speech, configurable global hotkeys and the other README limitations remain incomplete. Automated doubles and1.16.5 local tests do not establish those features or26.3 production readiness.
