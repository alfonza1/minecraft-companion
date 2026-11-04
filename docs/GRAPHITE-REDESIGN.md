# Graphite studio redesign — 2026-11-04

## Scope

The public site and local workspace share a new neutral graphite design system:
native system typography, blue primary actions, quieter navigation, consistent
controls and clear surface hierarchy. The references and decisions are in
[DESIGN.md](../DESIGN.md). Apple pages informed the composition; no Apple artwork,
logos or proprietary font files are distributed.

All nine website routes and sixteen workspace destinations use the system.
Session keeps the current action, observed progress, carried supplies and chat
together. Build Studio groups preview/materials separately from source analysis
and construction controls. Settings, setup, inventory, resource accounting,
assistance, profile, memory, voice and diagnostics retain their existing APIs.
No game controller, inference provider, credential or persistence logic changed.

## Validation

Executed locally on Windows 11 with Node 24.18.1 and isolated headless Chromium:

| Check | Result |
| --- | --- |
| TypeScript, dashboard production build, nine-page website prerender | Passed |
| Full visual suite | 120 passed; 117 screenshots at 1440, 768 and 390px; no serious/critical axe violations |
| Final menu/chat-spacing and product-image changes | 60 affected visual/interaction checks passed again |
| Empty resource workbench | Accessible primary action and actual Build Studio navigation passed at 390, 768 and 1440px |
| Website integration | 45 page/viewports, 12 interaction flows, 18 accessibility checks; zero violations, page errors or private API requests |
| Workspace integration | 80 viewport checks across 16 routes; actual isolated API, WebSocket and SQLite persistence |
| Dashboard integration | Project creation, blueprint import, material counts, approval, 50/50 assignment, memory, lifecycle and mobile checks passed |
| Desktop and setup integration | Current/pending/error update states, five-step setup, issue banners and Realm onboarding passed |
| Backend suite, serial execution | 343 passed, 4 opt-in local speech tests skipped, 0 failed |
| Release audit | No source findings; 534 dependency licenses inspected; existing `range` package has undeclared license metadata |

One local unthrottled Lighthouse run at 1440×1000 scored the public homepage
100 for performance, accessibility, best practices and SEO. The disconnected
workspace scored 100 for performance, accessibility and best practices; SEO was
82 (the private local app has no marketing description or robots file). These
are local page-load measurements, not internet, gameplay or inference benchmarks.
Lighthouse still suggests CSS/JavaScript reduction and public-image/cache tuning.

The first backend run overlapped several browser suites and failed the account
worker's five-second startup deadline and one speech-process cancellation timing
assertion. Both passed in isolation; the complete serial run passed without
changing backend code. The initial failure remains recorded locally, rather
than being represented as a clean first run.

The first GitHub Linux run then exposed a separate pre-existing fixture race:
`model-control.test.js` wrote readiness JSON directly while the supervisor
polled it. The fixture now renames a complete temporary file, matching the real
MCP server's atomic publisher. No production model-control behavior changed.

Actual browser screenshots were inspected for every website page and workspace
route, plus mobile/tablet session, inventory, resources, settings and building
layouts. Review corrections included documentation-callout padding, lifecycle
heading scale, neutral preview-grid colors, visible P2 avatar lettering, switch
styling, chat welcome spacing and the secondary navigation dialog. The preview
test now waits for the actual lazy-loaded 3D workbench before taking its capture.

The website's gathering image is a capture of the actual UI with explicitly
labeled synthetic game observations. These checks validate presentation and
integration, not a new real-Realm gameplay run, physical microphone test or live
model response. No real account sign-in or game action was started by the tests.

Local evidence: `.git/design-after/`, `.git/apple-redesign/`,
`.git/design-lighthouse/` and `.git/hackers-lair/verification.json`. Intentional
visual baselines are committed under `tests/visual/snapshots/`.

## Maintenance and reversal

Shared tokens live in `packages/ui/companion-tokens.css`. Each app imports its
`src/studio.css` last. The previous compact/console theme files remain in source
but are no longer loaded. No new dependency is required for this redesign.

The pre-redesign baseline is `9628c013e41324b0e62eb4b80e0a65b437d2a250`, also saved
locally as `safety/pre-apple-redesign-2026-11-04`. To reverse the design, revert
the scoped redesign commit(s), rebuild both apps and publish the feature branch.
Use the existing safe desktop updater for the local app. Do not hard-reset the
repository or restore private data; voice preferences, accounts, projects and
memories do not need a rollback.

The Three.js preview remains a separately lazy-loaded bundle of approximately
506 kB before compression, producing the existing Vite chunk-size warning.

The local desktop updater completed while the companion was disconnected. A
read-only browser check confirmed eight visible tool destinations, inline chat,
no horizontal overflow and no page errors. Before/after hashes matched for
settings, profile, projects, memories and conversation; the launcher reports no
pending source update.

## Published delivery

Redesign commit: `353addc98c74a797a9f6de507a788d40fad6c6ba`.
[GitHub Pages deployment](https://github.com/alfonza1/minecraft-companion/actions/runs/41783131417)
completed successfully. A fresh headless browser verified the
[published homepage](https://alfonza1.github.io/minecraft-companion/): HTTP 200,
new graphite tokens, agent headline, default non-clickable gathering capture,
mobile fit and no JavaScript page errors. Final live captures are stored locally
as `.git/apple-redesign/published-home.png` and `published-mobile.png`.

## Layout refinement — November 4

The Workspace website page now groups its gathering preview and feature guide
in one composition. A compact introduction replaces the oversized split heading;
expandable explanations replace the secondary navigation strip. The lower
sections use a narrower label column, and internal-page introductions have less
vertical padding. In the local console, the everyday tools belong to the content
area, with a shorter header, tighter spacing and a more compact activity stage.
All eight destinations and their existing actions remain available.

Validation for this refinement: typecheck and production build passed; the
website suite passed 45 page/viewport checks, 12 interaction flows and 18
accessibility pages with zero violations or console errors. The workspace suite
passed 80 viewport checks across 16 routes using isolated HTTP/WebSocket/SQLite
state. All 120 visual tests passed with intentional baselines updated. Desktop,
tablet and mobile captures were inspected, including the feature accordion,
session, inventory, resources, tasks, building and installation layouts. The
accordion test checks both opening and collapsing its content.

Code review found no introduced behavioral or data-handling issues. This change
does not alter gameplay, providers or stored user settings. Real-Realm gameplay
and physical voice-device tests were not rerun for this presentation-only change.
Local evidence is under `.git/layout-review/`, `.git/website-checks/` and the
verification record under `.git/hackers-lair/`.

## Session spacing and conversation refinement

The disconnected screen exposed a spacing defect: the work column relied on the
optional world-status row to separate activity from inventory. It now owns a
24 px grid gap regardless of connection state. Inventory is an open shelf with
a divider, rather than another rounded panel attached to the activity panel.
The two main columns have 32 px separation on desktop and 24 px at smaller
widths. Main session panels use the 12 px radius token, without a drop shadow.

The conversation column is wider, and messages use full-width, separated rows
instead of nested bubbles. The existing save-memory action is a labeled,
keyboard-accessible bookmark beside each timestamp. Its endpoint, permissions
and saved data are unchanged. Offline controls and the composer cannot shrink
into the message history; only the history scrolls.

A new browser regression uses 40 synthetic messages in a disconnected session
at desktop, tablet and mobile sizes. It checks the inventory gap, chat width,
scrolling history, composer bounds and keyboard saving of a real fixture memory.
The first test run used the wrong store collection name for its final assertion;
the assertion now reads `adventureMoments`, matching the implementation. No user
conversation was copied into the fixtures or public captures. Local visual
evidence and test logs are under `.git/session-layout/`.

The corrected full visual run passed all 123 tests, including accessibility
checks and the new history regression at three widths. The workspace integration
suite passed 80 viewport checks across 16 routes. The website passed its 45
page/viewport checks, 12 interaction flows and 18 accessibility pages with zero
violations or browser errors. Public previews were recaptured from the isolated
fixture. Source review found no introduced data-handling or action-dispatch
changes; gameplay and physical audio tests were not rerun for this layout fix.
