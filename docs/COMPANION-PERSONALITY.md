# A gaming companion, on your terms

Waypoint is an AI companion to play and talk with. Its behavior aims for relaxed,
consistent conversation, occasional humor and honest disagreement. It must not
claim human consciousness, exclusive friendship or feelings, discourage human
relationships, invent shared adventures or reward dependency with relationship
scores. Personality never overrides gameplay permissions or action validation.

## Profile and communication

My companion lets you choose a name, conversation style and talkativeness. The
profile is stored locally and supplied to the same model context that contains
current world and task facts. It does not change your selected model or voice.

| Setting | Implemented behavior |
| --- | --- |
| Relaxed | Natural contractions and concise conversational replies |
| Dry humor | Light, occasional humor in the model's response style |
| Encouraging | Warm conversation without forced enthusiasm or agreement |
| Focused | Concise task-oriented responses; suppresses optional milestone chatter |
| Balanced | Short natural replies |
| Chatty | Room for invited banter; not constant narration |
| Start useful conversations | Opt-in milestone remarks and bounded idle suggestions |

Styles are prompt instructions, not a guarantee about every model response. They
are neither scripted biographies nor claims of a hidden emotional state. Try the
same conversation with your chosen model and adjust the settings to your taste.

Proactive conversation defaults off. Current milestone notices use recorded task
completion, a three-minute cooldown and no extra model polling. Chatty mode may
offer help when idle. Existing danger and blocker notices remain governed by their
own alert controls; turning off small talk must not suppress important safety
information. There is no general spontaneous-conversation engine.

## Real interaction modes

Modes change deterministic background behavior. Existing users retain their prior
autonomy/background settings until they explicitly select a mode.

| Mode | What changes |
| --- | --- |
| Teammate | Stops background gathering/scouting; explicit assigned work continues. |
| Hangout | Stops background chores and keeps room for conversation; explicit work is preserved. |
| Adventure | Enables bounded idle surface scouting and return after existing food, equipment, health, storage and permission prerequisites. |
| Autonomous | Enables existing approved common-supply routines when idle. Explicit tasks take priority. |

Adventure is not unrestricted exploration. Autonomous is not an always-running
LLM strategy loop. Selecting either can enable helpful autonomy and background
work, but never grants mining permissions, blueprint approval or access to rare
shared resources. Switching to Hangout or Teammate stops an owned background job;
it does not cancel your explicit mission.

You can use the mode controls or anchored phrases such as `switch to hangout mode`,
`let's explore together` or `focus on the task`. These are handled deterministically;
vague unrelated conversation is not interpreted as permission to roam.

## Memories with evidence

Saved moments reference an **existing** conversation message, completed task or
completed project. Their source type, source ID, provenance, occurrence time when
known and save time are retained. Saving the same source twice returns its existing
moment. Unfinished work cannot be saved as a completed adventure.

Conversation moments are explicitly quotes. If someone says “we built a castle,”
the saved quote proves only that they said it, not that the castle was built.
Recorded task/project completion is a different provenance. The model is instructed
to recall only retained sources or current context and never fill empty history
with imaginary victories, failures or jokes.

You can inspect and delete individual moments, export your profile and moments,
or disable **Use saved memories**. Disabling memory:

- Keeps stored records available for inspection and deletion.
- Excludes saved notes and adventure moments from conversation prompts.
- Blocks saving additional adventure moments until re-enabled.
- Cancels pending inference and speech using saved context. Deleting saved context
  also cancels an in-flight reply; already-delivered provider input cannot be recalled.
- Does not erase the current conversation or operational records such as Home,
  approved chests, safety permissions, task checkpoints and active project plans.

The API also provides a clear-all moments operation. The profile has a 200-moment
limit; current conversation context includes at most the six latest moments.
This is bounded structured memory, not automatic whole-history recall or a vector
database. No automatic microphone recording or fabricated adventure journal is
introduced. Changing games does not currently transfer memories or abilities to a
second playable game, because no second playable game exists.

## Source and extension points

- `services/companion-personality/index.js`: profile schema, modes, saved moments,
  source validation, prompt policy and bounded milestone notices.
- `services/agent-orchestrator/index.js`: real context selection and direct mode commands.
- `services/skill-executor/idle-work.js`: actual mode-dependent background decisions.
- `apps/dashboard/src/CompanionHome.tsx`: profile, mode, history and conversation controls.

Contributions should test that memory-off really removes retained context, mode
changes preserve explicit work, stale/deleted sources cannot create fake moments,
and optional chatter cannot cause a model polling loop. Do not test style quality
by asserting that every model must produce a particular catchphrase.
