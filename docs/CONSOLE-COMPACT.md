# Direct tools and a shorter website

## What changed

The public website now has a 1280px content boundary, a side-by-side introduction
and actual-app preview, shorter sections and smaller desktop headings. The home
page measured 2005px tall at a 1440px viewport, down from 3098px before this change.
The same spacing system applies across all nine public pages.

The console opens to a working Session, with current activity and carried items
beside an inline conversation. Tasks, Inventory, Resources, Build studio, Chat,
Help & teamwork and My companion are visible tools rather than menu discoveries.
Settings stays in the header; the searchable More tools dialog retains advanced
destinations. Existing saved Overview routes open Session automatically.

Gathering counts, construction previews, assistance and inventory still come
from the same runtime projection. No backend accounting or gameplay behavior was
replaced. Desktop previews and counts fit beside the composer; smaller displays
stack the work areas and expose all eight tools in two rows.

## Browser review

Screenshots were captured and inspected in headless Chromium at desktop, tablet
and mobile widths. Review caught the building preview stretching its work area,
squeezed preview filters, an initially clipped empty-chat welcome, and an extra
mobile control row. These were corrected before final capture. Conversation can
keep a draft while paused; both Send and keyboard submission are gated by the
runtime state.

Populated game states use clearly labeled deterministic fixtures with the real
HTTP/WebSocket/SQLite application. They are layout and interaction evidence, not
new gameplay validation. The website contains no private state or API connection.

## Reproduce

```powershell
npm run typecheck
npm run build
npm run build:website
npm run test:website
npm run test:workspace
npm run test:visual
node apps/dashboard/tests/integration.mjs
node apps/dashboard/tests/desktop-ui.mjs
node apps/dashboard/tests/setup-integration.mjs
node apps/dashboard/tests/setup-issues.mjs
node apps/dashboard/tests/realm-onboarding.mjs
```

Complete builds before starting screenshot tests; rebuilding while Vite's output
is being served can temporarily remove the page being tested. The opt-in real
Microsoft device-code test is separate and unnecessary for a layout update.

## Verification — 2026-11-01

- 120 visual/interaction cases passed across the completed website run and final
  console rerun; 117 corresponding axe reports contain zero violations.
- 12 focused screenshot/interaction comparisons passed again against the final
  build, without updating their baselines.
- 80 workspace viewport checks and real API/WebSocket/SQLite flows passed,
  including inventory updates, assistance ownership, memory and reload recovery.
- 45 public page/viewport checks, 12 public interaction flows and 18 additional
  accessibility scans passed, with no private API requests.
- Desktop update controls, inline send, paused keyboard gating, setup navigation,
  setup-issue recovery and fixture Realm onboarding passed. General integration
  checks covered lifecycle controls, project approval, material splits and memory.
- TypeScript and both production builds passed. No dependency, account, protocol,
  native audio or gameplay changes were required.

The first visual run had a temporary missing-page failure caused by rebuilding
the served output during the run; the stable-build rerun passed. Review also
updated older selectors that assumed the removed sidebar/overview composer.
Real Microsoft sign-in and Realm gameplay were deliberately not repeated.
