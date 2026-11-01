# Local API

Base: http://127.0.0.1:4365. JSON requests only for mutations. Browser clients must
send the same permitted loopback Origin. HTTP/WebSocket Host and Origin checks
reject arbitrary public sites. This is not remote authentication.

| Method/path | Purpose |
| --- | --- |
| GET /api/state | Actual runtime snapshot; may include private local conversation |
| GET /api/health | Runtime/version readiness |
| GET /api/setup | Setup state without starting inference |
| GET /api/games | Playable adapter descriptors; currently Minecraft Survival only |
| POST /api/workspace/game | Validate a selected playable gameId; does not join it |
| POST /api/workspace/assistance/:id | Revision-checked player/companion/replan/defer decision |
| POST /api/workspace/tasks/:id | Revision-checked claim/transfer/defer/prioritize/cancel |
| GET, POST /api/companion/profile | Read or patch personality, talkativeness and memory preferences |
| POST /api/companion/mode | Explicit teammate/hangout/adventure/autonomous behavior selection |
| GET, POST /api/companion/moments | List or save an existing source record as a moment |
| POST /api/companion/moments/delete | Delete a saved moment by UUID |
| POST /api/companion/moments/clear | Delete all saved moments with an empty JSON body |
| GET /api/companion/export | Export profile and saved moments; contains private local content |
| POST /api/setup/check | Refresh installed-service readiness |
| POST /api/control | start, pause, resume, stop and supported cancellation commands |
| POST /api/settings | Strict validated settings patch |
| POST /api/conversation | Explicit natural-language request |
| GET /api/ai/:provider/models | Cached model catalog |
| POST /api/ai/:provider/models/refresh | Refresh metadata, no inference |
| GET /api/extensions | Registered observer metadata |
| POST /api/extensions/:id/run | Validated observer input; requires active runtime |
| POST /api/memories | Add explicit note |
| POST /api/memories/delete | Delete note by id |
| POST /api/data/backup | Local database backup, excludes separate auth cache |
| WS /api/events | Snapshot events: {type: "state", state: ...} |

The source in services/api and module-specific route files is authoritative for
detailed request schemas. [Build routes](../services/build-planner/README.md) and
[teammate controls](TEAMMATE.md) document their additional contracts.

Snapshots include the typed `workspace` projection plus `stream.instance`,
`startedAt`, `revision` and `sentAt`. Clients reject older revisions within an
instance and snapshots from older server instances. WebSockets also send
`{type:"heartbeat",at}` every 15 seconds; the workspace reconnects after 35
seconds without a message. World observations older than 15 seconds are stale.
This is a current-state stream, not a durable event replay protocol.

Assistance decisions use `{action,revision}`. Conflicts require fetching the
latest snapshot. Claiming materials does not verify delivery. Non-log companion
help starts a bounded source search, not an unsupported gather operation.
Replanning holds work for new instructions; deferral is persistent, not a timed
reminder. See [workspace behavior](WORKSPACE.md) and [game adapters](GAME-ADAPTERS.md).

Example, while active (no game mutation or model request):

```powershell
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:4365/api/extensions/inventory-summary/run -ContentType application/json -Headers @{ Origin = 'http://127.0.0.1:4365' } -Body '{"search":"iron"}'
```

An offline planning session returns observed:false and no inventory. A connected
session returns only matching observed stock. Errors include an actionable message;
callers must not interpret a rejected operation as completed work.

Never send a provider password/token through these routes. Microsoft authentication
uses device code and server-owned encrypted caches. No external website should
fetch this API or embed it in a public demo.
