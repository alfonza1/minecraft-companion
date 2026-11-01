# Contributing to Waypoint

Waypoint is an open-source AI gaming companion platform. We want companions that
are useful in a game and enjoyable to talk with. Minecraft Survival is the first
and only playable integration. We build on Mineness and preserve its Apache-2.0
attribution. New worlds need community engineering and evidence, not just a logo.

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

For interface work, read [the workspace guide](docs/WORKSPACE.md). Preserve the
separation between conversation, observable activity and diagnostics. Every number
must identify what it measures; unknown inventory is not zero stock. For personality
work, read [the behavior contract](docs/COMPANION-PERSONALITY.md): do not introduce
invented shared memories, emotional dependency mechanics or fake relationship scores.

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
| Intermediate | New game-specific workspace observation | Adapter contract and unavailable-state tests |
| Advanced | A second playable game | Permitted interface, real observations/actions and safety contract |

See [extension guide](docs/EXTENSIONS.md). Suggested tasks are not claims that
maintainers have assigned or scheduled work. No paid membership is required.
Contributions are licensed under Apache-2.0; retain third-party notices and clearly
identify imported code. Be kind and specific in reviews.

## Propose a game

Use the **Game integration proposal** issue template. Describe a cooperative goal,
the supported integration mechanism, observable game state, required permissions,
failure/cancellation behavior and a small reproducible test. Respect the game's
terms, anti-cheat and other players. Do not propose bypassing enforcement.

Start with [game adapters](docs/GAME-ADAPTERS.md) and the runnable
`examples/game-adapters/strategy-fixture.js`. The fixture is not playable and is
excluded from the production game list. A second game must supply its own action
execution; the existing Minecraft skill executor does not become generic merely
because observations share a shape.

The issue tracker is the current public proposal system. There is no separate
voting backend or promised game-release schedule. Testing, documentation, accessible
controls and thoughtful bug reports are contributions too.
