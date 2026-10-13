import type { ReactNode } from 'react';

export interface ActionReadinessItem {
  key: string;
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: 'good' | 'warn' | 'bad';
}

/** One shared, glanceable operation briefing for Scout, Produce and Raids. */
export function ActionReadiness({
  title,
  status,
  blockedReason,
  items,
}: {
  title: string;
  status: string;
  blockedReason?: string | null;
  items: readonly ActionReadinessItem[];
}) {
  return (
    <section className="se-action-readiness" aria-label={title}>
      <div className="se-action-readiness__heading">
        <strong>{title}</strong>
        <span className={`se-action-readiness__status${blockedReason ? ' se-action-readiness__status--blocked' : ''}`}>
          {status}
        </span>
      </div>
      <div className="se-action-readiness__items">
        {items.map((item) => (
          <div key={item.key} className={`se-action-readiness__item${item.tone ? ` se-action-readiness__item--${item.tone}` : ''}`}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            {item.hint ? <small>{item.hint}</small> : null}
          </div>
        ))}
      </div>
      {blockedReason ? <p className="se-action-readiness__notice" role="status">{blockedReason}</p> : null}
    </section>
  );
}

/** Secondary explanations and loadouts don't need to compete with the action button. */
export function OperationDetails({
  title,
  summary,
  children,
  open,
}: {
  title: string;
  summary: string;
  children: ReactNode;
  open?: boolean;
}) {
  return (
    <details className="se-operation-details" open={open}>
      <summary className="se-operation-details__summary">
        <span><strong>{title}</strong><small>{summary}</small></span>
        <span className="se-operation-details__chevron" aria-hidden="true" />
      </summary>
      <div className="se-operation-details__body">{children}</div>
    </details>
  );
}
