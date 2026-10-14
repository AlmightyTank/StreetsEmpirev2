import type { ReactNode } from 'react';

export type EmpireTone = 'good' | 'warn' | 'bad' | 'accent' | 'muted';

export type EmpireMetric = {
  key: string;
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  tone?: EmpireTone;
};

export function EmpirePageHeader({
  eyebrow,
  title,
  description,
  aside,
}: {
  eyebrow: ReactNode;
  title: string;
  description: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <header className="se-empire-header">
      <div className="se-empire-header__copy">
        <span className="se-eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {aside ? <div className="se-empire-header__aside">{aside}</div> : null}
    </header>
  );
}

export function EmpireMetricStrip({ items, label }: { items: EmpireMetric[]; label?: string }) {
  return (
    <div className="se-empire-metrics" aria-label={label}>
      {items.map((item) => (
        <div key={item.key} className={`se-empire-metric${item.tone ? ` se-empire-metric--${item.tone}` : ''}`}>
          <span>{item.label}</span>
          <strong>{item.value}</strong>
          {item.detail ? <small>{item.detail}</small> : null}
        </div>
      ))}
    </div>
  );
}

export function EmpireRosterCard({
  eyebrow,
  title,
  status,
  statusTone = 'muted',
  detail,
  meta = [],
  selected = false,
  onSelect,
  selectLabel,
  children,
  actions,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  status?: ReactNode;
  statusTone?: EmpireTone;
  detail?: ReactNode;
  meta?: ReactNode[];
  selected?: boolean;
  onSelect?: () => void;
  selectLabel?: string;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  const summary = (
    <>
      <span className="se-empire-roster__identity">
        {eyebrow ? <span className="se-eyebrow">{eyebrow}</span> : null}
        <strong>{title}</strong>
        {detail ? <small>{detail}</small> : null}
      </span>
      {status ? <span className={`se-empire-status se-empire-status--${statusTone}`}>{status}</span> : null}
    </>
  );

  return (
    <article className={`se-empire-roster${selected ? ' is-selected' : ''}`}>
      {onSelect ? (
        <button type="button" className="se-empire-roster__select" onClick={onSelect} aria-pressed={selected} aria-label={selectLabel}>
          {summary}
        </button>
      ) : <div className="se-empire-roster__select">{summary}</div>}
      {meta.length ? <div className="se-empire-roster__meta">{meta.map((entry, index) => <span key={index}>{entry}</span>)}</div> : null}
      {children ? <div className="se-empire-roster__body">{children}</div> : null}
      {actions ? <div className="se-empire-roster__actions">{actions}</div> : null}
    </article>
  );
}

export function EmpireManagementLayout({
  listLabel,
  list,
  inspector,
}: {
  listLabel: string;
  list: ReactNode;
  inspector: ReactNode;
}) {
  return (
    <div className="se-empire-management">
      <section className="se-empire-management__list" aria-label={listLabel}>{list}</section>
      <div className="se-empire-management__inspector">{inspector}</div>
    </div>
  );
}

export function EmpireInspector({
  eyebrow,
  title,
  status,
  statusTone = 'muted',
  children,
  footer,
  label,
}: {
  eyebrow: ReactNode;
  title: ReactNode;
  status?: ReactNode;
  statusTone?: EmpireTone;
  children: ReactNode;
  footer?: ReactNode;
  label?: string;
}) {
  return (
    <aside className="se-empire-inspector" aria-label={label}>
      <header className="se-empire-inspector__head">
        <div><span className="se-eyebrow">{eyebrow}</span><h3>{title}</h3></div>
        {status ? <span className={`se-empire-status se-empire-status--${statusTone}`}>{status}</span> : null}
      </header>
      <div className="se-empire-inspector__body">{children}</div>
      {footer ? <footer className="se-empire-inspector__footer">{footer}</footer> : null}
    </aside>
  );
}

export function EmpireAreaLegend({
  label,
  items,
}: {
  label: string;
  items: Array<{ key: string; label: ReactNode; tone: 'mine' | 'held' | 'locals' | 'vacant' | 'pressure' | 'locked' }>;
}) {
  return (
    <div className="se-empire-area-legend" aria-label={label}>
      {items.map((item) => (
        <span key={item.key}><i className={`se-empire-area-dot se-empire-area-dot--${item.tone}`} />{item.label}</span>
      ))}
    </div>
  );
}
