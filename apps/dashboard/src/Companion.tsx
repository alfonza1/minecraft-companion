import {
  Check,
  MapPin,
  MessageCircle,
  Plus,
  Send,
  Settings2,
  Square,
  Trash2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { CompanionState } from "../../../packages/shared-types";
import {
  attempt,
  Badge,
  Empty,
  Panel,
  SettingSelect,
  time,
  type Common,
  type Mutate,
} from "./shared";
export default function Companion({ state, mutate, busy }: Common) {
  const [text, setText] = useState("");
  const [label, setLabel] = useState("");
  const [value, setValue] = useState("");
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container = end.current?.parentElement;
    if (container) container.scrollTop = container.scrollHeight;
  }, [state.conversation.length]);
  return (
    <div className="conversation-layout">
      <Panel
        className="conversation-panel"
        title="Around the campfire"
        eyebrow="CONVERSATION"
        action={
          <Badge
            tone={
              state.state === "ACTIVE" || state.state === "BUSY"
                ? "green"
                : "muted"
            }
          >
            {state.state === "PAUSED" ? "Paused" : "Your teammate"}
          </Badge>
        }
      >
        <div className="messages">
          {state.conversation.length ? (
            state.conversation.map((m) => (
              <div key={m.id} className={`message ${m.role}`}>
                <div className="message-heading">
                  <span>
                    {m.role === "user"
                      ? "You"
                      : state.auth.username || "Companion"}
                  </span>
                  <time>{time(m.at)}</time>
                </div>
                <p>{m.text}</p>
              </div>
            ))
          ) : (
            <Empty icon={MessageCircle} title="What’s the plan?">
              Ask for a hand with the gathering, talk about the build, or just
              talk. Your companion can keep safe tasks going while you chat.
            </Empty>
          )}
          <div ref={end} />
        </div>
        <form
          className="chat-composer"
          onSubmit={(e) => {
            e.preventDefault();
            if (!text.trim()) return;
            const message = text;
            setText("");
            attempt(mutate("/conversation", { text: message }));
          }}
        >
          <textarea
            rows={2}
            aria-label="Message your companion"
            placeholder={
              state.state === "PAUSED"
                ? "Resume your companion to talk."
                : "“Grab some wood while I find a good spot?”"
            }
            maxLength={6000}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
          />
          <button
            className="button primary icon-button"
            aria-label="Send message"
            disabled={
              busy || !text.trim() || !["ACTIVE", "BUSY"].includes(state.state)
            }
          >
            <Send size={18} />
          </button>
        </form>
        <div className="composer-footer">
          <span>Enter to send · Shift + Enter for a new line</span>
          <button
            className="text-button danger-text"
            onClick={() => attempt(mutate("/control", { command: "cancel" }))}
          >
            <Square size={11} />
            Stop current task
          </button>
        </div>
      </Panel>
      <div>
        <Panel
          title="How we play"
          action={<Settings2 size={17} className="muted" />}
        >
          <SettingSelect
            label="Autonomy"
            value={state.settings.autonomy}
            options={{
              instructions: "Follow my instructions",
              helpful: "Helpful teammate",
              independent: "Independent teammate",
            }}
            onChange={(autonomy) => attempt(mutate("/settings", { autonomy }))}
          />
          <SettingSelect
            label="Combat behavior"
            value={state.settings.combat}
            options={{
              retreat: "Retreat from danger",
              defend: "Defend when necessary",
            }}
            onChange={(combat) => attempt(mutate("/settings", { combat }))}
          />
          <SettingSelect
            label="Chatter & alerts"
            value={state.settings.alertFrequency}
            options={{ quiet: "Keep it quiet", normal: "Useful updates" }}
            onChange={(alertFrequency) =>
              attempt(mutate("/settings", { alertFrequency }))
            }
          />
          <SettingSelect label="Travel pace" value={state.settings.movementSpeed || 'brisk'}
            options={{ brisk: 'Brisk · sprint when safe and fed', normal: 'Normal walking' }}
            onChange={(movementSpeed) => attempt(mutate('/settings', { movementSpeed }))} />
          <label className="field-label">
            Follow distance{" "}
            <span className="range-label">
              {state.settings.followDistance} blocks
            </span>
            <input
              type="range"
              min="2"
              max="8"
              value={state.settings.followDistance}
              onChange={(e) =>
                attempt(
                  mutate("/settings", {
                    followDistance: Number(e.target.value),
                  }),
                )
              }
            />
          </label>
          <p className="note">
            Autonomy preferences are saved for planning. Continuous independent
            strategy and advanced progression are not yet implemented. Rare
            resources and destructive work need your approval.
          </p>
          <MiningPermission state={state} mutate={mutate} />
        </Panel>
        <Panel
          title="Things to remember"
          action={<MapPin size={17} className="muted" />}
        >
          {state.memories.length ? (
            <div className="memory-list">
              {state.memories.map((m) => (
                <div key={m.id}>
                  <div>
                    <strong>{m.label}</strong>
                    <p>{m.value}</p>
                  </div>
                  <button
                    className="icon-button"
                    aria-label={`Delete memory ${m.label}`}
                    onClick={() =>
                      attempt(mutate("/memories/delete", { id: m.id }))
                    }
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="quiet-empty">
              Save your base coordinates, preferred styles, or anything your
              teammate should keep in mind.
            </p>
          )}
          <form
            className="memory-form"
            onSubmit={(e) => {
              e.preventDefault();
              attempt(
                mutate("/memories", { label, value }).then(() => {
                  setLabel("");
                  setValue("");
                }),
              );
            }}
          >
            <input
              aria-label="Memory label"
              placeholder="e.g. Our base"
              maxLength={100}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
            <textarea
              aria-label="Memory details"
              placeholder="Coordinates, preferences, or a note…"
              maxLength={2000}
              rows={2}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
            <button
              className="button full"
              disabled={busy || !label.trim() || !value.trim()}
            >
              <Plus size={14} />
              Save memory
            </button>
          </form>
        </Panel>
      </div>
    </div>
  );
}

function MiningPermission({
  state,
  mutate,
}: {
  state: CompanionState;
  mutate: Mutate;
}) {
  const saved = state.settings.miningZone;
  const [zone, setZone] = useState(saved || { x: 0, y: 64, z: 0, radius: 8 });
  return (
    <div className="data-management">
      <h3>Approved mining area</h3>
      <p className="note">
        This allows breaking blocks inside the area. Choose expendable natural
        terrain away from buildings. Your companion cannot approve an area for
        itself.
      </p>
      {saved ? (
        <Badge tone="gold">
          Approved: {saved.x}, {saved.y}, {saved.z} · Radius {saved.radius}
        </Badge>
      ) : (
        <Badge>Mining not approved</Badge>
      )}
      <div className="coordinate-inputs">
        {(["x", "y", "z", "radius"] as const).map((axis) => (
          <label key={axis}>
            {axis === "radius" ? "Radius" : axis.toUpperCase()}
            <input
              type="number"
              min={axis === "radius" ? 1 : undefined}
              max={axis === "radius" ? 32 : undefined}
              value={zone[axis]}
              aria-label={`Mining area ${axis}`}
              onChange={(e) =>
                setZone({ ...zone, [axis]: Number(e.target.value) })
              }
            />
          </label>
        ))}
      </div>
      <button
        className="text-button"
        disabled={!state.world}
        onClick={() => {
          const pos = state.world!.position;
          setZone({
            ...zone,
            x: Math.floor(pos.x),
            y: Math.floor(pos.y),
            z: Math.floor(pos.z),
          });
        }}
      >
        <MapPin size={13} />
        Use companion’s current position
      </button>
      <div className="inline-form" style={{ marginTop: 16 }}>
        <button
          className="button"
          onClick={() => attempt(mutate("/permissions/mining", { zone }))}
        >
          <Check size={14} />
          Approve this area
        </button>
        {saved ? (
          <button
            className="button"
            onClick={() =>
              attempt(mutate("/permissions/mining", { zone: null }))
            }
          >
            Revoke
          </button>
        ) : null}
      </div>
    </div>
  );
}
