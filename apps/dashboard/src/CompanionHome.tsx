import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Bookmark,
  Check,
  Compass,
  Download,
  Gamepad2,
  HeartHandshake,
  MessageCircle,
  Send,
  Sparkles,
  Target,
  Trash2,
} from "lucide-react";
import {
  attempt,
  Badge,
  Empty,
  Panel,
  SettingSelect,
  time,
  type Common,
} from "./shared";

export function CompanionAvatar({ status = "idle" }: { status?: string }) {
  return (
    <div
      className={`ws-companion-avatar ${status.toLowerCase()}`}
      aria-label={`AI companion · ${status}`}
      role="img"
    >
      <span className="companion-callsign" aria-hidden="true">
        P<span>2</span>
      </span>
      <i className="ws-presence-light" />
    </div>
  );
}
const modes = [
  {
    id: "teammate",
    name: "Teammate",
    icon: Target,
    detail: "Focus on assigned work. No background chores.",
  },
  {
    id: "hangout",
    name: "Hangout",
    icon: MessageCircle,
    detail: "Keep explicit tasks; make room for conversation.",
  },
  {
    id: "adventure",
    name: "Adventure",
    icon: Compass,
    detail: "Safe nearby scouting when equipped and free.",
  },
  {
    id: "autonomous",
    name: "Autonomous",
    icon: Gamepad2,
    detail: "Maintain common supplies within your permissions.",
  },
] as const;
export function ModePicker({ state, mutate, busy }: Common) {
  return (
    <div className="ws-mode-picker" aria-label="Ways to play">
      {modes.map(({ id, name, icon: Icon, detail }) => (
        <button
          key={id}
          className={
            state.profile?.modeSelected && state.profile.mode === id
              ? "selected"
              : ""
          }
          aria-pressed={Boolean(
            state.profile?.modeSelected && state.profile.mode === id,
          )}
          disabled={busy}
          onClick={() => attempt(mutate("/companion/mode", { mode: id }))}
        >
          <Icon size={19} />
          <span>
            <strong>{name}</strong>
            <small>{detail}</small>
          </span>
          {state.profile?.modeSelected && state.profile.mode === id ? (
            <Check size={14} />
          ) : null}
        </button>
      ))}
    </div>
  );
}
export function CompanionHome({ state, mutate, busy }: Common) {
  const profile = state.profile;
  const [name, setName] = useState(profile?.name || "Player Two"),
    [saved, setSaved] = useState("");
  useEffect(() => setName(profile?.name || "Player Two"), [profile?.name]);
  const patch = (value: Record<string, unknown>) =>
    attempt(
      mutate("/companion/profile", value).then(() =>
        setSaved("Preferences saved."),
      ),
    );
  return (
    <>
      <div className="ws-profile-hero">
        <CompanionAvatar status={state.workspace?.activity.state} />
        <div>
          <span className="eyebrow">YOUR AI GAMING COMPANION</span>
          <h2>{profile?.name || "Player Two"}</h2>
          <p>A teammate for the work. Company for the rest.</p>
          <Badge>
            {state.connection.status === "connected"
              ? "Playing Minecraft Survival"
              : "Minecraft Survival · offline"}
          </Badge>
        </div>
      </div>
      <ModePicker state={state} mutate={mutate} busy={busy} />
      <div className="ws-profile-grid">
        <Panel title="A personality that fits" eyebrow="YOUR PREFERENCES">
          <form
            className="inline-form"
            onSubmit={(event) => {
              event.preventDefault();
              patch({ name });
            }}
          >
            <label className="field-label">
              Companion name
              <input
                aria-label="Companion name"
                value={name}
                maxLength={32}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <button className="button" disabled={busy || !name.trim()}>
              Save name
            </button>
          </form>
          <SettingSelect
            label="Conversation style"
            value={profile?.style || "relaxed"}
            options={{
              relaxed: "Relaxed & conversational",
              "dry-humor": "Dry humor · light, occasional jokes",
              encouraging: "Warm & encouraging",
            }}
            onChange={(style) => patch({ style })}
          />
          <SettingSelect
            label="Talkativeness"
            value={profile?.talkativeness || "balanced"}
            options={{
              focused: "Focused · concise teamwork",
              balanced: "Balanced · a little conversation",
              chatty: "Chatty · room for banter",
            }}
            onChange={(talkativeness) => patch({ talkativeness })}
          />
          <label className="ws-toggle">
            <span>
              <strong>Start useful conversations</strong>
              <small>
                Optional milestone remarks, with a cooldown. Danger and blockers
                still get through.
              </small>
            </span>
            <input
              type="checkbox"
              checked={profile?.proactive || false}
              disabled={busy}
              onChange={(event) => patch({ proactive: event.target.checked })}
            />
          </label>
          <p className="note">
            Your companion is AI. It can have a consistent voice and sense of
            humor without pretending to have human feelings or an exclusive
            friendship.
          </p>
          {saved ? (
            <p className="success-text" role="status">
              {saved}
            </p>
          ) : null}
        </Panel>
        <Panel title="Memories, on your terms" eyebrow="TRANSPARENT & OPTIONAL">
          <label className="ws-toggle">
            <span>
              <strong>Use saved memories</strong>
              <small>
                Include your saved notes and moments in conversation context.
              </small>
            </span>
            <input
              type="checkbox"
              aria-label="Use saved memories"
              checked={profile?.memoryEnabled ?? true}
              disabled={busy}
              onChange={(event) =>
                patch({ memoryEnabled: event.target.checked })
              }
            />
          </label>
          <p>
            Save a conversation, a completed task, or a finished project. Your
            companion can refer back to that record.
          </p>
          <p className="note">
            Turning this off preserves your records but excludes them from
            conversation prompts. Current conversation, Home coordinates, safety
            permissions and active work remain available for gameplay.
          </p>
          <div className="ws-actions">
            <a
              className="button"
              href="/api/companion/export"
              download="player-two-companion.json"
            >
              <Download size={14} />
              Export profile & moments
            </a>
          </div>
          <div className="ws-memory-explainer">
            <Bookmark size={20} />
            <p>
              No invented adventures. No friendship scores. No automatic
              recording of your microphone.
            </p>
          </div>
        </Panel>
      </div>
      <Panel
        title="The good bits"
        eyebrow="SAVED ADVENTURES"
        action={
          <span className="count-chip">{state.moments?.length || 0}</span>
        }
      >
        {state.moments?.length ? (
          <div className="ws-moments">
            {state.moments.map((moment) => (
              <article key={moment.id}>
                <Bookmark size={18} />
                <div>
                  <h3>{moment.title}</h3>
                  <p>{moment.text}</p>
                  <small>
                    {moment.provenance === "saved-conversation-quote"
                      ? "Saved quote · not verification of an event"
                      : "Recorded completion"}{" "}
                    · {new Date(moment.savedAt).toLocaleDateString()}
                  </small>
                </div>
                <button
                  className="icon-button"
                  aria-label={`Delete moment ${moment.title}`}
                  disabled={busy}
                  onClick={() =>
                    attempt(
                      mutate("/companion/moments/delete", { id: moment.id }),
                    )
                  }
                >
                  <Trash2 size={16} />
                </button>
              </article>
            ))}
          </div>
        ) : (
          <Empty icon={Bookmark} title="Good stories start somewhere">
            Save a message from Communication or completed work below. Nothing
            is invented to fill this space.
          </Empty>
        )}
        <details className="ws-save-adventure">
          <summary>Save completed work as a moment</summary>
          <div className="ws-completed-work">
            {state.tasks
              .filter((task) => task.status === "completed")
              .slice(-10)
              .reverse()
              .map((task) => (
                <div key={task.id}>
                  <span>{task.name || task.tool}</span>
                  <button
                    className="text-button"
                    disabled={busy || profile?.memoryEnabled === false}
                    onClick={() =>
                      attempt(
                        mutate("/companion/moments", {
                          sourceType: "task",
                          sourceId: task.id,
                        }),
                      )
                    }
                  >
                    <Bookmark size={14} />
                    Save moment
                  </button>
                </div>
              ))}
            {!state.tasks.some((task) => task.status === "completed") ? (
              <p className="quiet-empty">
                No completed tasks have been recorded yet.
              </p>
            ) : null}
          </div>
        </details>
      </Panel>
    </>
  );
}
export function ConversationPane({
  state,
  mutate,
  busy,
  compact = false,
}: Common & { compact?: boolean }) {
  const [text, setText] = useState(""),
    [sending, setSending] = useState(false),
    [saved, setSaved] = useState("");
  const messages = useRef<HTMLDivElement>(null);
  const active = ["ACTIVE", "BUSY"].includes(state.state);
  useEffect(() => {
    if (messages.current)
      messages.current.scrollTop = state.conversation.length
        ? messages.current.scrollHeight
        : 0;
  }, [state.conversation.length]);
  async function send() {
    if (!active || busy || !text.trim() || sending) return;
    const outgoing = text;
    setSending(true);
    try {
      await mutate("/conversation", { text: outgoing });
      setText((current) => (current === outgoing ? "" : current));
    } catch {
    } finally {
      setSending(false);
    }
  }
  return (
    <section className={`ws-chat ${compact ? "compact" : ""}`}>
      <header>
        <CompanionAvatar status={state.workspace?.activity.state} />
        <div>
          <h2>
            {state.profile?.name || state.auth.username || "Your companion"}
          </h2>
          <small>
            {state.state === "PAUSED"
              ? "Paused · resume to talk"
              : state.planning
                ? "Here to chat offline"
                : state.connection.status === "connected"
                  ? "In your world, in the conversation"
                  : "A conversation away"}
          </small>
        </div>
        <Badge>{state.voice.available ? "Voice ready" : "Text chat"}</Badge>
      </header>
      {!active ? (
        <div className="ws-chat-offline">
          <p>
            {state.state === "PAUSED"
              ? "Resume when you’re ready. Saved work stays here."
              : "You can talk before joining a game."}
          </p>
          <button
            className="button"
            disabled={busy}
            onClick={() =>
              attempt(
                mutate("/control", {
                  command: state.state === "PAUSED" ? "resume" : "plan",
                }),
              )
            }
          >
            {state.state === "PAUSED"
              ? "Resume conversation"
              : "Start planning offline"}
          </button>
        </div>
      ) : null}
      <div
        className="ws-chat-messages"
        ref={messages}
        aria-label="Conversation history"
      >
        {state.conversation.length ? (
          state.conversation.map((message) => (
            <article
              className={`ws-chat-message ${message.role}`}
              key={message.id}
            >
              <div>
                <strong>
                  {message.role === "user"
                    ? "You"
                    : state.profile?.name || "Companion"}
                </strong>
                <time>{time(message.at)}</time>
              </div>
              <p>{message.text}</p>
              <button
                className="text-button ws-save-message"
                aria-label={`Remember this message from ${time(message.at)}`}
                disabled={busy || state.profile?.memoryEnabled === false}
                onClick={() =>
                  attempt(
                    mutate("/companion/moments", {
                      sourceType: "conversation",
                      sourceId: message.id,
                    }).then(() => setSaved("Moment saved to My companion.")),
                  )
                }
              >
                <Bookmark size={12} />
                Remember this
              </button>
            </article>
          ))
        ) : (
          <div className="ws-chat-welcome">
            <HeartHandshake size={33} />
            <h3>Hey. What’s the plan?</h3>
            <p>
              Share a goal, ask for a hand, or talk about something entirely
              different.
            </p>
            <div>
              {[
                "What are you doing?",
                "What do we still need?",
                "Let’s just hang out",
              ].map((value) => (
                <button
                  className="button"
                  key={value}
                  onClick={() => setText(value)}
                >
                  {value}
                  <ArrowRight size={12} />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      {saved ? (
        <p role="status" className="note">
          {saved}
        </p>
      ) : null}
      <form
        className="ws-chat-composer"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <textarea
          rows={2}
          aria-label="Message your companion"
          placeholder={
            active ? "Got a thought?" : "Start or resume a session to talk."
          }
          value={text}
          maxLength={6000}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <button
          className="button primary icon-button"
          aria-label="Send message"
          disabled={!active || !text.trim() || sending || busy}
        >
          <Send size={17} />
        </button>
      </form>
      <div className="ws-chat-footer">
        <span>
          {sending
            ? "Waiting for your companion…"
            : "Enter to send · Shift + Enter for a new line"}
        </span>
        <button
          className="text-button danger-text"
          onClick={() => attempt(mutate("/control", { command: "cancel" }))}
        >
          Stop task
        </button>
      </div>
    </section>
  );
}
