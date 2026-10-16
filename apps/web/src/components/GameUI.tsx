import { cloneElement, isValidElement, useEffect, useId, useRef, type HTMLAttributes, type ReactElement, type ReactNode } from 'react';
import { Button, type ButtonVariant } from './Button.js';
import { lockPageScroll } from '../utils/pageScrollLock.js';

export function GamePageHeader({ eyebrow, title, description, actions, art }: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  art?: ReactNode;
}) {
  return (
    <header className="se-game-pagehead">
      <div className="se-game-pagehead__copy">
        {eyebrow ? <div className="se-eyebrow">{eyebrow}</div> : null}
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
        {actions ? <div className="se-game-pagehead__actions">{actions}</div> : null}
      </div>
      {art ? <div className="se-game-pagehead__art" aria-hidden="true">{art}</div> : null}
    </header>
  );
}

export function SectionHeader({ title, description, action, level = 2 }: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  level?: 2 | 3 | 4;
}) {
  const Heading = `h${level}` as 'h2' | 'h3' | 'h4';
  return <header className="se-sectionhead"><div><Heading>{title}</Heading>{description ? <p>{description}</p> : null}</div>{action}</header>;
}

export function GameCard({ children, className, interactive, ...props }: HTMLAttributes<HTMLElement> & { interactive?: boolean }) {
  return <article {...props} className={`se-game-card${interactive ? ' se-game-card--interactive' : ''}${className ? ` ${className}` : ''}`}>{children}</article>;
}

export function StatCard({ label, value, detail, tone = 'default' }: {
  label: ReactNode;
  value: ReactNode;
  detail?: ReactNode;
  tone?: 'default' | 'good' | 'warning' | 'bad';
}) {
  return <div className={`se-stat-card se-stat-card--${tone}`}><span>{label}</span><strong>{value}</strong>{detail ? <small>{detail}</small> : null}</div>;
}

export interface GameTab { id: string; label: ReactNode; disabled?: boolean; }
export function GameTabs({ items, activeId, onChange, label = 'Page sections' }: {
  items: readonly GameTab[];
  activeId: string;
  onChange: (id: string) => void;
  label?: string;
}) {
  return (
    <div className="se-game-tabs" role="tablist" aria-label={label} aria-orientation="horizontal">
      {items.map((item) => <button
        key={item.id}
        type="button"
        role="tab"
        aria-selected={item.id === activeId}
        tabIndex={item.id === activeId ? 0 : -1}
        disabled={item.disabled}
        className={item.id === activeId ? 'is-active' : ''}
        onClick={() => onChange(item.id)}
        onKeyDown={(event) => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          const tabs = Array.from(event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]:not(:disabled)') ?? []);
          const current = tabs.indexOf(event.currentTarget);
          if (current < 0 || !tabs.length) return;
          event.preventDefault();
          const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : event.key === 'ArrowRight' ? (current + 1) % tabs.length : (current - 1 + tabs.length) % tabs.length;
          const next = tabs[nextIndex]!;
          next.focus();
          next.click();
        }}
      >{item.label}</button>)}
    </div>
  );
}

export function FormControl({ id, label, hint, error, required, children }: {
  id?: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  children: ReactElement<{ id?: string; className?: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string; required?: boolean }>;
}) {
  const generated = useId();
  const controlId = id ?? `se-control-${generated.replace(/:/g, '')}`;
  return (
    <div className="se-field">
      <label className="se-label" htmlFor={controlId}>{label}{required ? <span className="se-required" aria-hidden="true"> *</span> : null}</label>
      <div className="se-form-control">{isValidElement(children) ? cloneElement(children, {
        id: controlId,
        className: `se-input${children.props.className ? ` ${children.props.className}` : ''}`,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': error ? `${controlId}-error` : hint ? `${controlId}-hint` : undefined,
        required,
      }) : children}</div>
      {error ? <p id={`${controlId}-error`} className="se-error" role="alert">{error}</p> : hint ? <p id={`${controlId}-hint`} className="se-hint">{hint}</p> : null}
    </div>
  );
}

export function GameTable({ caption, headers, children, className }: {
  caption: string;
  headers: readonly ReactNode[];
  children: ReactNode;
  className?: string;
}) {
  return <div className={`se-game-tablewrap${className ? ` ${className}` : ''}`}><table className="se-game-table"><caption className="se-sr">{caption}</caption><thead><tr>{headers.map((header, index) => <th key={index} scope="col">{header}</th>)}</tr></thead><tbody>{children}</tbody></table></div>;
}

export function EmptyState({ title, description, action }: { title: ReactNode; description?: ReactNode; action?: ReactNode }) {
  return <div className="se-empty-state"><strong>{title}</strong>{description ? <p>{description}</p> : null}{action ? <div>{action}</div> : null}</div>;
}

export function StatusBadge({ children, tone = 'neutral' }: {
  children: ReactNode;
  tone?: 'neutral' | 'accent' | 'good' | 'warning' | 'bad';
}) {
  return <span className={`se-status-badge se-status-badge--${tone}`}>{children}</span>;
}

export function ProgressBar({ label, value, max = 100, tone = 'accent' }: {
  label: string;
  value: number;
  max?: number;
  tone?: 'accent' | 'good' | 'warning' | 'bad';
}) {
  const safeMax = Math.max(0, max);
  const current = Math.max(0, Math.min(safeMax, value));
  const percent = safeMax > 0 ? current / safeMax * 100 : 0;
  return <div className="se-progress" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={safeMax} aria-valuenow={current}><span className={`se-progress__fill se-progress__fill--${tone}`} style={{ width: `${percent}%` }} /></div>;
}

export function ActionFooter({ children, sticky = false }: { children: ReactNode; sticky?: boolean }) {
  return <footer className={`se-action-footer${sticky ? ' se-action-footer--sticky' : ''}`}>{children}</footer>;
}

export function GameDialog({ open, title, description, children, actions, onClose }: {
  open: boolean;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  onClose: () => void;
}) {
  const titleId = useId();
  const dialog = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const unlockScroll = lockPageScroll();
    dialog.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { onCloseRef.current(); return; }
      if (event.key !== 'Tab' || !dialog.current) return;
      const focusable = Array.from(dialog.current.querySelectorAll<HTMLElement>('button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'));
      if (!focusable.length) { event.preventDefault(); dialog.current.focus(); return; }
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      unlockScroll();
      previousFocus?.focus();
    };
  }, [open]);
  if (!open) return null;
  return <div className="se-game-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div ref={dialog} className="se-game-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}><SectionHeader title={<span id={titleId}>{title}</span>} description={description} action={<button type="button" className="se-game-dialog__close" aria-label="Close dialog" onClick={onClose}>×</button>} />{children ? <div className="se-game-dialog__body">{children}</div> : null}{actions ? <ActionFooter>{actions}</ActionFooter> : null}</div></div>;
}

export function DialogAction({ children, variant = 'default', onClick }: { children: ReactNode; variant?: ButtonVariant; onClick?: () => void }) {
  return <Button type="button" variant={variant} onClick={onClick}>{children}</Button>;
}
