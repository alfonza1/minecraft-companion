# Extend the agent

## v1 observation interface

See the runnable [inventory summary](../examples/extensions/inventory-summary.js)
and [registry](../packages/agent-extensions/index.js). An extension declares:
id, title, apiVersion:1, kind:observer, Zod input/output schemas and an observe
function. Register it explicitly in services/api/extensions.js.

The handler receives validated input, a structured clone of world observations,
and an optional AbortSignal. It does not receive auth, conversation, Store, raw bot
or mutation handles. Unknown world state returns an explicit unavailable result.
Output is validated before returning. Duplicate identifiers and unsupported versions
are rejected. Test with `node --test test/extensions.test.js`.

This is a small versioned contract, not a security sandbox or automatic plugin
loader. Installed JavaScript can still import Node APIs. Only install reviewed code.
Observers must terminate promptly and perform no external calls or gameplay actions.
Heavy computation belongs in an owned cancellable worker, not the request thread.

## Add a gameplay action

Use services/skill-executor/teammate.js as the existing registration point.
Add a strict schema, deterministic implementation and runtime dispatch. Update the
planner's allowed schema/prompt only after execution is safe. Preserve the single
body, respect reservations/permissions and confirm inventory/world outcomes.
Cancellation must settle before ownership is released. Add an isolated survival
fixture; a unit test with a fake bot is insufficient to claim gameplay support.

## Other contribution seams

- Models: provider registry with metadata discovery and execute(prompt, options).
  Preserve schema validation, cancellation, actual-or-unknown usage and no paid fallback.
- Planning: intent routing and bounded context in agent-orchestrator. Test unrelated
  conversation, ambiguous instructions and action leakage.
- Memory: structured SQLite documents and explicit provenance. Avoid unbounded history.
- Perception: world-state snapshots; distinguish loaded observations from stale records.
- Builds: validated blueprints, recipe engine, placement adapters and checkpoints.
- Voice: owned local speech workers; pause, interruption and device errors matter.
- Dashboard: typed snapshots and actual events; include disconnected/error states.

Additional environments and multi-body agents are proposed work. The current
planner/runtime still contain Minecraft-specific contracts. A valid new adapter
needs its own permissions, observations, tests and lifecycle, not fictitious agents
displayed in a diagram.
