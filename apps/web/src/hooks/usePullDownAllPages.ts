import { useEffect } from 'react';

const MIN_PULL_DISTANCE = 96;
const MAX_PAGE_SCROLL = 5;
const BLOCKED_TARGETS = 'a, button, input, select, textarea, [contenteditable="true"], [role="slider"], [data-no-pull-nav]';

type StartTouch = { identifier: number; x: number; y: number };

/** A deliberate downward drag, rather than a tap or a horizontal page gesture. */
export function isPullDownGesture(startX: number, startY: number, endX: number, endY: number): boolean {
  const dx = Math.abs(endX - startX);
  const dy = endY - startY;
  return dy >= MIN_PULL_DISTANCE && dy > dx * 1.5;
}

/** Keep pulls in nested scrolling regions for the region, not for global navigation. */
function insideScrollableRegion(element: Element): boolean {
  for (let node = element as HTMLElement | null; node && !node.classList.contains('se-gamemain'); node = node.parentElement) {
    if (node.scrollHeight <= node.clientHeight + 5) continue;
    const overflow = window.getComputedStyle(node).overflowY;
    if (overflow === 'auto' || overflow === 'scroll' || overflow === 'overlay') return true;
  }
  return false;
}

/**
 * At the top of a mobile game page, a downward pull opens All pages.
 * Native page scrolling is never prevented, and scrolling tables, carousels,
 * forms, and the sheet itself do not trigger the global gesture.
 */
export function usePullDownAllPages(enabled: boolean, onOpen: () => void): void {
  useEffect(() => {
    if (!enabled) return;
    let start: StartTouch | null = null;

    const onStart = (event: TouchEvent) => {
      start = null;
      if (window.innerWidth >= 900 || window.scrollY > MAX_PAGE_SCROLL || event.touches.length !== 1) return;

      const target = event.target;
      if (!(target instanceof Element) ||
          !target.closest('.se-app--tabbar .se-gamemain') ||
          target.closest(BLOCKED_TARGETS) ||
          insideScrollableRegion(target)) return;

      const touch = event.touches[0];
      if (!touch) return;
      start = { identifier: touch.identifier, x: touch.clientX, y: touch.clientY };
    };

    const onMove = (event: TouchEvent) => {
      if (!start) return;
      if (event.touches.length !== 1) { start = null; return; }
      const touch = event.touches[0];
      if (!touch || touch.identifier !== start.identifier ||
          touch.clientY - start.y < -20 ||
          (Math.abs(touch.clientX - start.x) > 65 &&
           Math.abs(touch.clientX - start.x) > Math.abs(touch.clientY - start.y))) start = null;
    };

    const onEnd = (event: TouchEvent) => {
      const initial = start;
      start = null;
      if (!initial || window.scrollY > MAX_PAGE_SCROLL) return;
      const touch = Array.from(event.changedTouches).find((item) => item.identifier === initial.identifier);
      if (touch && isPullDownGesture(initial.x, initial.y, touch.clientX, touch.clientY)) onOpen();
    };

    const onCancel = () => { start = null; };
    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: true });
    document.addEventListener('touchend', onEnd, { passive: true });
    document.addEventListener('touchcancel', onCancel, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchcancel', onCancel);
    };
  }, [enabled, onOpen]);
}
