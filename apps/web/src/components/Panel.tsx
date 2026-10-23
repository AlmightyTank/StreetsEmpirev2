import type { ReactNode } from 'react';
import { HelpTip } from './HelpTip.js';


interface PanelProps {
  title: ReactNode;
  subtitle?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  /** Rows and tables sit flush against the border. */
  flush?: boolean;
  className?: string;
  /** Anchor for links that land on this panel, e.g. /game#heat. */
  id?: string;
  /** Optional guided-tour target attached to the panel itself. */
  tourTarget?: string;
  loading?: boolean;
}

export function Panel({ title, subtitle, aside, children, flush, className, id, tourTarget, loading }: PanelProps) {
  const titleId = id ? `${id}-title` : undefined;
  return (
    <section id={id} tabIndex={id ? -1 : undefined} data-tour={tourTarget} className={`se-panel ${className ?? ''}`} aria-labelledby={titleId} aria-busy={loading || undefined}>
      <header className="se-panel__head">
        <div>
          <h2 id={titleId} className="se-panel__title">{title}</h2>
          {subtitle ? <p className="se-panel__subtitle">{subtitle}</p> : null}
        </div>
        {aside ? <div className="se-eyebrow">{aside}</div> : null}
      </header>
      <div className={`se-panel__body${flush ? ' se-panel__body--flush' : ''}`}>
        {loading ? <div className="se-loading" role="status"><span className="se-spinner" aria-hidden="true" /> Loading…</div> : children}
      </div>
    </section>
  );
}

interface RowProps {
  label: ReactNode;
  value: ReactNode;
  strong?: boolean;
  tooltip?: string;
}

export function Row({ label, value, strong, tooltip }: RowProps) {
  return (
    <div className={`se-row${strong ? ' se-row--strong' : ''}`}>
      <span className="se-row__label">{label}{tooltip ? <HelpTip text={tooltip} /> : null}</span>
      <span className="se-row__value">{value}</span>
    </div>
  );
}

interface StatProps {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  meter?: { value: number; max: number };
  tooltip?: string;
  tone?: 'default' | 'good' | 'warning' | 'bad';
}

export function Stat({ label, value, sub, meter, tooltip, tone = 'default' }: StatProps) {
  const meterMax = meter ? Math.max(0, meter.max) : null;
  const current = meter ? Math.max(0, Math.min(meterMax!, meter.value)) : null;
  const pct = meter ? (meterMax! > 0 ? current! / meterMax! * 100 : 0) : null;
  const meterTone = pct === null ? '' : pct >= 66 ? '' : pct >= 33 ? ' se-meter__fill--warn' : ' se-meter__fill--bad';

  return (
    <div className={`se-stat${tone === 'default' ? '' : ` se-stat--${tone}`}`}>
      <div className="se-stat__label">{label}{tooltip ? <HelpTip text={tooltip} /> : null}</div>
      <div className="se-stat__value">{value}</div>
      {sub ? <div className="se-stat__sub">{sub}</div> : null}
      {pct !== null ? (
        <div className="se-meter" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={meterMax!} aria-valuenow={current!}>
          <div className={`se-meter__fill${meterTone}`} style={{ width: `${pct}%` }} />
        </div>
      ) : null}
    </div>
  );
}
