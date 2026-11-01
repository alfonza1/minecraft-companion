# Player Two gaming companion redesign

## Product

Player Two is a free, open-source AI gaming companion platform. Minecraft Survival
is the first and only playable integration. The relationship combines useful
teamwork, optional casual conversation and transparent user-controlled memory.
It does not imply consciousness, exclusive friendship or transferable abilities
between games.

## Audit and implementation boundaries

The existing Mineflayer body, Microsoft device flow, model adapters, local speech,
task stack, recipes and approved build executor are retained. Runtime gameplay
tools and action schemas remain Minecraft-specific. Shared model transport,
personality, lifecycle, observation contracts, help decisions and workspace
projections can be reused. A game registry and non-playable strategy fixture
exercise that boundary without claiming a second working integration.

Snapshot transport already sends real state over WebSockets. Added stream
instance/revision metadata prevents older fetches replacing newer observations;
heartbeats detect a silently stale connection. The workspace restores the latest
authoritative snapshot instead of reconstructing a fictional session in the browser.

## Design direction

The source references are the supplied Dribbble
[agent workspace](https://dribbble.com/shots/27639946-AI-Agent-Workspace-Product-UI-UX-Design),
[workflow dashboard](https://dribbble.com/shots/27798940-AI-Agent-Workflow-Automation-Dashboard),
and [project workspace](https://dribbble.com/shots/27543254-Project-Management-SaaS-Dashboard).
Their accessible descriptions informed focused navigation, clear activity hierarchy
and modular task views. Direct image fetching was gated; no pixel-level study or
copying of their artwork is claimed.

Original design: slate background #10141c, raised surfaces #191f2a, mint #83e5ba,
warm ivory #f5f1e8, quiet lavender #aaa7f2. Space Grotesk headlines, system body
type and monospace evidence labels. The companion's original geometric face is
the visual signature. It indicates activity, never an invented emotion score.

The overview pairs companion presence with current work, then the mission and
help inbox. Inventory uses actual slot positions. Resource cards distinguish raw
ingredients from placements, observed stock from reported contributions, and
consumed construction from remaining demand. A collapsible side conversation
keeps company without displacing the task. Technical logs have their own page.

## Checklist

- [x] Audit runtime, voice, memory, data flow and existing UI
- [x] Gaming-companion positioning with Minecraft-first support boundary
- [x] Original nine-page public website and Games/community entry points
- [x] Shared game projection contract with non-playable strategy fixture
- [x] Real profile, play-mode, proactive remark and saved-moment controls
- [x] Persistent assistance actions and consumed-material accounting
- [x] Complete workspace/browser integration and responsive review
- [x] Regression, gameplay, security and release validation
- [x] Update docs/screenshots and publish verified release

See GAME-ADAPTERS.md for the contract and extension example. Existing data and
launcher paths retain the MinecraftCompanion name to avoid breaking installations.

## Published evidence

- [Website](https://alfonza1.github.io/minecraft-companion/): all nine deployed
  pages and mobile homepage smoke-tested with no private API calls/page errors.
- [Windows and Linux CI](https://github.com/alfonza1/minecraft-companion/actions/runs/41299475153): passed on release source.
- [Source prerelease](https://github.com/alfonza1/minecraft-companion/releases/tag/v0.3.0-alpha.1): archive, checksum and dependency license inventory.
- Local app updated through the existing launcher while disconnected, after a
  database backup. Settings hash and project/memory/conversation counts matched
  before and after. No Realm join or gameplay was triggered by the update.

See DELIVERY.md for evidence scope and remaining consumer-release limitations.
