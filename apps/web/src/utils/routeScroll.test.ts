import { describe, expect, it, beforeEach } from 'vitest';
import {
  anchorScrollTop,
  clearRouteScrollMemory,
  isAnchorReady,
  planRouteScroll,
  preservedRouteScrollTarget,
  rememberedPathScroll,
  rememberedRouteScroll,
  rememberPathScroll,
  rememberRouteScroll,
  routeAnchorId,
  shouldPreserveRouteScroll,
  type RouteScrollSnapshot,
} from './routeScroll.js';

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

describe('shared-shell scroll recovery', () => {
  it('restores once the new storefront is tall enough', () => {
    expect(preservedRouteScrollTarget(840, 1800, 600)).toEqual({ top: 840, settled: true });
  });

  it('clamps short loading views and waits for layout rather than repeatedly forcing scroll', () => {
    expect(preservedRouteScrollTarget(840, 1000, 600)).toEqual({ top: 400, settled: false });
    expect(preservedRouteScrollTarget(840, 1500, 600)).toEqual({ top: 840, settled: true });
  });

  it('handles top-of-page and content shorter than the viewport', () => {
    expect(preservedRouteScrollTarget(0, 250, 600)).toEqual({ top: 0, settled: true });
    expect(preservedRouteScrollTarget(20, 250, 600)).toEqual({ top: 0, settled: false });
  });
});

describe('returning to a history entry', () => {
  const previous: RouteScrollSnapshot = {
    pathname: '/game/scout',
    anchorId: null,
    key: 'scout',
    completed: true,
  };

  beforeEach(() => clearRouteScrollMemory());

  it('remembers an exact offset for a history entry', () => {
    rememberRouteScroll('quests', 1840);
    rememberRouteScroll('quests', -20);
    expect(rememberedRouteScroll('quests')).toBe(0);
    rememberRouteScroll('quests', 1840.4);
    expect(rememberedRouteScroll('quests')).toBe(1840.4);
    expect(rememberedRouteScroll('missing')).toBeUndefined();
    rememberPathScroll('/game/quests', 1840);
    expect(rememberedPathScroll('/game/quests')).toBe(1840);
    clearRouteScrollMemory();
    expect(rememberedPathScroll('/game/quests')).toBeUndefined();
    rememberRouteScroll('', 40);
    expect(rememberedRouteScroll('')).toBeUndefined();
  });

  it('restores the saved offset when coming back, including pages opened on a hash', () => {
    expect(planRouteScroll({
      navigationType: 'POP',
      pathname: '/game/quests',
      anchorId: 'contact-standing',
      locationKey: 'quests',
      previous,
      savedY: 1840,
      preserveSharedShell: false,
    })).toBe('restore');
  });

  it('restores a top-of-page offset instead of treating it as missing', () => {
    expect(planRouteScroll({
      navigationType: 'POP',
      pathname: '/game/quests',
      anchorId: null,
      locationKey: 'quests',
      previous,
      savedY: 0,
      preserveSharedShell: false,
    })).toBe('restore');
  });

  it('seeks a deep link on a fresh back navigation that has no saved offset', () => {
    expect(planRouteScroll({
      navigationType: 'POP',
      pathname: '/game/quests',
      anchorId: 'quest-FIRST_NIGHT_OUT',
      locationKey: 'quests',
      previous: null,
      savedY: undefined,
      preserveSharedShell: false,
    })).toBe('anchor');
  });

  it('leaves the browser alone when a back navigation has neither memory nor an anchor', () => {
    expect(planRouteScroll({
      navigationType: 'POP',
      pathname: '/game/quests',
      anchorId: null,
      locationKey: 'quests',
      previous: null,
      savedY: undefined,
      preserveSharedShell: false,
    })).toBe('leave');
  });

  it('still seeks an anchor and resets unrelated forward visits', () => {
    expect(planRouteScroll({
      navigationType: 'PUSH',
      pathname: '/game/quests',
      anchorId: 'contact-standing',
      locationKey: 'quests-hash',
      previous,
      savedY: 1840,
      preserveSharedShell: false,
    })).toBe('anchor');
    expect(planRouteScroll({
      navigationType: 'PUSH',
      pathname: '/game/produce',
      anchorId: null,
      locationKey: 'produce',
      previous,
      savedY: undefined,
      preserveSharedShell: false,
    })).toBe('top');
  });

  it('returns a tab or menu visit to the last offset on that screen', () => {
    expect(planRouteScroll({
      navigationType: 'PUSH',
      pathname: '/game/quests',
      anchorId: null,
      locationKey: 'quests-again',
      previous,
      savedY: undefined,
      savedPathY: 1840,
      preserveSharedShell: false,
    })).toBe('restore');
    expect(planRouteScroll({
      navigationType: 'REPLACE',
      pathname: '/game/quests',
      anchorId: null,
      locationKey: 'quests-replaced',
      previous,
      savedY: undefined,
      savedPathY: 0,
      preserveSharedShell: false,
    })).toBe('restore');
  });

  it('keeps a new anchor and a shared shell ahead of the saved path offset', () => {
    expect(planRouteScroll({
      navigationType: 'PUSH',
      pathname: '/game/quests',
      anchorId: 'contact-standing',
      locationKey: 'quests-hash',
      previous,
      savedY: undefined,
      savedPathY: 1840,
      preserveSharedShell: false,
    })).toBe('anchor');
    expect(planRouteScroll({
      navigationType: 'PUSH',
      pathname: '/game/stores/charlie',
      anchorId: null,
      locationKey: 'charlie',
      previous: { ...previous, pathname: '/game/stores/pip', key: 'pip' },
      savedY: undefined,
      savedPathY: 20,
      preserveSharedShell: true,
    })).toBe('preserve');
  });

  it('keeps a shared shell in place and ignores search changes on the current page', () => {
    expect(planRouteScroll({
      navigationType: 'PUSH',
      pathname: '/game/stores/charlie',
      anchorId: null,
      locationKey: 'charlie',
      previous: { ...previous, pathname: '/game/stores/pip', key: 'pip' },
      savedY: undefined,
      preserveSharedShell: true,
    })).toBe('preserve');
    expect(planRouteScroll({
      navigationType: 'PUSH',
      pathname: '/game/scout',
      anchorId: null,
      locationKey: 'scout-filtered',
      previous,
      savedY: 400,
      preserveSharedShell: false,
    })).toBe('ignore');
  });

  it('retries an unfinished return after a cancelled pass, and does not repeat a finished one', () => {
    const returning = {
      navigationType: 'POP' as const,
      pathname: '/game/quests',
      anchorId: null,
      locationKey: 'quests',
      savedY: 1840,
      preserveSharedShell: false,
    };
    expect(planRouteScroll({
      ...returning,
      previous: { pathname: '/game/quests', anchorId: null, key: 'quests', completed: false },
    })).toBe('restore');
    expect(planRouteScroll({
      ...returning,
      previous: { pathname: '/game/quests', anchorId: null, key: 'quests', completed: true },
    })).toBe('ignore');
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
