import { useEffect } from 'react';

export type SwipeDirection = 'next' | 'previous';

export type SwipeAxisDirection = 'left' | 'right' | 'up' | 'down';

/** How far, how straight and how fast a finger must travel to count as a swipe. */
const MIN_DISTANCE = 60;
const MAX_SLOPE = 0.6; // cross-axis travel / main-axis travel
const MAX_DURATION_MS = 700;
/** Swipes starting this close to a screen edge belong to the OS back gesture. */
const EDGE_GUTTER = 24;

/** Reads a finished touch as a quick, straight swipe in one of four directions. */
export function classifySwipe(dx: number, dy: number, durationMs: number, minDistance = MIN_DISTANCE): SwipeAxisDirection | null {
  if (durationMs > MAX_DURATION_MS) return null;
  const horizontal = Math.abs(dx) >= Math.abs(dy);
  const along = horizontal ? Math.abs(dx) : Math.abs(dy);
  const across = horizontal ? Math.abs(dy) : Math.abs(dx);
  if (along < minDistance || across > along * MAX_SLOPE) return null;
  if (horizontal) return dx < 0 ? 'left' : 'right';
  return dy < 0 ? 'up' : 'down';
}

/** The neighbouring enabled tab in the swipe's direction, or null at either end of the strip. */
export function neighborTabIndex(
  tabs: ReadonlyArray<{ selected: boolean; disabled: boolean }>,
  direction: SwipeDirection,
): number | null {
  const current = tabs.findIndex((tab) => tab.selected);
  if (current < 0) return null;
  const step = direction === 'next' ? 1 : -1;
  for (let index = current + step; index >= 0 && index < tabs.length; index += step) {
    if (!tabs[index]!.disabled) return index;
  }
  return null;
}

/** Touches here are someone else's gesture: typing, sliders, sideways scrollers, open sheets. */
const IGNORE = 'input, textarea, select, [contenteditable="true"], [role="slider"], [role="dialog"], [data-no-tab-swipe]';

function scrollsSideways(element: HTMLElement): boolean {
  if (element.scrollWidth <= element.clientWidth + 1) return false;
  const overflow = window.getComputedStyle(element).overflowX;
  return overflow === 'auto' || overflow === 'scroll';
}

function claimedElsewhere(target: Element, root: Element): boolean {
  if (target.closest(IGNORE)) return true;
  for (let node: Element | null = target; node && node !== root; node = node.parentElement) {
    if (node instanceof HTMLElement && scrollsSideways(node)) return true;
  }
  return false;
}

function visible(element: HTMLElement): boolean {
  return element.getClientRects().length > 0;
}

/** The tab strip nearest the touch: the first one found walking outward from where the finger landed. */
function nearestTabList(target: Element, root: Element): HTMLElement | null {
  for (let node: Element | null = target; node; node = node.parentElement) {
    const lists = Array.from(node.querySelectorAll<HTMLElement>('[role="tablist"]'))
      .filter((list) => visible(list) && !list.closest('[data-no-tab-swipe]'));
    if (lists.length) return lists[0]!;
    if (node === root) break;
  }
  return null;
}

function tabsOf(list: HTMLElement): HTMLElement[] {
  return Array.from(list.querySelectorAll<HTMLElement>('[role="tab"]'))
    .filter((tab) => tab.closest('[role="tablist"]') === list && visible(tab));
}

/**
 * On touch screens, a sideways swipe across a page with tabs moves to the next or
 * previous tab. Each page keeps its own tab state, so the swipe simply clicks the
 * neighbouring tab button of the strip closest to where the swipe began.
 */
export function useTabSwipe(rootId = 'main-content'): void {
  useEffect(() => {
    const root = document.getElementById(rootId);
    if (!root) return;

    let start: { x: number; y: number; at: number; target: Element } | null = null;

    const onStart = (event: TouchEvent) => {
      start = null;
      if (event.touches.length !== 1) return;
      const touch = event.touches[0]!;
      if (touch.clientX < EDGE_GUTTER || touch.clientX > window.innerWidth - EDGE_GUTTER) return;
      const target = event.target instanceof Element ? event.target : null;
      if (!target || claimedElsewhere(target, root)) return;
      start = { x: touch.clientX, y: touch.clientY, at: event.timeStamp, target };
    };

    const onMove = (event: TouchEvent) => {
      if (event.touches.length !== 1) start = null;
    };

    const onEnd = (event: TouchEvent) => {
      const begun = start;
      start = null;
      if (!begun || event.touches.length !== 0) return;
      const touch = event.changedTouches[0];
      if (!touch) return;
      if (window.getSelection()?.toString()) return;
      const swipe = classifySwipe(touch.clientX - begun.x, touch.clientY - begun.y, event.timeStamp - begun.at);
      // Swiping left pulls in the next tab, as if the strip slid along with the finger.
      const direction: SwipeDirection | null = swipe === 'left' ? 'next' : swipe === 'right' ? 'previous' : null;
      if (!direction) return;

      const list = nearestTabList(begun.target, root);
      if (!list) return;
      const tabs = tabsOf(list);
      const index = neighborTabIndex(
        tabs.map((tab) => ({
          selected: tab.getAttribute('aria-selected') === 'true',
          disabled: tab.hasAttribute('disabled') || tab.getAttribute('aria-disabled') === 'true',
        })),
        direction,
      );
      if (index === null) return;
      const next = tabs[index]!;
      next.click();
      next.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    };

    const onCancel = () => { start = null; };

    root.addEventListener('touchstart', onStart, { passive: true });
    root.addEventListener('touchmove', onMove, { passive: true });
    root.addEventListener('touchend', onEnd, { passive: true });
    root.addEventListener('touchcancel', onCancel, { passive: true });
    return () => {
      root.removeEventListener('touchstart', onStart);
      root.removeEventListener('touchmove', onMove);
      root.removeEventListener('touchend', onEnd);
      root.removeEventListener('touchcancel', onCancel);
    };
  }, [rootId]);
}
