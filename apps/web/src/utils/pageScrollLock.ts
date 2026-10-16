type ScrollSnapshot = {
  x: number;
  y: number;
  rootOverflow: string;
  bodyOverflow: string;
  bodyPosition: string;
  bodyTop: string;
  bodyLeft: string;
  bodyRight: string;
  bodyWidth: string;
  bodyPaddingRight: string;
};

let lockCount = 0;
let snapshot: ScrollSnapshot | null = null;

/**
 * Freeze the document behind a modal surface without losing its scroll position.
 * Locks are reference-counted so stacked overlays cannot prematurely re-enable
 * the page when either surface closes.
 */
export function lockPageScroll(): () => void {
  if (typeof document === 'undefined' || typeof window === 'undefined') return () => undefined;

  if (lockCount === 0) {
    const root = document.documentElement;
    const body = document.body;
    snapshot = {
      x: window.scrollX,
      y: window.scrollY,
      rootOverflow: root.style.overflow,
      bodyOverflow: body.style.overflow,
      bodyPosition: body.style.position,
      bodyTop: body.style.top,
      bodyLeft: body.style.left,
      bodyRight: body.style.right,
      bodyWidth: body.style.width,
      bodyPaddingRight: body.style.paddingRight,
    };
    const scrollbarWidth = Math.max(0, window.innerWidth - root.clientWidth);
    const computedPaddingRight = Number.parseFloat(window.getComputedStyle(body).paddingRight) || 0;
    root.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    body.style.position = 'fixed';
    body.style.top = `${-snapshot.y}px`;
    body.style.left = `${-snapshot.x}px`;
    body.style.right = '0';
    body.style.width = '100%';
    if (scrollbarWidth) body.style.paddingRight = `${computedPaddingRight + scrollbarWidth}px`;
  }
  lockCount++;

  let released = false;
  return () => {
    if (released) return;
    released = true;
    lockCount = Math.max(0, lockCount - 1);
    if (lockCount !== 0 || !snapshot) return;

    const restore = snapshot;
    snapshot = null;
    const root = document.documentElement;
    const body = document.body;
    root.style.overflow = restore.rootOverflow;
    body.style.overflow = restore.bodyOverflow;
    body.style.position = restore.bodyPosition;
    body.style.top = restore.bodyTop;
    body.style.left = restore.bodyLeft;
    body.style.right = restore.bodyRight;
    body.style.width = restore.bodyWidth;
    body.style.paddingRight = restore.bodyPaddingRight;
    window.scrollTo(restore.x, restore.y);
  };
}
