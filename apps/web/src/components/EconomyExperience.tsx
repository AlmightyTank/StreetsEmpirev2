import type { ReactNode } from 'react';

export type EconomyTone = 'good' | 'warn' | 'bad' | 'accent' | 'muted';

export function EconomyPageHeader({
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
    <header className="se-economy-header">
      <div>
        <span className="se-eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {aside ? <div className="se-economy-header__aside">{aside}</div> : null}
    </header>
  );
}

export function EconomyQuote({
  eyebrow = 'Live quote',
  title,
  status,
  statusTone = 'accent',
  compact = false,
  children,
}: {
  eyebrow?: ReactNode;
  title?: ReactNode;
  status?: ReactNode;
  statusTone?: EconomyTone;
  compact?: boolean;
  children: ReactNode;
}) {
  return (
    <section className={`se-economy-quote${compact ? ' se-economy-quote--compact' : ''}`} aria-label="Transaction quote">
      {(title || status) ? (
        <header className="se-economy-quote__head">
          <div>
            <span className="se-eyebrow">{eyebrow}</span>
            {title ? <strong>{title}</strong> : null}
          </div>
          {status ? <span className={`se-economy-status se-economy-status--${statusTone}`}>{status}</span> : null}
        </header>
      ) : null}
      <div className="se-economy-quote__body">{children}</div>
    </section>
  );
}

export function EconomyPendingNotice({
  title = 'Confirmation pending',
  children,
  action,
}: {
  title?: ReactNode;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="se-economy-pending" role="status" aria-live="polite">
      <div>
        <span className="se-eyebrow">Retry-safe transaction</span>
        <strong>{title}</strong>
        <p>{children}</p>
      </div>
      {action ? <div className="se-economy-pending__action">{action}</div> : null}
    </section>
  );
}

export function EconomyFulfillmentCard({
  title,
  detail,
  status,
  statusTone = 'accent',
  children,
  footer,
}: {
  title: ReactNode;
  detail?: ReactNode;
  status: ReactNode;
  statusTone?: EconomyTone;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <article className="se-economy-fulfillment">
      <header className="se-economy-fulfillment__head">
        <div><strong>{title}</strong>{detail ? <span>{detail}</span> : null}</div>
        <span className={`se-economy-status se-economy-status--${statusTone}`}>{status}</span>
      </header>
      <div className="se-economy-fulfillment__body">{children}</div>
      {footer ? <footer className="se-economy-fulfillment__footer">{footer}</footer> : null}
    </article>
  );
}

/** Marks a multi-line transaction as one atomic checkout without prescribing its store-specific contents. */
export function EconomyBatchAction({ label, className = '', children }: { label: string; className?: string; children: ReactNode }) {
  return <section className={`se-economy-batch ${className}`.trim()} aria-label={label}>{children}</section>;
}
