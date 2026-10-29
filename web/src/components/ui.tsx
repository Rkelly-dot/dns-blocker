import type { ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div className="page-header-text">
        <div className="page-eyebrow">{eyebrow}</div>
        <h1 className="page-title">{title}</h1>
        <p className="page-sub">{description}</p>
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  );
}

export function Panel({
  title,
  actions,
  children,
  note,
  flush = false,
  className = "",
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
  note?: ReactNode;
  flush?: boolean;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`.trim()}>
      <div className="panel-head">
        <h2 className="panel-title">{title}</h2>
        {actions ? <div className="panel-actions">{actions}</div> : null}
      </div>
      <div className={`panel-body${flush ? " flush" : ""}`}>{children}</div>
      {note ? <div className="panel-note">{note}</div> : null}
    </section>
  );
}

export function StatTile({
  label,
  value,
  suffix,
  foot,
}: {
  label: string;
  value: string;
  suffix?: string;
  foot?: ReactNode;
}) {
  return (
    <div className="tile">
      <div className="tile-label">{label}</div>
      <div className="tile-value">
        {value}
        {suffix ? <small>{suffix}</small> : null}
      </div>
      {foot ? <div className="tile-foot">{foot}</div> : null}
    </div>
  );
}

export function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { label: string; value: T }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          className={`seg-btn${option.value === value ? " active" : ""}`}
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  text,
  actions,
}: {
  title: string;
  text: string;
  actions?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-title">{title}</div>
      <p className="empty-text">{text}</p>
      {actions ? <div className="empty-actions">{actions}</div> : null}
    </div>
  );
}

export function Tag({ tone, children }: { tone: "blocked" | "allowed" | "info"; children: ReactNode }) {
  return <span className={`tag tag-${tone}`}>{children}</span>;
}
