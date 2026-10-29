import { MODEL_PROVIDERS } from '../../../packages/shared-types/providers';
import YouTubeOptions from './YouTubeOptions';
import SelectedReference from './SelectedReference';
import SourceAnalysis from './SourceAnalysis';
import {
  Box,
  Check,
  Construction,
  LoaderCircle,
  Plus,
  ShieldAlert,
  Upload,
  X,
} from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { Project } from "../../../packages/shared-types";
import { api } from "./api";
import {
  attempt,
  Badge,
  Empty,
  human,
  ItemIcon,
  Panel,
  ProjectSelect,
  type Common,
} from "./shared";
const BuildPreview = lazy(() => import("./BuildPreview"));
const MAX_REFERENCE_BYTES = 24 * 1024 * 1024;
const MAX_BLUEPRINT_BYTES = 12 * 1024 * 1024;
export default function Studio({ state, mutate, busy }: Common) {
  const [selected, setSelected] = useState("");
  const [name, setName] = useState("");
  const [source, setSource] = useState("");
  const [localError, setLocalError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [origin, setOrigin] = useState({ x: 0, y: 64, z: 0 });
  const file = useRef<HTMLInputElement>(null);
  const project =
    state.projects.find((p) => p.id === selected) || state.projects[0];
  const previewBlueprint = useMemo(
    () => project?.blueprint,
    [project?.id, project?.revision],
  );
  const [sourceTab, setSourceTab] = useState("reference");
  const [blueprintVersion, setBlueprintVersion] = useState(
    state.connection.version || "",
  );
  useEffect(() => {
    if (!blueprintVersion)
      void api("/health")
        .then((health) =>
          setBlueprintVersion(health.latestSupportedVersion || ""),
        )
        .catch(() => {});
  }, []);
  useEffect(() => {
    if (project && selected !== project.id) setSelected(project.id);
  }, [project?.id]);
  async function create() {
    if (!name.trim()) return;
    const result = await mutate("/projects", {
      name: name.trim(),
      version: blueprintVersion,
    });
    setSelected(result.id || result.project?.id || "");
    setName("");
  }
  async function upload(uploadFile: File) {
    if (!project) return;
    const maximum = uploadFile.name.endsWith(".json")
      ? MAX_BLUEPRINT_BYTES
      : MAX_REFERENCE_BYTES;
    if (uploadFile.size > maximum) {
      setLocalError(
        `This file is too large. Maximum ${maximum / (1024 * 1024)} MB.`,
      );
      return;
    }
    setUploading(true);
    setLocalError("");
    try {
      if (uploadFile.name.endsWith(".json")) {
        const parsed = JSON.parse(await uploadFile.text());
        await mutate(`/projects/${project.id}/blueprint`, {
          blueprint: parsed.blueprint || parsed,
        });
      } else {
        const form = new FormData();
        form.append("file", uploadFile);
        const schematic = /\.(schem|schematic|litematic)$/i.test(
          uploadFile.name,
        );
        const response = await fetch(
          `/api/projects/${project.id}/${schematic ? "schematic" : "references"}`,
          { method: "POST", body: form },
        );
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Upload failed");
        await mutate("/settings", {});
      }
    } catch (e) {
      setLocalError((e as Error).message);
    } finally {
      setUploading(false);
      if (file.current) file.current.value = "";
    }
  }
  return (
    <>
      <div className="section-toolbar">
        <ProjectSelect
          projects={state.projects}
          selected={project?.id || ""}
          onChange={setSelected}
        />
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            attempt(create());
          }}
        >
          <input
            aria-label="New project name"
            placeholder="Name your next build"
            value={name}
            maxLength={120}
            onChange={(e) => setName(e.target.value)}
          />
          <button
            className="button"
            disabled={busy || !name.trim() || !blueprintVersion}
          >
            <Plus size={15} />
            New project
          </button>
        </form>
      </div>
      {localError ? (
        <div className="error-banner" role="alert">
          {localError}
          <button
            aria-label="Dismiss upload error"
            onClick={() => setLocalError("")}
          >
            <X size={16} />
          </button>
        </div>
      ) : null}
      <YouTubeOptions state={state} mutate={mutate} busy={busy} projectId={project?.id} version={blueprintVersion} onChoose={setSelected}/>
      {!project ? (
        <Panel>
          <Empty icon={Construction} title="Something worth building together">
            Create a project above. Bring a complete schematic for exact counts,
            or collect references while you work out the design.
          </Empty>
        </Panel>
      ) : (
        <>
          <div className="studio-grid">
            <Panel
              className="blueprint-panel"
              title={project.name}
              eyebrow="THE BUILD WORKBENCH"
              action={
                <Badge
                  tone={
                    project.approvedRevision === project.revision
                      ? "green"
                      : "gold"
                  }
                >
                  {project.approvedRevision === project.revision
                    ? "Approved blueprint"
                    : "Design in progress"}
                </Badge>
              }
            >
              {project.blueprint ? (
                <Suspense
                  fallback={
                    <div className="preview-loading">
                      <LoaderCircle size={22} />
                      Loading 3D workbench…
                    </div>
                  }
                >
                  <BuildPreview
                    blueprint={previewBlueprint!}
                    checkpoint={project.checkpoint}
                  />
                </Suspense>
              ) : (
                <div className="blueprint-empty">
                  <div className="blueprint-grid-art">
                    <Construction size={42} />
                  </div>
                  <h3>Your blueprint belongs here.</h3>
                  <p>
                    Import a schematic or complete blueprint JSON to see your
                    actual design in 3D.
                  </p>
                  <button
                    className="button"
                    onClick={() => file.current?.click()}
                  >
                    <Upload size={15} />
                    Import blueprint
                  </button>
                </div>
              )}
              <div className="blueprint-bottom">
                <span>
                  <Box size={15} />
                  {project.blueprint
                    ? `${project.blueprint.blocks.length.toLocaleString()} block placements`
                    : "No blueprint imported"}
                </span>
                <span>
                  {project.blueprint
                    ? `${human(project.blueprint.provenance)} · Revision ${project.revision}`
                    : "Counts appear after a validated design"}
                </span>
              </div>
            </Panel>
            <Panel title="Source material" eyebrow="START WITH AN IDEA">
              <SourceAnalysis key={project.id} project={project} state={state} mutate={mutate} busy={busy}/>
              {project.selectedReference?<details><summary>Optional: design a different inspired build</summary><SelectedReference key={project.id+project.selectedReference.referenceId} project={project} state={state} mutate={mutate} busy={busy}/></details>:null}
              <div className="segmented full">
                <button
                  className={sourceTab === "reference" ? "selected" : ""}
                  onClick={() => setSourceTab("reference")}
                >
                  Reference
                </button>
                <button
                  className={sourceTab === "blueprint" ? "selected" : ""}
                  onClick={() => setSourceTab("blueprint")}
                >
                  Blueprint
                </button>
              </div>
              <button
                className="upload-target"
                onClick={() => file.current?.click()}
                disabled={uploading}
              >
                <Upload size={26} />
                <strong>
                  {uploading
                    ? "Importing…"
                    : sourceTab === "blueprint"
                      ? "Import your blueprint"
                      : "Add a reference file"}
                </strong>
                <span>
                  {sourceTab === "blueprint"
                    ? "Sponge .schem, .schematic or blueprint .json"
                    : "Images or videos · Stored locally"}
                </span>
              </button>
              <input
                ref={file}
                type="file"
                hidden
                accept={
                  sourceTab === "blueprint"
                    ? ".json,.schem,.schematic,.litematic"
                    : "image/png,image/jpeg,image/webp,video/mp4,video/webm,.json,.schem,.schematic"
                }
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void upload(f);
                }}
              />
              <label className="field-label">
                YouTube URL or design notes
                <textarea
                  placeholder="A tutorial link, architectural details, or a place to start…"
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  rows={3}
                  maxLength={10000}
                />
              </label>
              <button
                className="button full"
                disabled={busy || !source.trim()}
                onClick={() =>
                  attempt(
                    mutate(
                      `/projects/${project.id}/references`,
                      /^https?:\/\//.test(source)
                        ? { type: "youtube", url: source }
                        : { type: "text", text: source },
                    ).then(() => setSource("")),
                  )
                }
              >
                <Plus size={15} />
                Save reference
              </button>
              {project.references?.length ? (
                <div className="reference-list">
                  {project.references.map((r: any, i: number) => (
                    <div key={r.id || i}>
                      <Box size={14} />
                      <span>
                        {r.name ||
                          r.filename ||
                          r.title ||
                          r.url ||
                          r.text ||
                          human(r.type)}
                      </span>
                      <Badge>{r.status || "Saved"}</Badge>
                    </div>
                  ))}
                </div>
              ) : null}
              <button
                className="button full"
                disabled={
                  busy ||
                  !source.trim() ||
                  source.length > 4000 ||
                  Boolean(state.settings.lowTokenMode) ||
                  !["ACTIVE", "BUSY"].includes(state.state)
                }
                onClick={() =>
                  attempt(
                    mutate(`/projects/${project.id}/design`, {
                      description: source,
                      includeReferences: false,
                    }),
                  )
                }
              >
                <Construction size={15} />
                Design blueprint with {MODEL_PROVIDERS[state.settings.provider || 'codex']}
              </button>
              {state.settings.lowTokenMode ? <p className="note">Low token mode disables new AI designs. Turn it off in Settings → AI models & reasoning to generate one. Blueprint imports, previews, material calculations and approved construction still work.</p> : null}
              <p className="note">
                This design button sends only the notes above. Use Analyze the actual source to share selected visuals for analysis and source reconstruction. Partial
                references aren’t exact blueprints. Hidden details and
                unmeasured dimensions stay unresolved until a complete design is
                approved.
              </p>
            </Panel>
          </div>
          {project.blueprint?.uncertainties.length ? (
            <div className="info-note gold">
              <ShieldAlert size={18} />
              <div>
                <strong>Design notes to review</strong>
                {project.blueprint.uncertainties.map((u, i) => (
                  <p key={i}>{u}</p>
                ))}
              </div>
            </div>
          ) : null}
          <div className="studio-bottom">
            <Panel
              title="Materials, from the blueprint"
              action={
                <Badge
                  tone={
                    project.materials?.accuracy === "exact-blueprint"
                      ? "green"
                      : "gold"
                  }
                >
                  {project.materials?.accuracy === "exact-blueprint"
                    ? "Exact placement counts"
                    : "Awaiting blueprint"}
                </Badge>
              }
            >
              <MaterialTable project={project} />
              {project.materials?<><button className="button" disabled={busy} onClick={()=>attempt(mutate(`/projects/${project.id}/assisted-split`,{}))}>Split common materials 50/50; give me the difficult ones</button><p className="note">Common materials are split by item count. Materials without a validated acquisition route go to you, so the overall workload may differ from half. Review and change assignments in Shared tasks. No gathering starts before blueprint approval.</p></>:null}
            </Panel>
            <Panel title="Ready to build?" eyebrow="SURVIVAL CONSTRUCTION">
              <p className="note">
                Approve the current design before any construction. Existing
                blocks are protected; occupied placements stop for review.
              </p>
              <p className="note">The builder can refill from approved supply chests and craft with unreserved ingredients it carries. Approve chest items in Companion → Routines &amp; supplies. Missing raw materials or safe access pause the build at its checkpoint.</p>
              {project.compatibility?.limitation ? (
                <p className="note">{project.compatibility.limitation}</p>
              ) : null}
              {project.compatibility?.unsupported?.length ? (
                <p className="inline-error">
                  Placement adapters needed:{" "}
                  {project.compatibility.unsupported.map(human).join(", ")}
                </p>
              ) : null}
              {project.compatibility?.issues?.map((issue: string) => <p className="inline-error" key={issue}>{issue}</p>)}
              <div className="data-row">
                <span>Blueprint revision</span>
                <strong>{project.revision || "—"}</strong>
              </div>
              <button
                className="button full"
                disabled={
                  busy ||
                  !project.blueprint ||
                  project.approvedRevision === project.revision
                }
                onClick={() =>
                  attempt(mutate(`/projects/${project.id}/approve`, {}))
                }
              >
                <Check size={15} />
                Approve this blueprint
              </button>
              <div className="coordinate-inputs">
                {(["x", "y", "z"] as const).map((axis) => (
                  <label key={axis}>
                    {axis.toUpperCase()}
                    <input
                      type="number"
                      value={origin[axis]}
                      onChange={(e) =>
                        setOrigin({ ...origin, [axis]: Number(e.target.value) })
                      }
                    />
                  </label>
                ))}
              </div>
              <button
                className="button primary full"
                disabled={
                  busy ||
                  !project.blueprint ||
                  project.compatibility?.supported === false ||
                  project.approvedRevision !== project.revision ||
                  !["ACTIVE", "BUSY"].includes(state.state)
                }
                onClick={() =>
                  attempt(mutate(`/projects/${project.id}/build`, { origin }))
                }
              >
                <Construction size={15} />
                {project.checkpoint
                  ? "Resume construction"
                  : "Start construction"}
              </button>
              {project.checkpoint ? (
                <div className="checkpoint">
                  <strong>{human(project.checkpoint.status)}</strong>
                  <p>
                    {project.checkpoint.reason ||
                      `${project.checkpoint.verified?.length || 0} placements verified in the world.`}
                  </p>
                </div>
              ) : null}
            </Panel>
          </div>
        </>
      )}
    </>
  );
}

function MaterialTable({ project }: { project: Project }) {
  const [view, setView] = useState<'placed' | 'craftedItems' | 'raw'>('craftedItems');
  const rows = project.materials?.[view];
  return (
    <>
      <div className="segmented compact">
        <button
          className={view === 'placed' ? "selected" : ""}
          onClick={() => setView('placed')}
        >
          Placed blocks
        </button>
        <button className={view === 'craftedItems' ? "selected" : ""} onClick={() => setView('craftedItems')}>
          Inventory items
        </button>
        <button className={view === 'raw' ? "selected" : ""} onClick={() => setView('raw')}>
          Raw ingredients
        </button>
      </div>
      <p className="note">{view === 'craftedItems' ? 'Items needed to place this design. One door creates two block halves; a double slab consumes two slab items. Crafting surplus and temporary supplies are separate.' : view === 'placed' ? 'Occupied positions in the blueprint, including both door halves. Switch to Inventory items for quantities to bring.' : 'Raw inputs from the saved recipe plan. Unresolved fuel and temporary supplies are separate.'}</p>
      {rows?.length ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Material</th>
                <th>Required</th>
                <th>Stacks</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r: any) => (
                <tr key={r.name}>
                  <td>
                    <span className="material-name">
                      <ItemIcon name={r.name} />
                      {human(r.name)}
                    </span>
                  </td>
                  <td className="mono">{r.quantity.toLocaleString()}</td>
                  <td className="muted">
                    {typeof r.stacks === "number"
                      ? `${Math.floor(r.stacks)}${r.stacks % 1 ? ` + ${r.quantity % (r.stackSize || 64)}` : ""}`
                      : `${Math.floor(r.quantity / (r.stackSize || 64))} + ${r.quantity % (r.stackSize || 64)}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="quiet-empty">
          A validated blueprint unlocks its material list.
        </p>
      )}
      {project.materials?.unresolved?.length ? (
        <div className="info-note gold">
          <ShieldAlert size={16} />
          <p>
            {project.materials.unresolved
              .map((u: any) => (typeof u === "string" ? u : JSON.stringify(u)))
              .join(" · ")}
          </p>
        </div>
      ) : null}
    </>
  );
}
