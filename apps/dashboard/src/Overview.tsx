import {
  ArrowRight,
  AudioLines,
  CheckCheck,
  Construction,
  Heart,
  Layers3,
  MapPin,
  Mountain,
  Shield,
  Wheat,
  MessageCircle,
  Send,
} from "lucide-react";
import { useState } from 'react';
import { Badge, Empty, human, Panel, time, type Common } from "./shared";
export default function Overview({
  state,
  mutate,
  busy,
  navigate,
}: Common & { navigate: (page: string) => void }) {
  const world = state.world;
  const realm = state.realms.find((r) => r.id === state.settings.realmId);
  const [request, setRequest] = useState('');
  const active = ['ACTIVE', 'BUSY'].includes(state.state);
  const activeProject =
    state.projects.find((p) => p.status === "building") || state.projects[0];
  return (
    <>
      <form className="quick-request" onSubmit={async event => { event.preventDefault(); if (!request.trim() || !active || busy) return; try { await mutate('/conversation', { text: request.trim() }); setRequest(''); } catch { /* The shared error banner preserves the request for retry. */ } }}>
        <MessageCircle size={20} />
        <div><label htmlFor="overview-request">What are we doing next?</label><input id="overview-request" value={request} onChange={event => setRequest(event.target.value)} placeholder={active ? 'Follow me, grab some wood, or give me the oak logs…' : 'Start your companion to send a request'} disabled={!active || busy} /></div>
        <button className="button primary" disabled={!active || busy || !request.trim()} aria-label="Send companion request"><Send size={15} /> Send</button>
        <button className="text-button" type="button" onClick={() => navigate('companion')}>Conversation <ArrowRight size={14} /></button>
      </form>
      <div className="overview-grid">
        <Panel
          className="companion-card"
          eyebrow="YOUR TEAMMATE"
          title={state.connection.username || state.auth.username || "Ready when you are"}
          action={
            <Badge tone={world ? "green" : "muted"}>
              {world ? "In your world" : "Offline"}
            </Badge>
          }
        >
          <div className="companion-scene">
            <div className="voxel-character">
              <div className="voxel-head">
                <i />
                <i />
                <b />
              </div>
              <div className="voxel-body" />
              <div className="voxel-arm left" />
              <div className="voxel-arm right" />
              <div className="voxel-leg left" />
              <div className="voxel-leg right" />
            </div>
            <div className="scene-ground" />
            <span className="scene-label">
              {world ? human(world.dimension) : "WAITING FOR AN ADVENTURE"}
            </span>
          </div>
          <div className="companion-detail">
            <span className="eyebrow">
              {world ? "CURRENT ACTIVITY" : "LET’S GET YOU CONNECTED"}
            </span>
            <h3>
              {state.currentTask
                ? human(
                    state.currentTask.tool ||
                      state.currentTask.name ||
                      state.currentTask.status,
                  )
                : world
                  ? "Taking it all in."
                  : "One account. A whole new teammate."}
            </h3>
            <p>
              {state.currentTask?.error ||
                state.connection.error ||
                (world
                  ? "Give your companion a job or just start a conversation."
                  : "Connect a separate licensed Java account, pick your Realm, and head out together.")}
            </p>
            {state.auth.status !== "connected" ? (
              <button
                className="text-button"
                onClick={() => navigate("setup")}
              >
                Set up your companion <ArrowRight size={15} />
              </button>
            ) : !state.settings.realmId ? (
              <button
                className="text-button"
                onClick={() => navigate("setup")}
              >
                Choose a Realm <ArrowRight size={15} />
              </button>
            ) : null}
          </div>
        </Panel>
        <div className="overview-right">
          <div className="vitals-grid">
            <Vital
              icon={Heart}
              title="Health"
              value={world ? `${world.health} / 20` : "—"}
              tone="coral"
              percent={world ? world.health / 20 : undefined}
            />
            <Vital
              icon={Wheat}
              title="Hunger"
              value={world ? `${world.food} / 20` : "—"}
              tone="gold"
              percent={world ? world.food / 20 : undefined}
            />
            <Vital
              icon={Shield}
              title="Equipment"
              value={
                world
                  ? `${Object.values(world.equipment).filter(Boolean).length} equipped`
                  : "—"
              }
              tone="mint"
            />
            <Vital
              icon={MapPin}
              title="Coordinates"
              value={
                world
                  ? `${Math.floor(world.position.x)}, ${Math.floor(world.position.y)}, ${Math.floor(world.position.z)}`
                  : "—"
              }
              tone="blue"
            />
          </div>
          <Panel
            title="The world we're in"
            action={<Mountain size={18} className="muted" />}
          >
            <div className="realm-row">
              <div className="realm-icon">
                <Mountain size={26} />
              </div>
              <div>
                <h3>{realm?.name || "No Realm selected"}</h3>
                <p>
                  {realm
                    ? `Owned by ${realm.owner}`
                    : "Your invited Realms appear after sign-in."}
                </p>
              </div>
            </div>
            <div className="data-row">
              <span>Connection</span>
              <strong>{human(state.connection.status)}</strong>
            </div>
            <div className="data-row">
              <span>World observations</span>
              <strong>
                {world
                  ? `Updated ${time(world.observedAt)}`
                  : "Waiting for connection"}
              </strong>
            </div>
            <button
              className="text-button"
              onClick={() => navigate("setup")}
            >
              {realm ? "Manage connection" : "Connect your account"}{" "}
              <ArrowRight size={14} />
            </button>
          </Panel>
        </div>
      </div>
      <div className="three-columns">
        <Panel
          title="On the workbench"
          action={
            <button className="text-button" onClick={() => navigate("studio")}>
              Build studio <ArrowRight size={14} />
            </button>
          }
        >
          {activeProject ? (
            <>
              <div className="project-symbol">
                <Construction size={25} />
              </div>
              <h3>{activeProject.name}</h3>
              <p>{human(activeProject.status)}</p>
              <div className="data-row">
                <span>Blueprint</span>
                <strong>
                  {activeProject.blueprint
                    ? `${activeProject.blueprint.blocks.length.toLocaleString()} placements`
                    : "Awaiting design"}
                </strong>
              </div>
              <div className="data-row">
                <span>Approval</span>
                <strong>
                  {activeProject.approvedRevision === activeProject.revision
                    ? "Approved"
                    : "Review needed"}
                </strong>
              </div>
            </>
          ) : (
            <Empty icon={Construction} title="Room for something great">
              Import a schematic or add references to plan your next build.
            </Empty>
          )}
        </Panel>
        <Panel title="Up next" action={<Layers3 size={17} className="muted" />}>
          {state.tasks.length ? (
            <div className="task-list">
              {state.tasks
                .slice(-4)
                .reverse()
                .map((task, i) => (
                  <div key={task.id || i} className="compact-task">
                    <span className="task-bullet" />
                    <div>
                      <strong>{human(task.tool || task.name)}</strong>
                      <small>{human(task.status)}</small>
                    </div>
                  </div>
                ))}
            </div>
          ) : (
            <Empty icon={CheckCheck} title="A clear to-do list">
              Ask your companion to follow you, gather supplies, or help with a
              project.
            </Empty>
          )}
        </Panel>
        <Panel
          title="Around the campfire"
          action={<AudioLines size={18} className="muted" />}
        >
          <div className="data-row">
            <span>Voice service</span>
            <Badge tone={state.voice.available ? "green" : "muted"}>
              {human(state.voice.status)}
            </Badge>
          </div>
          <div className="data-row">
            <span>Model requests</span>
            <strong>{state.usage.requests.toLocaleString()}</strong>
          </div>
          <div className="data-row">
            <span>Tokens used</span>
            <strong>
              {(
                state.usage.inputTokens + state.usage.outputTokens
              ).toLocaleString()}
            </strong>
          </div>
          <p className="note">
            Thinking happens when it helps. Idle and paused companions make no
            model requests.
          </p>
          <button className="text-button" onClick={() => navigate("companion")}>
            Open conversation <ArrowRight size={14} />
          </button>
        </Panel>
      </div>
      <Panel
        title="Recent activity"
        action={<span className="eyebrow">LIVE FROM YOUR COMPANION</span>}
      >
        {state.logs.length ? (
          <div className="activity-list">
            {state.logs
              .slice(-5)
              .reverse()
              .map((log, i) => (
                <div className="activity-line" key={`${log.at}-${i}`}>
                  <span className={`log-dot ${log.level}`} />
                  <p>{log.message}</p>
                  <time>{time(log.at)}</time>
                </div>
              ))}
          </div>
        ) : (
          <p className="quiet-empty">
            Your companion’s connection and activity updates will appear here.
          </p>
        )}
      </Panel>
    </>
  );
}

function Vital({
  icon: Icon,
  title,
  value,
  tone,
  percent,
}: {
  icon: typeof Heart;
  title: string;
  value: string;
  tone: string;
  percent?: number;
}) {
  return (
    <div className={`vital ${tone}`}>
      <div>
        <Icon size={17} />
        <span>{title}</span>
      </div>
      <strong>{value}</strong>
      {percent !== undefined ? (
        <div className="vital-track">
          <i
            style={{ width: `${Math.min(100, Math.max(0, percent * 100))}%` }}
          />
        </div>
      ) : (
        <div className="vital-track empty-track" />
      )}
    </div>
  );
}
