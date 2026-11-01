# Game adapters and workspace observations

Waypoint is an AI gaming companion platform. Minecraft Survival is the only
playable integration. This release adds a small, tested **observation adapter**
boundary; it does not claim the existing Minecraft executor can already control
arbitrary games.

## Implemented boundary

`packages/game-adapters/index.js` registers trusted, installed adapters. A v1
adapter contains a validated descriptor and a synchronous `project(state,
context)` function. The registry rejects duplicate identities and malformed
descriptors. It copies input observations before calling the adapter, and checks
the projection's version and game identity. It provides no bot, credential vault,
store, shell or network client. Installed JavaScript is trusted code, **not a
sandbox**; do not load downloaded plugins or media as code.

The shared TypeScript contract is in `packages/game-adapters/index.d.ts`. It
describes session identity, activity, missions, resources, assistance, tasks and
environment observations. Game descriptors declare their capabilities,
requirements, action names, safety boundaries and workspace widget identifiers.
The first adapter is `packages/game-adapters/minecraft.js`.

```js
import { createGameRegistry } from '../packages/game-adapters/index.js';
import { minecraftAdapter } from '../packages/game-adapters/minecraft.js';
const games = createGameRegistry([minecraftAdapter]);
const workspace = games.project('minecraft-survival', observedState, context);
```

The registry's projected contract is shared. Native actions, protocol handling,
crafting and permissions remain in the existing Minecraft runtime. Another
playable integration would need its own supported client/automation connection,
validated action executor, cancellation and permission tests. A descriptor alone
does not make a game playable. Respect that game's terms and anti-cheat rules;
never bypass enforcement to create an integration.

## Reproduce a second environment shape

`examples/game-adapters/strategy-fixture.js` describes synthetic energy resources
without Minecraft blocks or inventory slots. It has no game client or actions and
is explicitly `playable: false`. Register it only with `allowFixtures: true` in
development. It is absent from `/api/games` and cannot be selected in production.

Run `node --test test/workspace.test.js`. This checks both adapter shapes, input
isolation, descriptor rejection, progress and resource calculations, persistent
assistance decisions, task submission and pause gating. Modify the fixture to add
a different resource and assert its projected count; that is a working small
extension exercise, not an announced strategy-game integration.

## Accounting and observation limits

Gathering progress is a net inventory increase against the current task's saved
baseline. It is not a claim to attribute every pickup to mining: handoffs can
affect the delta. Unknown, disconnected or translated inventory cannot produce
an exact progress count. A freshness timestamp is included in the session.

Resources have separate `placement` and `raw` views. Never sum them: raw logs may
be ingredients of the planks in the placement view. Placement rows use required
**crafted items**, not visually placed blocks. Verified
checkpoint indices are deduplicated and mapped to consumed items (upper door
halves require no extra door; double slabs need two slabs). Verified historical
placements remain satisfied even after the inventory is consumed. A new blueprint
revision invalidates those counts. The checkpoint timestamp is shown because
unobserved world changes can invalidate earlier verification.

Owner reservations are protected once before unreserved inventory is allocated
across projects in creation order. Expired observations (over 15 seconds) cannot
claim current availability or gathering progress. Historical chest snapshots and player-reported counts
are displayed separately and never added to spendable stock or delivery progress.
Approved chest snapshots can change while unloaded, so the workspace does not
invent current accessible contents. This conservative rule can show a material
shortage until the companion actually retrieves the supplies.

Raw assignments receive a separate `constructionSatisfied` quantity, calculated
from the recipe plan for the unverified remainder. Recipe batch yields are retained.
This reduces further assigned gathering without claiming the companion or player
supplied those consumed materials. Manual contributions can overlap construction,
so the greater covered amount is used instead of adding both together. Unmappable
or unavailable version data receives no construction credit, conservatively.
Construction coverage never subtracts directly from the companion's share: if the
player supplied the consumed half, the companion still owes the remaining half.

## Persistent human assistance

`services/workspace/index.js` projects material requests and blocked task-stack
frames into a persistent inbox. Stable source IDs deduplicate repeated events.
Source changes advance a revision; stale or repeated conflicting clicks are
rejected. Browser reloads do not erase accepted/deferred decisions.

`POST /api/workspace/assistance/:id` accepts `{ action, revision }`:

- `player`: assigns the material to the player without inventing delivery. A
  matching active gathering action is held when responsibility changes.
- `companion`: requires an active, connected native session. Supported logs submit
  a bounded gathering job through the existing task stack. Other materials submit
  a safe **source search**, not a promise to acquire them. Rare-material ownership
  is not silently reassigned.
- `replan`: holds saved/current work and records an instruction request. The user
  supplies the revised plan in conversation; no hidden inference is triggered.
- `defer`: preserves the request and its blocker without interrupting other work.

Only the existing construction controller's observed supply reconciliation marks
a material request resolved. Acceptance or a manual claim cannot do so. A replaced
project revision resolves the old request as superseded, not delivered.

`GET /api/games` returns the actual installed playable list.
`POST /api/workspace/game` validates the chosen integration; with only Minecraft
available it does not reconnect or change accounts. Existing loopback/origin guards
protect these routes when registered by the API.

`POST /api/workspace/tasks/:id` accepts `{ action, revision }` for a saved task
frame. `claim`, `transfer`, `defer` and `cancel` use the existing serialized task
mutation queue and checkpoint active work before ownership changes. Player-owned
or deferred frames cannot run automatically. Returning a task to the companion
keeps it held until explicit resume. `prioritize` moves a whole saved frame to the
top only while work is held and idle; it never reorders that frame's prerequisite
actions. No button marks player work as verified completion. See
`test/workspace-tasks.test.js` for interrupted progress and conflicting updates.

## Next useful contributions

- Extract a full action-executor interface only when a second legitimate game
  integration can validate its cancellation and permission requirements.
- Add version-specific game widgets behind the descriptor's widget identifiers.
- Track verified chest transfers and acquisition attribution before using them
  for less conservative project forecasts.
- Extend scenario fixtures without presenting synthetic results as gameplay.
