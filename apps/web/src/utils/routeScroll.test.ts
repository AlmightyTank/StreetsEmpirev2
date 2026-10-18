import { describe, expect, it } from 'vitest';
import { anchorScrollTop, isAnchorReady, routeAnchorId, shouldPreserveRouteScroll } from './routeScroll.js';

describe('shared-shell route scroll', () => {
  it('preserves position while switching storefronts', () => {
    expect(shouldPreserveRouteScroll('/game/stores/pip', '/game/stores/charlie')).toBe(true);
    expect(shouldPreserveRouteScroll('/game/stores', '/game/stores/pip')).toBe(true);
  });

  it('preserves position while switching casino games', () => {
    expect(shouldPreserveRouteScroll('/game/casino/slots', '/game/casino/blackjack')).toBe(true);
  });

  it('resets unrelated pages and honors hash targets', () => {
    expect(shouldPreserveRouteScroll('/game/scout', '/game/produce')).toBe(false);
    expect(shouldPreserveRouteScroll('/game/stores/pip', '/game/stores/charlie', '#basket')).toBe(false);
    expect(shouldPreserveRouteScroll('/game/casino', '/game/casino/slots')).toBe(false);
  });
});

describe('in-game deep links', () => {
  it('decodes anchors, prefers the current hash, and handles malformed escape sequences', () => {
    expect(routeAnchorId('/game/quests', '?focus=old', '#quest-new%20job')).toBe('quest-new job');
    expect(routeAnchorId('/game/quests', '?focus=FIRST_NIGHT_OUT', '')).toBe('quest-FIRST_NIGHT_OUT');
    expect(routeAnchorId('/game/quests', '?tab=active', '')).toBe('quest-board-active');
    expect(routeAnchorId('/game/quests', '?tab=completed', '')).toBe('quest-board-history');
    expect(routeAnchorId('/game/quests', '?tab=daily', '')).toBe('quest-board-contracts');
    expect(routeAnchorId('/game/quests', '', '')).toBeNull();
    expect(routeAnchorId('/game', '', '#case')).toBe('case');
    expect(routeAnchorId('/game/news', '', '#surveys')).toBe('surveys');
    expect(routeAnchorId('/game', '', '#bad%ZZ')).toBe('bad%ZZ');
    expect(routeAnchorId('/game', '', '')).toBeNull();
  });

  it('waits for closed ancestors to open before navigating to an item', () => {
    const hidden = { closest: () => ({ tagName: 'DETAILS' }) } as unknown as Element;
    const visible = { closest: () => null } as unknown as Element;
    expect(isAnchorReady(hidden)).toBe(false);
    expect(isAnchorReady(visible)).toBe(true);
  });

  it('positions anchors below the visible mobile HUD without negative scrolling', () => {
    expect(anchorScrollTop(500, 300, 96)).toBe(688);
    expect(anchorScrollTop(20, 0, 96)).toBe(0);
    expect(anchorScrollTop(100, 100)).toBe(184);
  });
});
