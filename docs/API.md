# Local API

Base: http://127.0.0.1:4365. JSON requests only for mutations. Browser clients must
send the same permitted loopback Origin. HTTP/WebSocket Host and Origin checks
reject arbitrary public sites. This is not remote authentication.

| Method/path | Purpose |
| --- | --- |
| GET /api/state | Actual runtime snapshot; may include private local conversation |
| GET /api/health | Runtime/version readiness |
| GET /api/setup | Setup state without starting inference |
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

