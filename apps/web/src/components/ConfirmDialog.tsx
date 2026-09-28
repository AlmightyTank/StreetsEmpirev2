import { useEffect, useRef } from 'react';
import { useConfirm } from '../stores/confirm.js';

/**
 * 1.0.0-G. The dialog behind confirmAction(). Rendered once, by the Shell. Keyboard:
 * Tab stays inside, Escape cancels, focus returns to where it was.
 */
export function ConfirmDialog() {
  const pending = useConfirm((s) => s.pending);
  const answer = useConfirm((s) => s.answer);
  const box = useRef<HTMLDivElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const ok = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!pending) return undefined;
    const previous = document.activeElement as HTMLElement | null;
    (pending.tone === 'danger' ? cancel.current : ok.current)?.focus();
    return () => previous?.focus?.();
  }, [pending]);

  if (!pending) return null;
  const danger = pending.tone === 'danger';

  return (
    <div className="se-intro-backdrop se-confirm-backdrop" onClick={(event) => { if (event.target === event.currentTarget) answer(false); }}>
      <div
        ref={box}
        className="se-intro se-confirm"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="se-confirm-title"
        aria-describedby={pending.body ? 'se-confirm-body' : undefined}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            answer(false);
          }
          if (event.key === 'Tab') {
            const first = cancel.current;
            const last = ok.current;
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
          }
        }}
      >
        <h2 id="se-confirm-title">{pending.title}</h2>
        {pending.body ? <p id="se-confirm-body">{pending.body}</p> : null}
        <div className="se-confirm__actions">
          <button ref={cancel} type="button" className="se-btn se-btn--ghost" onClick={() => answer(false)}>
            {pending.cancelLabel ?? 'Cancel'}
          </button>
          <button ref={ok} type="button" className={`se-btn ${danger ? 'se-btn--danger' : 'se-btn--primary'}`} onClick={() => answer(true)}>
            {pending.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
