import { Users, Wheat } from "lucide-react";
import { useEffect, useState } from "react";
import {
  attempt,
  Badge,
  Empty,
  human,
  ItemIcon,
  Panel,
  ProjectSelect,
  time,
  type Common,
  type Mutate,
} from "./shared";
export default function SharedTasks({ state, mutate, busy }: Common) {
  const [selected, setSelected] = useState("");
  const project =
    state.projects.find((p) => p.id === selected) || state.projects[0];
  const [split, setSplit] = useState(50);
  return (
    <>
      <div className="section-toolbar">
        <ProjectSelect
          projects={state.projects}
          selected={project?.id || ""}
          onChange={setSelected}
        />
        <span className="muted">Gather together, keep the counts honest.</span>
      </div>
      {project ? (
        <Panel
          title={project.name}
          eyebrow="SHARED RESOURCE PLAN"
          action={<Badge>{human(project.status)}</Badge>}
        >
          <div className="split-control">
            <div>
              <h3>Split the gathering</h3>
              <p>Change assignments without changing verified supplies.</p>
            </div>
            <div className="split-slider">
              <span>You {100 - split}%</span>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={split}
                aria-label="Companion gathering percentage"
                onChange={(e) => setSplit(Number(e.target.value))}
              />
              <span>Companion {split}%</span>
              <button
                className="button"
                disabled={busy || !project.materials?.placed?.length}
                onClick={() =>
                  attempt(
                    mutate(`/projects/${project.id}/split`, {
                      aiPercent: split,
                    }),
                  )
                }
              >
                Apply split
              </button>
            </div>
          </div>
          <button className="button" disabled={busy||!project.materials} onClick={()=>attempt(mutate(`/projects/${project.id}/assisted-split`,{}))}>50/50 common materials · difficult materials to me</button>
          <p className="note">The assisted split checks supported skills, not unseen resource availability. You can override any material below. Shared chest stock and your inventory are not automatically counted as gathered contributions.</p>
          {project.assignments?.length ? (
            <div className="assignment-grid">
              {project.assignments.map((a: any) => (
                <Assignment
                  key={a.material}
                  assignment={a}
                  projectId={project.id}
                  mutate={mutate}
                  busy={busy}
                  active={["ACTIVE", "BUSY"].includes(state.state)}
                />
              ))}
            </div>
          ) : (
            <Empty icon={Users} title="Every great build is a team effort">
              Import a blueprint in Build studio, then apply a split to assign
              each material.
            </Empty>
          )}
        </Panel>
      ) : (
        <Panel>
          <Empty icon={Users} title="Start with a shared project">
            Create a build project in Build studio to divide the gathering
            between you and your companion.
          </Empty>
        </Panel>
      )}
      <div className="kanban">
        {["queued", "running", "completed", "blocked"].map((status) => {
          const tasks = state.tasks.filter(
            (t) =>
              t.status === status ||
              (status === "running" && t.status === "active") ||
              (status === "blocked" &&
                ["failed", "interrupted"].includes(t.status)),
          );
          return (
            <Panel
              key={status}
              title={human(status)}
              action={<span className="count-chip">{tasks.length}</span>}
            >
              {tasks.length ? (
                tasks.map((t: any, i) => (
                  <div className="kanban-card" key={t.id || i}>
                    <strong>{human(t.tool || t.name)}</strong>
                    <p>
                      {t.error || t.summary || t.message || "Companion task"}
                    </p>
                    <small>{t.at ? time(t.at) : t.id?.slice(0, 8)}</small>
                  </div>
                ))
              ) : (
                <p className="quiet-empty">No {status} tasks.</p>
              )}
            </Panel>
          );
        })}
      </div>
    </>
  );
}

function Assignment({
  assignment: a,
  projectId,
  mutate,
  busy,
  active,
}: {
  assignment: any;
  projectId: string;
  mutate: Mutate;
  busy: boolean;
  active: boolean;
}) {
  const [quantity, setQuantity] = useState(a.userProgress || 0);
  const [aiPercent, setAiPercent] = useState(
    Math.round((a.aiRequired / Math.max(1, a.total)) * 100),
  );
  useEffect(
    () => setAiPercent(Math.round((a.aiRequired / Math.max(1, a.total)) * 100)),
    [a.aiRequired, a.total],
  );
  return (
    <div className="assignment-card">
      <div className="assignment-heading">
        <ItemIcon name={a.material} />
        <div>
          <h3>{human(a.material)}</h3>
          <p>{a.total.toLocaleString()} needed in total</p>
        </div>
      </div>
      {a.acquisition?<p className="note"><strong>{a.acquisition.difficulty==='player-recommended'?'Recommended for you':'Companion prerequisites'}:</strong> {a.acquisition.reason}</p>:null}
      <div className="assignment-owner">
        <span>
          You <small>Reported by you</small>
        </span>
        <strong>
          {a.userProgress} / {a.userRequired}
        </strong>
      </div>
      <progress value={a.userProgress} max={Math.max(1, a.userRequired)} />
      <div className="assignment-owner">
        <span>
          Companion{" "}
          <small>
            {a.aiObservedAt
              ? `Inventory · ${time(a.aiObservedAt)}`
              : "Inventory not observed"}
          </small>
        </span>
        <strong>
          {a.aiProgress} / {a.aiRequired}
        </strong>
      </div>
      <progress
        className="companion-progress"
        value={a.aiProgress}
        max={Math.max(1, a.aiRequired)}
      />
      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          attempt(
            mutate(`/projects/${projectId}/progress`, {
              material: a.material,
              owner: "user",
              quantity,
            }),
          );
        }}
      >
        <input
          type="number"
          min="0"
          max="10000000"
          aria-label={`Your collected ${human(a.material)}`}
          value={quantity}
          onChange={(e) => setQuantity(Number(e.target.value))}
        />
        <button className="button" disabled={busy}>
          Update my count
        </button>
      </form>
      <details className="material-split">
        <summary>Change this material’s assignment</summary>
        <label className="field-label">
          Companion share: {aiPercent}%
          <input
            aria-label={`Companion share of ${human(a.material)}`}
            type="range"
            min="0"
            max="100"
            step="5"
            value={aiPercent}
            onChange={(e) => setAiPercent(Number(e.target.value))}
          />
        </label>
        <button
          className="button full"
          disabled={busy}
          onClick={() =>
            attempt(
              mutate(`/projects/${projectId}/assign`, {
                material: a.material,
                aiPercent,
              }),
            )
          }
        >
          Save material assignment
        </button>
      </details>
      {/^(oak|spruce|birch)_log$/.test(a.material) ? (
        <button
          className="button full"
          style={{ marginTop: 12 }}
          disabled={busy || !active || a.aiProgress >= a.aiRequired}
          onClick={() =>
            attempt(
              mutate(`/projects/${projectId}/gather`, { material: a.material }),
            )
          }
        >
          <Wheat size={14} />
          Gather assigned wood (up to 16)
        </button>
      ) : null}
    </div>
  );
}
