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
