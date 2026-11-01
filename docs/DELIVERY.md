# Waypoint 0.3.0-alpha.1 — Gaming companion workspace

Waypoint is a free, open-source AI gaming companion platform: useful teamwork,
casual conversation and user-controlled memories. **Minecraft Survival is the only
playable integration.** Other games are community research, not available products.

- [Public website](https://alfonza1.github.io/minecraft-companion/)
- [Source](https://github.com/alfonza1/minecraft-companion)
- [Prerelease](https://github.com/alfonza1/minecraft-companion/releases/tag/v0.3.0-alpha.1)
- [Install and update](INSTALLATION.md) · [Workspace](WORKSPACE.md)
- [Architecture](ARCHITECTURE.md) · [Contribute](../CONTRIBUTING.md)
- [Passing Windows/Linux CI](https://github.com/alfonza1/minecraft-companion/actions/runs/41299475153)

## Delivered

Nine public pages and a redesigned 16-screen local workspace share original
Waypoint typography, colors and companion identity. The homepage distinguishes
a companion identity illustration from its actual disconnected application screenshot.
The static site never reads private local state.

The workspace includes current activity, measured work progress, actual Minecraft
slots and equipment, separate raw/placement resource views, persistent assistance,
task ownership, mission checkpoints, conversation, personality, source-backed
saved moments, setup, extensions and searchable diagnostics. Stream revisions
prevent delayed HTTP responses replacing newer WebSocket observations; reconnect
loads authoritative state. Storage observations and manual claims stay separate
from current spendable inventory. Construction credit persists after materials
are consumed without attributing those supplies to either participant.

Teammate and Hangout suppress optional background chores while keeping explicit
tasks. Adventure permits bounded nearby scouting when safely equipped; Autonomous
uses existing common-supply routines. Mode selection does not grant terrain,
rare-resource or destructive-action permissions. Proactive remarks are opt-in.
Memory can be disabled, exported and deleted; disabling or deleting saved context
cancels a pending model reply/current speech. Already-delivered provider input
cannot be recalled. Current conversation and operational checkpoints remain usable.

The versioned game adapter separates game observations and workspace projections.
The working strategy example is deliberately non-playable. Minecraft execution
tools remain game-specific; this is an extension foundation, not a completed
universal game controller. See [game adapters](GAME-ADAPTERS.md).

Existing Microsoft device authentication, native 26.3 body, local voice, selected
providers, model settings, task interruption/resume and approved building workflow
are preserved. Account/data paths retain MinecraftCompanion for compatibility.

## Verification scope

Measured locally on Windows, 2026-11-01:

| Check | Result and limits |
| --- | --- |
| Regression suite | 344 tests: 340 passed, four opt-in speech checks skipped in the default run |
| TypeScript and production builds | Dashboard and static website pass |
| Workspace browser | 16 routes × five widths = 80 layout checks; 11 interaction assertions, no page errors |
| Existing setup/build browser flows | Real local API/SQLite, blueprint import/approval, manual shares, memory and pause/resume pass |
| Public website | Nine pages × five widths = 45 layout checks; seven interaction flows; no private API requests or page errors |
| Optional local speech | Seven targeted checks pass: actual neural TTS-to-STT, streamed WAVs, cancellation and synthetic device failures; no physical microphone capture |
| Native gameplay | 17 checks on disposable localhost-only official 26.3 survival server; server exits after testing |
| Security | Current-tree/history Gitleaks and artifact scan: no findings; npm audit: 12 moderate, zero high/critical |

Browser gameplay observations and model output are explicit isolated fixtures.
Real gameplay is tested separately: crafting, gathering, navigation, authoritative
inventory, six-block construction checkpoint resume, physical drop/pickup, supply
chest withdrawal, temporary-task interruption/resume, approved build resume,
death-item recovery and reconnect to a paused state. This is controlled terrain,
not an unsupervised Realm survival benchmark.

The engineering page publishes a reproducible contract subset with its own commit,
date, scope and raw JSON. It is not a broad task success rate or model leaderboard.
See [verification history](VERIFICATION.md) and [evaluation methodology](EVALUATION.md).

## Required scenario coverage

- **A, gathering:** native axe/log collection plus fixture-driven live inventory and progress UI.
- **B, shared build:** real local blueprint import, exact saved-design counts, approval,
  resource split and native construction. No new image/video model-analysis trial.
- **C, assistance:** real API persistence, ownership, revision conflicts and UI decisions.
- **D, stuck work:** bounded recovery/task-stack tests and visible blocked-work requests;
  difficult real-world terrain remains a validation gap.
- **E, recovery:** browser reopening, saved state and native paused reconnect.
- **F, changed responsibilities:** task ownership, serialized changes, plan holds and
  resource transfer tests, including repeated clicks and concurrent source updates.
- **G, future environment:** non-playable strategy adapter fixture validated by contracts.
- **H, contributors:** working observer extension, game fixture and linked guide tests.

## Remaining limits

This is an experimental prerelease, not a claim that every acceptance criterion
for a consumer-ready autonomous companion has been achieved. Full Realm auth and
native voice require Windows; macOS/Linux browser/offline planning is experimental.
There is no signed standalone installer, unrestricted cave/branch mining, arbitrary
house supply chain, playable second game or multiple embodied companions. Some
help actions can find a resource source but cannot gather/process that material.
Timed reminders and general world maps are not implemented. Reference estimates
cannot recover hidden geometry exactly. Fresh Microsoft/Realm login, physical
microphone/headphone interaction, adverse-terrain missions and personality quality
across real model providers need user trials. No inference-quality or latency gain
is claimed from a UI redesign. [Capabilities](CAPABILITIES.md).

## Evidence-backed portfolio wording

- Built an event-driven gaming companion workspace integrating live world
  observations, structured model plans, cancellable skills and persistent goals.
- Implemented revision-checked human assistance, task ownership and conservative
  resource accounting that preserves verified construction progress.
- Added source-backed companion memory controls, personality preferences and
  behavior modes with lifecycle cancellation and permission boundaries.
- Created versioned game-observation adapters, a non-playable extension fixture,
  reproducible local survival checks and Windows/Linux source verification.

Priority contributions: adverse-terrain gameplay fixtures, cross-platform secure
credentials/voice, accessible workspace refinements, additional permitted game
adapters, broader crafting supply chains and consumer installation packages.
