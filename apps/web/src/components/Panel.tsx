import type { ReactNode } from 'react';

interface PanelProps {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
  /** Rows and tables sit flush against the border. */
  flush?: boolean;
  className?: string;
}

export function Panel({ title, aside, children, flush, className }: PanelProps) {
  return (
    <section className={`se-panel ${className ?? ''}`}>
      <header className="se-panel__head">
        <h2 className="se-panel__title">{title}</h2>
        {aside ? <div className="se-eyebrow">{aside}</div> : null}
      </header>
      <div className={`se-panel__body${flush ? ' se-panel__body--flush' : ''}`}>
        {children}
      </div>
    </section>
  );
}

interface RowProps {
  label: ReactNode;
  value: ReactNode;
  strong?: boolean;
}

export function Row({ label, value, strong }: RowProps) {
  return (
    <div className={`se-row${strong ? ' se-row--strong' : ''}`}>
      <span className="se-row__label">{label}</span>
      <span className="se-row__value">{value}</span>
    </div>
  );
}

interface StatProps {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  meter?: { value: number; max: number };
}

export function Stat({ label, value, sub, meter }: StatProps) {
  const pct = meter ? Math.max(0, Math.min(100, (meter.value / meter.max) * 100)) : null;
  const tone = pct === null ? '' : pct >= 66 ? '' : pct >= 33 ? ' se-meter__fill--warn' : ' se-meter__fill--bad';

  return (
    <div className="se-stat">
      <div className="se-stat__label">{label}</div>
      <div className="se-stat__value">{value}</div>
      {sub ? <div className="se-stat__sub">{sub}</div> : null}
      {pct !== null ? (
        <div className="se-meter">
          <div className={`se-meter__fill${tone}`} style={{ width: `${pct}%` }} />
        </div>
      ) : null}
    </div>
  );
}
