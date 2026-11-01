# Player Two 0.4.0-alpha.1 — The shared play desk

Player Two is an open-source AI gaming companion. Minecraft Survival remains its
first and only playable game. This release replaces the previous visual direction
without claiming new gameplay skills or a second integration.

- [Website](https://alfonza1.github.io/minecraft-companion/)
- [Source](https://github.com/alfonza1/minecraft-companion)
- [Install](INSTALLATION.md) · [Workspace guide](WORKSPACE.md)
- [Design audit and iteration](DESIGN-CORRECTION.md)
- [Automated source verification](https://github.com/alfonza1/minecraft-companion/actions/runs/41302691217)

## What changed

All nine public pages have new composition and copy. The mascot/concept artwork
is removed. Product screenshots show the actual application; the optional
populated gathering example is explicitly synthetic. Barlow Condensed, Space
Grotesk and a restrained blue-black/copper palette unify the two surfaces.

The workspace replaces its permanent sidebar with a compact bottom rail and
searchable Ctrl/Command-K navigation. A contextual session stage brings forward
actual gathering counts, the approved blueprint, observed position, conversations
or the current blocker. The material shelf opens a focused accounting workbench.
Settings has separate account, AI, voice and data sections. Conversation errors
appear inside the focused dialog, and live updates preserve 3D inspection controls.

Inventory, projects, assignments, assistance, memory, existing voice preferences,
model selection, pause/stop and runtime routes are retained. The 26.3 texture fix
only changes presentation; exact item names and game observations are untouched.
The local desktop update preserved hashes of settings, profile, projects, memories
and conversations. It did not join a Realm or alter the Minecraft installation.

## Validation

| Check                       | Result                                                                                   |
| --------------------------- | ---------------------------------------------------------------------------------------- |
| Default regression suite    | 346 tests: 342 passed, 4 optional speech checks skipped                                  |
| TypeScript and builds       | Dashboard and 9-page static website pass                                                 |
| Visual regression           | 117 screenshots compared successfully at 1440/768/390                                    |
| Accessibility               | All 117 axe reports contain zero violations                                              |
| Existing workspace behavior | 80 viewport checks plus setup/runtime integration pass                                   |
| Website interactions        | 45 page/viewport and 12 interaction checks pass                                          |
| Review fixes                | Navigation names, modal error visibility, WebGL persistence and image recovery rechecked |
| Local Lighthouse            | Website 100/100/100/100; workspace 99 performance, 100 accessibility, 100 best-practices |
| Security checks             | Staged Gitleaks/current-tree scans clean; 12 existing moderate npm advisories            |

The Lighthouse run used unthrottled local Chromium at 1440×1000. Scores are not
field performance or AI response-time benchmarks. Linux CI runs the same browser
behavior/accessibility checks without comparing Windows raster baselines.

[Desktop session](../tests/visual/snapshots/desktop-1440/screens.spec.mjs/workspace-overview.png) ·
[Resources](../tests/visual/snapshots/desktop-1440/screens.spec.mjs/workspace-resources.png) ·
[Construction](../tests/visual/snapshots/desktop-1440/screens.spec.mjs/context-building.png) ·
[Mobile](../tests/visual/snapshots/mobile-390/screens.spec.mjs/workspace-overview.png)

The complete 117-image set and reproduction commands are in
[tests/visual](../tests/visual/README.md). These populated screenshots use explicit
test observations through the actual API, SQLite and projection/accounting code.
They are not evidence of live Realm success.

## Limits that remain

This is an experimental prerelease. Fresh Realm authentication, physical
microphone/headphone interaction, voice naturalness, difficult terrain and new
video reconstruction trials were not rerun for this design release. Earlier
controlled gameplay/speech evidence is recorded in [verification history](VERIFICATION.md).
There is no claim that this redesign improves agent intelligence or gameplay speed.

Windows remains the full desktop target. macOS/Linux offline browser planning is
experimental. No signed standalone installer, unrestricted cave mining, arbitrary
house supply chain, general world map, multi-body team or second playable game is
provided. The Three.js preview remains a separately loaded approximately 506 KB
chunk. The public site is static; it never connects to a player's private service.

## Useful next contributions

Broader terrain/gameplay evaluation; cross-platform secure credentials and voice;
more crafting supply chains; game adapters backed by permitted automation; and
continued interaction testing with real players. See [Contributing](../CONTRIBUTING.md).
