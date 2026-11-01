# Waypoint early-access delivery — 2026-11-01

Waypoint is an open-source AI Minecraft survival teammate. Minecraft is its only
implemented embodied environment. The public site explains the agent architecture
without disguising what the software does for a player.

- [Website](https://alfonza1.github.io/minecraft-companion/)
- [Source](https://github.com/alfonza1/minecraft-companion)
- [Source prerelease and checksums](https://github.com/alfonza1/minecraft-companion/releases/tag/v0.2.0-alpha.1)
- [Installation](INSTALLATION.md) and [architecture](ARCHITECTURE.md)
- [Passing Windows/Linux CI](https://github.com/alfonza1/minecraft-companion/actions/runs/41296377185)

## What changed

Eight complete public pages, original brand/artwork, Minecraft-first positioning,
shared dashboard identity, setup model selection, a free local Ollama adapter,
trusted observation extensions, measurable contract evaluations, source packaging,
security/license review, CI/deployment and contributor documentation.

The existing one-body Mineflayer runtime, Realm device authentication, observed
inventory, local speech, task interruption, collaborative resource ledger and
approved blueprint workflows remain in place. A static public site never reads a
visitor's local agent state. The optional proprietary Claude SDK is installed
separately outside the source repository.

## Evidence

- Local Windows: 311 tests, 307 passes, four optional skips; typechecks and builds pass.
- Clean Windows and Linux CI: install, checksummed native setup, regression tests,
  builds, source audit and contract evaluation pass. Linux also runs website tests.
- Website: eight pages at three widths, seven interactive flows, no browser errors
  or requests to a private companion API. All eight deployed pages returned HTTP 200
  and passed a separate browser smoke check.
- Dashboard and setup: headless browser checks against real local API and isolated
  SQLite state, including pause/resume, blueprint approval, assignments and memory.
- Local Ollama: an actual installed model returned a valid structured response.
  This is a smoke test, not a model-quality or latency benchmark.
- Gitleaks scanned 52 commits without finding secrets. Current-tree audit found no
  private artifacts. Source ZIP inspection found no auth/database/dependency folders.

The public engineering report contains 51 measured contract checks from its stated
commit. It is a smaller reproducible subset, not the full regression suite and not
a gameplay success rate. No Realm gameplay was rerun for this packaging release.

## Boundaries

Early access, not a claim of consumer-ready reliability. Full Realm authentication
and native voice require Windows. macOS/Linux support browser/offline planning
experimentally. No signed binary installer, unrestricted cave/branch mining,
arbitrary build supply chains, additional environments or multiple embodied agents.
See [capabilities](CAPABILITIES.md) and [roadmap](ROADMAP.md).

Twelve moderate dependency advisories remain in the reviewed snapshot; no high or
critical advisories were reported. See [security review](RELEASE-SECURITY.md).
Minecraft and a licensed bot account are separate requirements. Optional hosted
providers can charge. Source and the local-model route require no subscription.

## Engineering portfolio wording

Claims supported by this implementation, without invented performance numbers:

- Developed an event-driven Minecraft agent runtime connecting structured model
  plans, observed world state, cancellable skills and persistent task checkpoints.
- Implemented local Ollama inference and validated extension interfaces with
  lifecycle gates, input/output contracts and automated regression coverage.
- Published an open-source agent platform with guided setup, an observable control
  dashboard, architecture documentation and Windows/Linux CI verification.

Contributors can start with [CONTRIBUTING](../CONTRIBUTING.md) and the working
[extension example](EXTENSIONS.md). Cross-platform credentials, real survival
fixtures, installer signing and broader build supply chains are priority work.

The homepage [artwork and generation prompt](ARTWORK.md) are documented. The scene
is a concept illustration; the dashboard screenshot is from an actual disconnected
test session. Neither is presented as successful recorded gameplay.
