# Evaluation methodology

## Reproducible contract baseline

Run `npm run evaluate`. This starts a fixed list of real Node test suites, records
test counts, elapsed wall time, Node/platform, source commit and working-tree
modification status. It writes evaluations/local/latest.json and the TAP log.
These ignored files may be kept locally. Only an explicit
`node scripts/evaluate.mjs --publish` updates the sanitized public report.

The baseline exercises provider validation, pause gates, API isolation, blueprint/
resource contracts and task-stack recovery. It includes doubles. It is not a game
success benchmark. Gameplay action count and model requests are zero. Planning
latency, gameplay success/recovery rates and billing costs are null, not inferred.
The parent RSS sample is not total game/model memory or peak utilization.

## Actual survival fixtures

After explicitly accepting the Minecraft EULA, prepare the private local test server:

```powershell
.\scripts\Setup-ModernTest.ps1 -AcceptMinecraftEula
node scripts/test-native-game.mjs --mining-prep-only
node scripts/test-native-game.mjs --iron-only
node scripts/test-native-game.mjs --building-only
node scripts/test-native-game.mjs --automatic-build
```

These are separate tests with actual server inventory/blocks. Never point fixture
scripts at a personal Realm. The private server is localhost-only and uses an
isolated world; setup does not modify the user's Minecraft installation.

Prior development evidence includes two mining-preparation scenarios and two iron
trip/resume scenarios on the official native 26.3 local server. Those historical
passes do not establish a current release-wide Realm success rate. Run the scripts
again for a new implementation. Test source is the reproducibility artifact;
private local logs are not silently published.

## Optional model trials

Select an installed provider and use synthetic, non-private prompts. Record model,
hardware, cold/warm state, request latency, returned token counts and cancellations.
Compare the same tasks over repeated runs. A timeout or invalid plan counts as a
failure. Do not omit blocked tasks to improve a success rate.

The running app exposes stage median/p95 samples and actual-or-unknown usage.
No provider account quota or dollar cost is inferred from a subscription. Local
Ollama reports input/output token counts; aborted calls may omit usage. A model
comparison leaderboard has not been measured.

## Publishing evidence

Publish only explicitly reviewed fixture results. Strip usernames, account IDs,
Realm identifiers, coordinates from personal worlds, device paths, prompts,
conversation and credentials. Screenshots must use a disposable local app state
and be captioned as such. The public hero is explanatory artwork, not gameplay.
