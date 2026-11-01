# Design correction: the shared play desk

## Current palette

The follow-up theme replaces the original navy/copper palette with near-black
`#080b10`, graphite surfaces `#10151d`, cool white text and blue `#79b8ff`
interaction accents. The navigation dock is dark, with separate selected, hover
and keyboard-focus states. Shared tokens remain in
`packages/ui/companion-tokens.css`; warning and error colors remain distinct.
The homepage no longer includes “Future games will take community work.”
Product captures and visual baselines are refreshed to match the application.

## Audit before implementation

Captured every public page (9) and workspace destination (16) in an isolated
Chromium browser, using a temporary real local API/SQLite installation. Full-page
images and five contact sheets are under `.git/design-before/`; all five sheets
were visually examined. Reference screenshots are under `.git/design-references/`.
No user Realm or saved private configuration was used.

| Screens                      | Observed weakness                                                                 | Structural correction                                                      |
| ---------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Home                         | Robot, orbital decoration, repeated split blocks and slogan-heavy copy            | Product-led editorial opening and a wide real workspace presentation       |
| Games                        | Generic voxel concept art and mascot path imply experiences we cannot demonstrate | Honest supported-game specification and concrete contribution brief        |
| How it works                 | Abstract cards make the implementation look like a slideshow                      | One request traced through the actual lifecycle, selectable steps          |
| Get started                  | Dense instructions lack clear install/task hierarchy                              | OS-specific setup path with separate prerequisites and checks              |
| Features                     | Seven nearly identical feature rows                                               | Group by player situations and show real product views                     |
| Docs                         | Long flat index                                                                   | Searchable reading routes with explicit user/developer grouping            |
| Engineering                  | Generic metrics box above code                                                    | Clearly scoped test evidence and reproducibility notes                     |
| Roadmap                      | Three same-weight columns                                                         | Current work and research separated in a readable sequence                 |
| Contribute                   | Repetitive grids and abstract invitation                                          | Concrete first changes and extension entry points                          |
| Overview                     | 16-item persistent sidebar, robot, equal-weight empty panels                      | Full-width session stage and contextual focal object                       |
| Profile, communication       | Mascot and generic chat container                                                 | Companion callsign/presence and a conversation sheet integrated into play  |
| Mission, tasks               | Empty cards repeat page headers                                                   | Horizontal work sequence and focus on the next executable step             |
| Inventory, resources         | Everything looks like another admin card                                          | Item workbench, selectable material details, explicit ownership/accounting |
| Collaboration                | Request inbox buried above a second task board                                    | In-context request strip and clear player/companion responsibilities       |
| Activity, diagnostics        | Similar weight despite different audiences                                        | Activity as a timeline; technical evidence remains an advanced tool        |
| Build studio                 | Workflow is buried in stacked panels                                              | Dedicated build work area retaining real imports, preview and approval     |
| Games, extensions, community | Decorative cards and repeated mission controls                                    | Purposeful catalogs accessed through the tools menu                        |
| Settings, setup              | Long paired forms compete for attention                                           | Subdued form surfaces and explicit section hierarchy                       |

## References actually inspected

- [Dribbble workflow](https://dribbble.com/shots/27798940-AI-Agent-Workflow-Automation-Dashboard): visible canvas screenshot; useful dependency hierarchy, reject its sidebar/glowing-node styling.
- [Dribbble project management](https://dribbble.com/shots/27543254-Project-Management-SaaS-Dashboard): visible screenshot; strong overview/detail scale, reject purple promotional treatment and default sidebar.
- [Dribbble agent workspace](https://dribbble.com/shots/27639946-AI-Agent-Workspace-Product-UI-UX-Design): page captured but main artwork remained a placeholder; no image-level analysis claimed.
- [Playdate](https://play.date/): browser screenshot inspected; product as centerpiece and specific friendly copy. No hardware artwork reused.
- [Obsidian Canvas](https://obsidian.md/canvas): browser screenshot inspected; tools recede around meaningful work. No infinite canvas invented for this app.
- [Awwwards gaming directory](https://www.awwwards.com/websites/gaming/): visible compositions compared, especially typographic scale and product imagery. No assets copied.
- Behance search was blocked (403), so no design conclusions are attributed to it.

## Three directions considered before UI code

### A. Cinematic expedition

Large genuine gameplay capture, compact HUD and widescreen mission overlays.
Strong gaming character, but no reliable live stream exists and a staged video
would misrepresent the product. Requires footage production to carry the design.

    [ minimal brand / game ]
    [ full-bleed real gameplay + mission caption ]
    [ contextual transport / talk ]

### B. Shared play desk — selected

A substantial central session, condensed display typography, quiet blue-black
work surface, copper highlights and practical tool rail. Gathered items, saved
plans and observed positions become the visual material. Communication belongs
in the same workspace. Readable when disconnected and useful without a video.

    [ brand / session selector       runtime controls / tools ]
    [ current objective                observed work object   ]
    [ context: next step / help / supplies                    ]
    [ talk entry                         compact tool rail   ]

### C. Spatial mission table

Draggable task islands and contextual floating inspectors. Strong originality,
but arbitrary positions impair keyboard/mobile navigation and imply parallel
execution that our one-body runtime does not support. Keep only contextual
inspection, not freeform spatial positioning.

    [ goal ] --- [ current action ] --- [ observed result ]
              [ floating materials ] [ conversation ]

Selection: B offers the best balance of originality, real data and accessibility.
Do not mix in the cinematic/spatial decoration without a real use case.

## Visual system

Ink #141e2c; desk #1c2a3b; raised #27374b; parchment text #f0eee7;
muted #b6c1cd; copper #e9b589; ice #b6cbef. No ambient glow or glass.
Barlow Condensed 600/700 for short display statements, Space Grotesk for UI/body,
Consolas for measurements only. Radius 4px controls and 8px workspace boundaries;
large circular containers and avatar faces removed. Empty states tell users what
to do. Numbers always describe observed work, never fictional progress.

## Tools and boundaries

Existing Playwright 1.56+ and available Playwright MCP inspected. Use isolated
headless Chromium to avoid stealing the player's focus. Add exact dev-only
@axe-core/playwright 4.14.0 and Lighthouse 13.5.0, compatible with development
Node 24.18.1; Barlow Condensed 5.3.0 is OFL-licensed. Storybook React/Vite 10.6.5
supports this React 19/Vite 7 stack, but a separate component app would duplicate
our real API fixture harness. Use the real app fixture gallery for isolated states
and browser screenshots instead. No paid visual service or production test data.

Official guidance reviewed before installation:
[visual snapshots](https://playwright.dev/docs/test-snapshots),
[axe integration](https://playwright.dev/docs/accessibility-testing),
[Storybook Vite](https://storybook.js.org/docs/get-started/frameworks/react-vite),
[Lighthouse](https://developer.chrome.com/docs/lighthouse/overview).

## Iteration log

- [x] Capture and examine all current screens and accessible references.
- [x] Compare three structural directions; select one before UI implementation.
- [x] Replace website composition/copy and workspace navigation/stage.
- [x] Capture desktop/tablet/mobile and critique the composition.
- [x] Rework weak areas; test real controls, keyboard access and axe.
- [x] Capture final scenario fixtures, run screenshot comparisons and Lighthouse.
- [x] Publish and update the existing local launcher without changing preferences.

## Critique and corrections made after rendering

The first rendered pass exposed repeated goal text, mobile controls wrapping onto
an awkward extra row, and every Minecraft 26.3 item appearing as a generic cube.
The repeated title was removed; mobile controls now share a deliberate row. The
asset API now reuses an installed texture catalog by exact item name only, with
explicit fallback headers. It does not change protocol or inventory semantics.

A second review moved mobile gathering quantities above the fold, replaced the
long two-column settings wall with four focused sections, and made the plan's
actual sequential steps readable horizontally on desktop. Assistance stays near
the blocked task. The resource shelf opens one accounting inspector rather than
repeating a full card for every material.

Accessibility scans caught mismatched visible/accessibility names on navigation,
hotbar slots and saved-message controls, plus dim preview captions and unfocusable
scrolling code snippets. All were fixed. Review also caught failed requests hidden
behind the conversation modal and the construction camera resetting on each fresh
state object. Errors now render inside the modal, and blueprint identity is stable
until its project/revision changes. Follow-up browser tests confirmed all four
review findings closed, including real WebGL control preservation.

Lighthouse identified a late-loaded display font moving the homepage preview.
Vite-resolved, self-hosted font preloads reduced measured CLS from 0.12984 to 0.000116.
No font service or external analytics were introduced.

## Final evidence (2026-11-01)

- 117 Playwright screenshot comparisons passed at 1440, 768 and 390px; all 117 axe
  reports have zero violations. Includes all 9 public pages,16 workspace destinations,
  contextual sessions, all 4 Settings sections, navigation and a failed-message dialog.
- 80 existing workspace checks across 1440/768/414/375/320, plus real API setup and
  start/pause/resume/stop integration checks, passed.
- 45 public page/viewport checks, 12 interaction checks and 18 additional axe scans passed.
- TypeScript, both production builds and 346 regression tests: 342 passed, 4 optional
  speech checks skipped. Seven targeted API/fixture checks passed after final edits.
- Lighthouse 13.5 local unthrottled desktop run: website 100 performance/100 accessibility/
  100 best-practices/100 SEO; private workspace 99/100/100, with SEO intentionally
  irrelevant to its loopback-only role. These are local page audits, not gameplay
  or model-latency benchmarks.
- Staged Gitleaks scan and current-tree artifact scan found no secrets. npm audit
  retains 12 existing moderate findings; no high/critical findings.
- Published site checked in Chromium at desktop/mobile: HTTP 200, expected heading,
  fixture selector works, zero page errors/overflow, no old mascot asset.
- Local launcher update completed while disconnected. Hashes of settings, profile,
  projects, memories and conversation matched before/after. No Realm joined.

See [reproducible tests](../tests/visual/README.md), [workspace guide](WORKSPACE.md)
and [release scope](DELIVERY.md). All populated game screenshots are explicitly
synthetic observations rendered by the real app, not recorded live gameplay.
