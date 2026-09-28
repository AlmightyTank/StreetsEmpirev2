import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';

/**
 * The "?" next to a label. 1.0.0-G: it used to show its text only as a hover
 * `title`, which a phone never shows. Now a tap (or Enter/Space) opens the text
 * under it; a second tap, Escape or a tap elsewhere closes it. Hovering with a
 * mouse still shows it too.
 */
export function HelpTip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  // Where the text sits, measured once it is open, so it never runs off a phone's edge.
  const [left, setLeft] = useState<number | null>(null);
  const pop = useRef<HTMLSpanElement>(null);
  const id = useId();
  const root = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    if (!open || !root.current || !pop.current) return;
    const anchor = root.current.getBoundingClientRect();
    const width = pop.current.offsetWidth;
    const viewport = document.documentElement.clientWidth;
    const centred = anchor.left + anchor.width / 2 - width / 2;
    setLeft(Math.min(Math.max(8, centred), viewport - width - 8) - anchor.left);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  return (
    <span className="se-tipwrap" ref={root}>
      <button
        type="button"
        className="se-tip"
        aria-label={`About this: ${text}`}
        aria-expanded={open}
        aria-controls={id}
        title={open ? undefined : text}
        onClick={(event) => {
          // Inside a label or a clickable row, the tip must not also press the row.
          event.preventDefault();
          event.stopPropagation();
          setOpen((value) => !value);
        }}
      >
        ?
      </button>
      <span
        id={id}
        ref={pop}
        role="tooltip"
        className="se-tip__pop"
        hidden={!open}
        style={left === null ? undefined : { left, transform: 'none' }}
      >
        {text}
      </span>
    </span>
  );
}
