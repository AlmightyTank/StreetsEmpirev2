import { legacyQuestGroup } from './questBoard.js';

function isStorefront(pathname: string | undefined): boolean {
  return pathname === '/game/stores' || Boolean(pathname?.startsWith('/game/stores/'));
}

function isCasinoGame(pathname: string | undefined): boolean {
  return Boolean(pathname?.startsWith('/game/casino/'));
}

/** Shared shells swap their active content in place instead of jumping to top. */
export function shouldPreserveRouteScroll(previousPath: string | undefined, nextPath: string, hash = ''): boolean {
  if (hash) return false;
  return (isStorefront(previousPath) && isStorefront(nextPath))
    || (isCasinoGame(previousPath) && isCasinoGame(nextPath));
}

export interface RouteScrollSnapshot {
  pathname: string;
  anchorId: string | null;
  key: string;
  completed: boolean;
}

export type RouteScrollPlan = 'ignore' | 'leave' | 'top' | 'restore' | 'preserve' | 'anchor';

const routeScrollMemory = new Map<string, number>();
const pathScrollMemory = new Map<string, number>();

function rememberOffset(memory: Map<string, number>, key: string, y: number): void {
  if (!key || !Number.isFinite(y)) return;
  memory.set(key, Math.max(0, y));
}

/** Remember where a history entry was, so Back/Forward can return to that exact offset. */
export function rememberRouteScroll(key: string, y: number): void {
  rememberOffset(routeScrollMemory, key, y);
}

export function rememberedRouteScroll(key: string): number | undefined {
  return routeScrollMemory.get(key);
}

/** Remember the latest offset for a path, so tapping back to that screen lands in the same place. */
export function rememberPathScroll(pathname: string, y: number): void {
  rememberOffset(pathScrollMemory, pathname, y);
}

export function rememberedPathScroll(pathname: string): number | undefined {
  return pathScrollMemory.get(pathname);
}

export function clearRouteScrollMemory(): void {
  routeScrollMemory.clear();
  pathScrollMemory.clear();
}

/**
 * Decide what to do with the window when the route changes.
 * Back/Forward restores the offset saved for that history entry, even when the
 * URL still has a hash — re-seeking the hash would jump to the section top
 * instead of the spot the player had scrolled to. Opening a screen again from
 * a tab or menu returns to the last offset on that path. A first visit still
 * honors anchors, shared store/casino shells, and the top of a new page.
 */
export function planRouteScroll(input: {
  navigationType: 'POP' | 'PUSH' | 'REPLACE';
  pathname: string;
  anchorId: string | null;
  locationKey: string;
  previous: RouteScrollSnapshot | null;
  savedY: number | undefined;
  /** Latest offset for this pathname. Used when a tab or menu opens the screen again. */
  savedPathY?: number;
  preserveSharedShell: boolean;
}): RouteScrollPlan {
  const { previous, pathname, anchorId, locationKey, navigationType, savedY, savedPathY, preserveSharedShell } = input;

  if (
    previous
    && previous.key === locationKey
    && previous.pathname === pathname
    && previous.anchorId === anchorId
    && previous.completed
  ) return 'ignore';

  // Search updates on the page already on screen keep the current offset.
  if (
    previous
    && previous.pathname === pathname
    && previous.anchorId === anchorId
    && !anchorId
    && navigationType !== 'POP'
  ) return 'ignore';

  if (navigationType === 'POP') {
    if (savedY !== undefined) return 'restore';
    if (anchorId) return 'anchor';
    return 'leave';
  }

  if (preserveSharedShell) return 'preserve';
  if (!anchorId && savedPathY !== undefined) return 'restore';
  if (!anchorId) return 'top';
  return 'anchor';
}

/**
 * Restore a shared page position once it is reachable. A new storefront may
 * render shorter than the previous one until its data loads, so callers can
 * observe layout changes until `settled` or the player starts interacting.
 */
export function preservedRouteScrollTarget(
  desiredY: number,
  documentHeight: number,
  viewportHeight: number,
): { top: number; settled: boolean } {
  const maxY = Math.max(0, documentHeight - viewportHeight);
  const target = Math.max(0, desiredY);
  return { top: Math.min(target, maxY), settled: target <= maxY };
}

/** Resolve every in-game deep link to its rendered element, including legacy quest ?focus= links. */
export function routeAnchorId(pathname: string, search: string, hash: string): string | null {
  if (hash.length > 1 && hash.startsWith('#')) {
    try { return decodeURIComponent(hash.slice(1)); }
    catch { return hash.slice(1); }
  }
  if (pathname === '/game/quests') {
    const questKey = new URLSearchParams(search).get('focus');
    if (questKey) return `quest-${questKey}`;
    const group = legacyQuestGroup(search);
    return group ? `quest-board-${group}` : null;
  }
  return null;
}

/** Do not jump into an accordion or panel before it has opened. */
export function isAnchorReady(target: Element): boolean {
  return !target.closest('details:not([open]), [hidden], [aria-hidden="true"]');
}

/** Account for the actual sticky mobile HUD height, rather than a fixed pixel guess. */
export function anchorScrollTop(targetViewportTop: number, scrollY: number, stickyHeaderBottom = 0): number {
  return Math.max(0, scrollY + targetViewportTop - Math.max(0, stickyHeaderBottom) - 16);
}
