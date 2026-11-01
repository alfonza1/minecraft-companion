# Release security and third-party review

The project retains Apache-2.0 and NOTICE from Mineness. Original Waypoint additions
use the same license. Dependencies, optional executables, model weights and game
assets retain their own licenses. This is a technical inventory, not legal advice.

## Review performed

- Gitleaks 8.30.1, checksummed official binary, scanned source and Git history
  with redacted output on 2026-11-01; no credential leaks found.
- Current-tree heuristic scan rejects common credential strings and private data artifacts.
- Private runtime data remains outside Git. Public screenshots use disposable state.
- Public website is static, has no private API client and no third-party analytics.
- Lockfile package licenses are exported by npm run release:check.
- Updated the compatible @hono/node-server transitive dependency to address its
  path-decoding advisory. Protocol libraries remain pinned.

## Remaining dependency advisories

At review, npm audit reports 12 moderate findings, including transitive chains:
glob/minimatch under @fastify/static and uuid under prismarine-auth/MSAL/yggdrasil,
propagated to Mineflayer and development flying-squid. There are no high/critical
findings in this audit snapshot. Re-run npm audit for current results.

npm's proposed fixes include incompatible downgrades or major upgrades. Do not
force them without validating protocol/auth behavior. Static file glob configuration
is application-owned; game/media inputs are not passed as glob patterns. UUID
buffer APIs are not exposed directly by application routes. These boundaries reduce
exposure but are not a proof that dependencies cannot be exploited. This remains
an experimental prerelease, not a vulnerability-free production certification.

## License boundaries

- Application and original upstream: Apache-2.0; retain LICENSE and NOTICE.
- Prismarine/Mineflayer ecosystem: installed package notices plus pinned native
  adapter repository/file hashes; do not strip licenses when packaging.
- Space Grotesk and Barlow Condensed fonts: SIL Open Font License, distributed via @fontsource.
- range 0.0.3 lacks a package.json license field; installed LICENSE is FreeBSD
  (BSD-2-Clause). It is a development dependency through flying-squid.
- Optional Piper runtime may use GPL terms; speech is a separate optional process.
  Do not distribute a combined proprietary binary without a new license review.
- Kokoro model and voice files retain their own model cards/licenses.
- Codex/Claude/OpenCode installations, provider accounts and model weights are not
  bundled in source releases and are subject to their own terms.
- Minecraft, WebView2 and other vendor runtimes are not relicensed by this project.
  Source releases do not contain Minecraft server JARs or downloaded model binaries.

A free source license does not make Minecraft accounts or hosted inference free.
No trademark clearance or ownership of the common word “Waypoint” is claimed.


Claude Agent SDK is proprietary optional integration code, not relicensed as open source.
Run `npm run setup:claude` only if choosing that provider; it installs outside the
repository. The free local Ollama path and core installation do not require it.

The 0.4 design tools are pinned development dependencies. Lighthouse 13.5.0
was selected after 13.6.0 introduced an additional vulnerable development chain;
the final npm audit remains at the existing 12 moderate findings, no high/critical.
The new fixture server never connects a game/account/model or opens the microphone.
Public screenshots contain only empty or explicitly synthetic test sessions.
