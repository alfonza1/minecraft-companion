import { Box, Compass } from "lucide-react";
import { useState, type ReactNode } from "react";
import type { CompanionState, Project } from "../../../packages/shared-types";
export type Mutate = (path: string, body?: unknown) => Promise<any>;
export type Common = { state: CompanionState; mutate: Mutate; busy: boolean };
export function human(value?: string) {
  return (
    value
      ?.replace(/^minecraft:/, "")
      .replaceAll("_", " ")
      .replace(/\b\w/g, (c) => c.toUpperCase()) || "Unknown"
  );
}

export function time(value: string) {
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function attempt(promise: Promise<unknown>) {
  void promise.catch(() => {});
}

export function Panel({
  title,
  eyebrow,
  action,
  children,
  className = "",
}: {
  title?: string;
  eyebrow?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      <div className="panel-heading">
        <div>
          {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
          {title ? <h2>{title}</h2> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Empty({
  icon: Icon = Compass,
  title,
  children,
}: {
  icon?: typeof Compass;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon size={26} />
      </div>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}

export function Badge({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return (
    <span className={`badge ${tone}`}>
      <i />
      {children}
    </span>
  );
}

export function ItemIcon({ name }: { name: string }) {
  const [failed, setFailed] = useState(false);
  return failed ? (
    <Box size={28} />
  ) : (
    <img
      src={`/api/assets/item/${encodeURIComponent(name)}`}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

export function ProjectSelect({
  projects,
  selected,
  onChange,
}: {
  projects: Project[];
  selected: string;
  onChange: (id: string) => void;
}) {
  return (
    <select
      aria-label="Current build project"
      value={selected}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">Choose a project</option>
      {projects.map((p) => (
        <option value={p.id} key={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );
}

export function SettingSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Record<string, string>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="field-label">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {Object.entries(options).map(([v, text]) => (
          <option key={v} value={v}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}
