# Contributing to Waypoint

Waypoint is an experimental autonomous-agent runtime. Minecraft Companion is its
first environment. We build on Mineness and preserve its Apache-2.0 attribution.

## Develop

Use Node.js 24 LTS and Git. Clone with submodules, then:

```text
npm ci --ignore-scripts
npm run setup:native
npm run build
npm start
```

The local dashboard is at http://127.0.0.1:4365. Public-site development is separate:
`npm run dev:website` at http://127.0.0.1:4370/minecraft-companion/.
Do not connect a personal Realm for destructive development tests.

Run `npm test`, `npm run typecheck`, `npm run build` and, for site work,
`npm run build:website` and `npm run test:website`. Browser tests use an isolated
headless browser. Optional survival tests require explicit Minecraft EULA acceptance;
see [evaluation](docs/EVALUATION.md).

## Propose a change

1. Search existing issues and read [architecture](docs/ARCHITECTURE.md).
2. Explain the observed problem, expected behavior and reproducible evidence.
3. Work on a feature branch. Keep commits focused; add regression coverage for risk.
4. Preserve permissions, cancellation, observed-inventory provenance and upstream notices.
5. Open a pull request describing behavior, validation and remaining limits.

Never add fabricated inventory, fake benchmark wins, hidden chain-of-thought,
unbounded agent loops, automatic paid fallback or a second controller for one bot.
Do not include credentials, private conversation, account identifiers, local
databases, auth caches, downloaded models or proprietary game assets.

## Contribution paths

| Level | Useful starting point | Evidence expected |
| --- | --- | --- |
| Beginner | Improve a specific setup error | Screenshot and recovery steps |
| Beginner | Keyboard or screen-reader navigation | Headless/UI regression |
| Intermediate | New observer extension | Unknown-state/schema/cancellation tests |
| Intermediate | Another placement state | Actual isolated survival fixture |
| Advanced | macOS/Linux secure credential store | Native storage and lifecycle tests |
| Advanced | A second environment adapter | Real observations, actions and safety contract |

See [extension guide](docs/EXTENSIONS.md). Suggested tasks are not claims that
maintainers have assigned or scheduled work. No paid membership is required.
Contributions are licensed under Apache-2.0; retain third-party notices and clearly
identify imported code. Be kind and specific in reviews.
