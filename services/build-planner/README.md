# Build and resource services

`registerBuildRoutes(app, {store, runtime, publish, dataDir, orchestrator})` registers
the persisted project API. Runtime owns gameplay and cancellation through
`runJob(name, work)`; the architect calls the shared restricted Codex provider.

Blueprints contain exact relative placements, a Java version, bounded dimensions,
source provenance and explicit uncertainty. Names/states come from that exact
installed `minecraft-data` release. Revisions are immutable records; changing the
design invalidates approval and the site checkpoint. Approval stores a SHA256 of
the normalized blueprint. A saved design's counts describe that design, even
when its references leave hidden architecture unknown.

Routes under `/api/projects/:id`:

- `POST /blueprint {blueprint}` and multipart `POST /schematic` import designs.
- `POST /design {description,includeReferences?:boolean}` invokes real Codex
  structured generation. Text/title reference summaries are shared only when
  `includeReferences` is explicitly true. Binary uploads stay local. Images and
  video are not yet analyzed by a vision provider.
- `GET /revisions`, `POST /approve {}` and `POST /build {origin:{x,y,z}}` control
  reviewed design versions. Build starts a runtime-owned job; cancelling an HTTP
  request does not cancel construction. Use companion task controls.
- `POST /split {aiPercent}` or `/assign {material,aiPercent}` changes workload.
- `POST /progress {owner:'user',material,quantity}` records user-reported stock.
  No ordinary Realm client has access to another player's full inventory.
- `POST /gather {material}` requests one reconciled batch of at most sixteen
  oak/spruce/birch logs. The selected tree must have natural soil and a matching
  observed leaf canopy. Other mining sites require a future protected-site skill.
- `POST /references` accepts bounded image/video multipart data or JSON
  `{type:'text',text}` / `{type:'youtube',url}`. YouTube only supplies public
  oEmbed metadata; no video download, transcript or hidden measurements are claimed.

Crafting expands the installed version's actual recipes, aggregates shared
intermediates before rounding batch yields, and separates placed blocks from
inventory items (including door halves and double slabs). On Windows an existing
exact-version vanilla client JAR is inspected read-only for smelting/stonecutting
recipes and ingredient tags. Recipe provenance includes its SHA256; Minecraft
files are never changed. Missing production data and fuel selection remain
explicit unresolved prerequisites. This is a deterministic valid production plan,
not a globally optimized resource solver.

Bot stock is allocated once across projects in creation order, with provenance,
observation timestamps and separate full inventory totals. Counts describe
currently observed stock, not assumed contents of remote chests or historical
gathering totals. Older observations are marked stale on disconnect. Reservations
prevent two builds from consuming the same inventory.

Sponge v1–v3 imports run in a bounded worker with decompression, dimensions,
palette, state, VarInt and volume checks. Unknown blocks are rejected instead of
the dependency's silent air fallback. MCEdit and Litematica are explicitly
unsupported. Air, block entities, container contents and entities do not authorize
clearing or imply materials.

Construction supports inert cubes, dry stairs/slabs, paired closed doors,
oriented logs/pillars, fences and panes. Placement uses actual facing, halves,
hinges and axes; neighbour-derived stair shapes/fence connections are checked
in the final world pass. Doors wait until the shell finishes for access. Double
slabs resume from an observed half without double-counting items. Existing
conflicts and occupied/unloaded positions remain protected. No excavation or
server commands are used for placement. Optional saved automatic worksite plans
add grounded ramps, perimeter access and shaped-placement braces. Only confirmed
temporary blocks are cleaned up; unacknowledged/replaced blocks stop for inspection.
Plans are scoped to revision/hash/site/Realm/dimension and cannot be discarded
while ownership or mining intents remain unresolved. Destructive repair stays disabled.

Build supplies reserve available inventory in batches, withdraw allowed items
from approved chests within64blocks, and craft from unreserved owned ingredients
using real recipe yields. Wood conversions produce the needed plank batches;
rare/named/enchanted ingredients are protected. Optional raw supply trips gather
oak/spruce/birch logs and approved-area cobblestone/dirt/sand within64blocks.
Recipe recursion uses actual yields; an extra four-plank workbench can be built
at the reviewed site. Shares, starting contributions and mined quantities constrain
gathering unless covering the user's remainder was enabled. Worksite supplies use
separate ledgers. Pickup totals are historical, never substituted for inventory.
Furnace/stonecutter production, arbitrary supplies and tool replacement are not
implemented. Unsafe conditions or missing sources stop at a checkpoint.
Placement and supply execution use zero model calls.

`POST /api/projects/:id/construction-plan` takes `{origin,policy}`. Policy fields:
`scaffolding`, `gatherMaterials`, `takeOverShares`, `scaffoldMaterial` (dirt/cobblestone).
Preparing inspects without modifying the world; starting the approved project
executes its saved plan. `{origin,cleanupOnly:true}` on the existing build endpoint
removes recorded scaffolds independently. Limits live in
`services/build-executor/construction-plan.js`:32×16×32,512scaffolds,64block radius,
16raw items per batch. Nonwood mining requires the current Realm/dimension's
approved mining work area; known project footprints and bases are excluded.

`node scripts/test-native-game.mjs --automatic-build` tests actual temporary
construction/cleanup, raw gathering, recursive crafting, workbench creation,
interruption/resume and a tall enclosed house in a disposable local survival world.

`node scripts/test-native-game.mjs --building-only` exercises nine scenarios
against a disposable localhost official26.3 survival server, including all four
stair/door headings, both halves/hinges, slab consumption/resume, chest resupply,
crafting and a complete small house. It does not join or modify the user's Realm.

Validation: `node --test test/build-*.test.js`. Tests include real NBT parser
round trips, actual local vanilla production recipes when installed, API
integration, malicious inputs, batching, shared stock, approval and deterministic
construction/cancellation against controlled observation doubles. These tests do
not claim actual Realm survival placement validation.
