# The Player Two workspace

Player Two is the shared home for an AI gaming companion. Minecraft Survival is the
only playable game. The workspace uses game-aware observations and keeps
Minecraft-specific inventory and building controls in dedicated views.

The workspace screenshot in the [README](../README.md) shows a disconnected test
session. The public website defaults to a labeled gathering example rendered by
the actual application with synthetic observations. Neither is proof of live
gameplay success; the disconnected screenshot remains available on the website.

## Find your bearings

The header identifies the selected game, companion and connection. Session puts
the current activity, objective, credible progress, resources, next steps and help
requests together. The companion panel offers a quick conversation without
turning low-level execution logs into chat.

| View | What it is for |
| --- | --- |
| Session | Current activity, carried items, useful next steps and inline chat |
| My companion | Name, personality, talkativeness, modes and saved moments |
| Current mission / Tasks & plans | Saved task steps, prerequisites, blockers and interruption controls |
| Inventory | Actual Minecraft slots, equipment and known storage |
| Resources | Raw gathering plan or finished building items, quantities and provenance |
| Collaboration | Resource splits, participant responsibilities and reported contributions |
| Activity | Recorded task starts, results, interruptions and blockers |
| Communication | Conversation history, messages and saving a real quote as a moment |
| Build studio | Minecraft references, blueprint preview, materials and approved construction |
| Games | The supported Minecraft workspace and links for future-game proposals |
| Extensions / Community | Installed observation modules and contribution paths |
| Settings / Setup | Existing model, Realm, voice, permissions and installation controls |
| Diagnostics | Searchable logs, service status, model usage and technical errors |

The visible tool strip opens Session, Tasks, Inventory, Resources, Build studio,
Chat, Help & teamwork and My companion directly. Settings has its own header
button. **More tools** or **Ctrl/⌘K** opens the secondary searchable menu for Setup,
Games, Activity and advanced tools. Escape closes the dialog and returns keyboard
focus. Session shows activity and carried items beside a working chat composer;
the conversation button also opens a focused chat window from any tool.
Settings separates Game account, AI & usage, Voice & devices and Data & diagnostics.
Small displays use compact resource progress and stacked work areas. Reduced-motion
preferences are respected.
Your model, voice devices, account and existing private data are preserved.

The graphite studio design uses shared system typography, neutral surfaces and
blue action controls. Build Studio groups the blueprint and materials beside
source and construction inspectors. The [design record](../DESIGN.md) documents
the references, component rules and pre-redesign rollback checkpoint.

## Start, pause and resume

Select Minecraft Survival in Games, then complete Setup with the separate bot
account's Microsoft device-code login. A compatible native connection is required
for exact inventory operations and construction. A browser page cannot make an
unsupported protocol or missing account work.

You can start an offline planning session for conversation and blueprint work.
It does not create an invisible Minecraft bot. Pause blocks new gameplay and model
requests while stopping owned work; explicit resume is required. Stop disconnects.
An emergency stop is always available in the header. Existing task checkpoints
and project data survive a workspace reload.

## What progress means

Gathering progress uses the current task's inventory baseline and a fresh observed
inventory. It is a net increase, not an attribution claim: a handoff can affect the
count. Tasks without reliable work units show a status instead of an invented
percentage or ETA. Saved task steps explain order, not equal-sized amounts of work.

Mission construction progress comes from observed blueprint checkpoints for the
current revision. A loaded verified block and an unchecked region are not the
same thing. Historical checkpoint timestamps remain visible because the world
can change after observation.

Disconnected, translated or stale inventory cannot claim current exact progress.
Chest snapshots are historical observations, not remote live access. Your personal
inventory is unknown unless you explicitly report a contribution or transfer
items in a way the companion can observe.

## Resource accounting

**Raw gathering plan** and **Finished building items** describe the same design
at different production stages. Do not add them together: logs may become the
planks in the other view. Version-specific recipes retain crafting yields.

Select an item on the material shelf to inspect its accounting and crafting
steps. The focused workbench separates:

- Required raw ingredients or finished crafted items.
- Verified construction coverage, retained after supplies are consumed.
- Fresh carried stock and the amount allocated to this project.
- Reservations protected for other work.
- Historical storage snapshot and observation time.
- Player assignment and manually reported contributions.
- Companion assignment and remaining usable stock deficit.

Upper door halves do not require another door item; double slabs require two
slabs. Repeated checkpoint indices are not counted twice. Raw construction coverage
is recipe-derived and is not attributed to the player or AI. Reported contributions
can overlap built work, so they are not simply added to that coverage. This avoids
counting the same supplies twice or asking for materials already used in a verified
section. [Detailed accounting contract](GAME-ADAPTERS.md).

Search, ownership/status filters and sorting help find the missing material.
Unknown stock remains unknown. The system conservatively excludes distant chest
contents from spendable inventory until supplies are actually retrieved.

## When your companion needs help

The persistent assistance inbox gathers material shortages and blocked saved work.
Requests survive screen changes and application reloads. Repeated source events
reuse the same identity; changed requests get a new revision.

| Response | Actual effect |
| --- | --- |
| I'll handle it | Assigns the requested quantity to you; it does not verify delivery. Matching active gathering is held. |
| Assign to companion | In a connected active native session, supported logs submit a bounded gathering task. Other materials submit a source search, not automatic acquisition. |
| Change the plan | Holds work and records that new instructions are needed. Continue in conversation; no hidden model request runs. |
| Remind me later | Defers the request while preserving its unresolved blocker. |

Only actual supply reconciliation resolves a material shortage as supplied. A
superseded blueprint revision closes its old request as replaced, not delivered.
Stale/conflicting clicks are rejected rather than silently overwriting another
decision. Rare materials are not automatically assigned to the companion merely
because a source-search job was accepted.

## Shared work and plan changes

Resource assignments can be split, reassigned and updated through Collaboration.
Your counts remain labeled user-reported. Task ownership controls claim, transfer,
defer or cancel saved work through the runtime's serialized mutation queue.
Player-owned and deferred tasks cannot run automatically. Returning a task to the
companion leaves it held until explicit resume. Prioritization moves a whole saved
frame only while work is held and idle; prerequisites within that frame keep their
order. No button turns a human claim into verified completion.

A new gameplay request can temporarily save the old task and resume it afterward,
according to the existing resume-after-help preference. A blocked task is held and
shown with its cause instead of silently retrying forever. [Teammate controls](TEAMMATE.md).

## Conversation and privacy

Natural conversation uses the actual world, current work and permitted memory
context. General questions cannot invoke gameplay tools. Voice uses the existing
configured speech provider and devices. It is not guaranteed to respond instantly;
model and hardware latency remain visible limitations.

The public website is static and never connects to your private workspace. Local
state and credentials remain outside Git. Exported profiles or backups may contain
private memories: inspect them before sharing. [Personality and memory](COMPANION-PERSONALITY.md).
