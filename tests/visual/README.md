# Real-app visual fixture gallery

Build both surfaces, then run the isolated Chromium comparison suite:

```powershell
npm run build
npm run build:website
npx playwright test --config tests/visual/playwright.config.mjs
```

Review intended visual changes before updating references:

```powershell
npx playwright test --config tests/visual/playwright.config.mjs --update-snapshots
```

Screenshots cover all nine public pages, all sixteen workspace destinations, eight
contextual session states, all four Settings sections, recoverable conversation
errors and the keyboard-operated navigation dialog at 1440,
768 and 390 pixels. The tests also fail on serious/critical axe findings including
color contrast, horizontal overflow and page errors. Reduced-motion mode, UTC,
local fonts and a fixed test clock keep screenshots reproducible. Chromium/font
rendering can vary across operating systems; update baselines only after review
on the recorded Windows baseline environment.

The reference environment is Windows 10.0.26300, Node 24.18.1, Playwright 1.64.1
and Chromium 156.0.0.0. There are 117 references (39 screens at each width).
Linux CI runs `npm run test:visual -- --ignore-snapshots`: it still captures real
screens, checks accessibility, errors and interactions, but does not compare
Linux font rasterization to the Windows pixel references. Run the ordinary
command on Windows to enforce screenshot comparisons. Do not rebuild either
surface while a comparison run is active; Vite replaces files in its output
directory during builds.

`scripts/design-fixtures.mjs` creates a temporary SQLite database and the actual
local Fastify/WebSocket/API services. Inventory, tasks, profiles and blueprint
records are explicitly synthetic inputs to the real projection/accounting code.
No game client, account sign-in, microphone, provider inference or player data is
used. All workspace screenshots carry a visible fixture label and must not be
presented as recorded gameplay. The setter is an internal Node function; there
is no fixture mutation endpoint in the production application.

For a manual isolated review:

```powershell
node scripts/design-fixtures.mjs gathering
```

Use the printed loopback URL, then Ctrl+C to close and remove the temporary data.
Other scenarios: disconnected, building, exploring, hangout, blocked, mission,
inventory and collaboration. Only one fixture may run in each Node process because
the deterministic clock is process-local. Separate processes do not affect the
user's running companion.

Reviewed baselines live in `tests/visual/snapshots/`. Fresh captures and axe reports
are local under `.git/design-after/`; failure traces are under
`.git/visual-test-results/`. The gallery is development tooling and is not bundled
into the public website or dashboard.
