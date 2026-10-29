# Teammate tools

Open **Companion** for saved work, places, routines, supply chest permissions and death recovery. Voice and text share the same router and task stack. No new paid service is needed. The voice feedback sounds/listening-indicator proposal was not added.

## Temporary requests

“Get 8 oak logs,” then “come here” saves the gathering progress, walks to you, returns to the observed job site and gathers the remaining quantity. Nested requests resume in reverse order. Both immediate commands and model-planned action requests use this behavior. General conversation never interrupts gameplay. Existing follow mode can be restored after a temporary request.

Saved work is visible with steps, remaining quantity and the actual blocker. **Pause** preserves work; **Resume companion** continues a paused session. **Stop current task**, “stop,” “forget that,” “cancel,” full Stop and Emergency Stop clear all saved tasks so they cannot restart later. A failed helper holds the stack; fix its blocker and say **“resume previous task”**, or discard that helper in the dashboard and resume the original work. Automatic return after helping is enabled by default and can be disabled.

Gathering/crafting/drop progress uses observed inventory deltas. Project construction keeps its existing per-block checkpoint and revalidates the same approved revision, hash, materials, location and actual world before resuming. Unverified inventory transfers require inspection rather than automatic replay. Crash checkpoints contain the latest observed progress, which can lag the server; after an unexpected crash inspect inventory before explicitly resuming. No job starts by itself when the app boots. Twelve saved frames maximum prevents an unbounded interruption queue.

## Commands

| Say or type | Behavior |
| --- | --- |
| Help me | Go to your currently observed location, or one observed in this Realm/dimension within five minutes. Check risk, obey retreat/defend preference, and offer two common food items if safely available and unreserved. |
| Get ready to mine / build / travel | Check the saved routine, withdraw missing approved supplies, accept better usable tools, and equip the relevant tool. Missing stock is reported as a blocker. |
| Bring me a stack of oak logs | Use free owned stock, check approved chests, and gather missing natural logs if necessary. Deliver only the requested unreserved amount. |
| Restock supplies | Check the mining routine against approved nearby chests. |
| Save this spot as home | Save your position when the companion can currently see you. The dashboard can also save the companion’s position. |
| Go home | Travel to the saved place, checking Realm and dimension. |
| Recover your items | Assess the latest saved death site, travel there and pick up visible drops if conditions remain safe. |
| Resume previous task | Resume the top saved job after its blocker is resolved. |
| What are you doing? | Answer from actual task state without a model call. |

“Wood” in a stack-fetch request currently means oak logs; specify spruce/birch/etc. when needed. Fetching other resources uses owned items or approved stock; it does not pretend to have an autonomous ore/food farm acquisition system. Tree harvesting still requires natural soil and an observed leaf canopy, and is bounded by the existing 45-second action deadline. Large deliveries may need a further explicit resume after a genuine timeout. Recipient pickup cannot be verified by the companion; the result reports actual server-confirmed drops.

## Approve supply chests

1. Bring the companion within six blocks of a normal chest or barrel.
2. Expand **Approved supply chests**, click **Scan nearby chests**, select the observed container and list the common items it may take.
3. Approve it. Optionally enable **Restock before new gathering jobs**.

The companion checks live contents when opening a chest and labels stored stock with observation time. An unopened approved chest has unknown contents. Only approved items are withdrawn, only up to the missing amount, only from the same Realm/dimension and within 64 blocks. Revoking permission stops subsequent withdrawals and cannot be undone by a late stock update. Trapped chests, rare items, named/enchanted tool stock and worn replacement tools are excluded. Mixed tool stacks are skipped when a type-based withdrawal could select protected gear. A chest replaced at the same approved coordinates inherits that location’s permission; revoke permission when repurposing it. Build reservations are excluded from deliveries.

Edit each routine’s target supplies in the dashboard using one item and count per line, such as `torch 32`. Default mining supplies are eight bread, 32 torches and one stone pickaxe; a better healthy owned pickaxe counts. Fewer than 16 durability points means a tool needs replacing. This checks/restocks equipment; it does not yet smelt new iron, repair enchanted tools or replace armor automatically.

## Updates, recovery and limits

Choose **Quiet**, **Useful** or **Social** updates. Danger/blocker warnings are deduplicated. Useful mode adds meaningful completions; Social can occasionally offer help when idle. Enabled browser/desktop voice can read new updates without enabling microphone capture by itself. It avoids interrupting active speech/listening. Pause prevents new speech inference. Death remains a paused event, so its saved notice can be read on screen without violating pause.

Navigation tries at most three routes with a slightly relaxed arrival tolerance, then explains the blocker. It never digs or builds an escape route. The existing action deadline also bounds attempts.

Death records contain the observed death position and last observed inventory, not a claim that all items dropped. Keep-inventory rules, lava, other players and despawning can change what remains. Five minutes is a loaded-world despawn rule, not a guaranteed wall-clock recovery countdown. Recovery refuses wrong Realm/dimension, low health/hunger or observed danger; it visits up to twelve nearby item entities and reports only verified inventory gains. Drop ownership and full recovery remain unverified.

Rescue is a conservative client skill, not a guarantee against hostile mobs. Defense is close-range and bounded, respects combat preferences, and avoids creepers/wardens/high-risk groups. It cannot see remote players, know their full inventory, guarantee their safety, or cross dimensions on its own. Hostile-combat performance and physical voice announcements during Minecraft play still need user gameplay validation.

Key bounds are named in `services/skill-executor/teammate.js`, `navigation.js` and `services/agent-orchestrator/task-stack.js`: `PLAYER_LOCATION_MAX_AGE_MS`, `MIN_TOOL_DURABILITY`, `SUPPLY_SEARCH_RADIUS`, `CHEST_APPROVAL_RADIUS`, `MAX_RECOVERY_DROPS`, `MAX_NAVIGATION_ATTEMPTS`, `MAX_TASK_STACK`.

## Survival work and loot storage

**Companion → Survival work** has real Hunt, Get food, Tend farm, Cook, Explore, Store loot and Resume approved build actions. Common anchored voice commands use the same deterministic skills without model inference. Background work can be enabled with **Stay productive between my requests**; it uses helpful autonomy and one existing gameplay controller. Stop holds it, Pause/disconnect gate it, and explicit resume restores it. It will wait when unsafe or unprepared; “always busy” does not mean endlessly retrying an unsafe or impossible job.

Approve a nearby normal chest for deposits through Routines & supplies. New chest approvals permit deposits; older approvals need **Deposit loot** enabled within six blocks. Common withdrawal allowlists still apply and rare shared items cannot be taken by routines. Loot deposits preserve an ordinary kit, the best owned tools, food, torches, some wood/stone, replanting supplies and project reservations. Surplus is never thrown away. Generic transfers skip named/enchanted gear variants. Storage is observed through server-confirmed container inventory, with player inventory reconciled after closing. A full, missing or revoked chest blocks depositing and risky background gathering. Named/protected valuable cargo also prevents exploration.

Approve the existing farm while the companion is nearby. Only mature wheat, carrots, potatoes and beetroot within that Realm/dimension area are harvested, with a spare unreserved seed/item required before digging. Immature crops are untouched. Pending replant repairs are checkpointed so a later farm run can restore a crop interrupted after harvesting. This does not create or expand farmland or clear terrain.

Hunting supports nearby adult cows, pigs, sheep and chickens with observed metadata. Named, baby, attached/leashed/ridden, farm-adjacent and fenced animals are excluded, as are animals close to a saved Home/Base. Ownership is inferred conservatively; an unmarked animal's owner cannot be proven by an ordinary Realm client. Hunting and roaming wait for suitable health, hunger, daylight and no nearby threats. Cooking uses owned unreserved ingredients and coal/charcoal/planks in an empty nearby furnace. It verifies output before taking it. Interrupted furnace contents are recorded as needing inspection instead of silently claiming ownership or completion.

Surface exploration follows a few safe loaded waypoints, stays within 24 blocks by default (48 maximum), records observed locations and returns to its start. It never tunnels, crosses portals or assumes unloaded blocks are safe. Background priorities are replant repairs, loot storage, food, common stock targets, approved-area stone and bounded scouting. Failures have a two-minute per-skill cooldown. Stock targets are named in `idle-work.js`; they are finite and combine inventory with recently observed approved storage. Shared-project chest allocation and deep progression remain separate unfinished work.

Construction uses the existing approved full-cube blueprint executor. Start its chosen site once in Build Studio; **resume the build** can then resume the saved approved revision in the same Realm/dimension. This is not unrestricted free-form construction or support for every oriented block.

Faster conversation uses low Codex reasoning when enabled and omits unrelated coding-skill instructions. It preserves all validated Minecraft action and model-access restrictions. Architecture keeps normal reasoning; other model providers keep their configured behavior. The matched fixed greeting benchmark measured 7,254ms/20,000 input tokens previously and 4,418ms/10,188 input tokens with the fast profile. Timing varies with the provider. This is not instant or streaming speech.

## Verification

The official, disposable localhost Minecraft 26.3 survival fixture passed 17 checks, including chest withdrawals, saved-place travel, partial wood gathering → temporary request → automatic remaining gathering, approved construction → temporary request → automatic remaining placements, food handoff to a separate client, death/pickup recovery and paused reconnection. No model requests were made. Fixture commands only prepare the isolated test world; companion behavior uses normal survival packets. No destructive Realm experiments were run.

Automated tests cover nested handoffs, cancellation races, pause, crash/SQLite restore, partial resource counts, build descriptor preservation, permissions/revocation, risk checks, rare-stock protection and bounded navigation. Headless browser checks cover actual local API/settings persistence, location save/delete, empty/disconnected/error states and 1440/390px layouts. Browser location observations are explicitly synthetic fixtures; the separate Minecraft test proves actual gameplay.
