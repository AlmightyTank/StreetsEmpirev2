import { describe, expect, it } from 'vitest';
import { shouldPreserveRouteScroll } from './routeScroll.js';

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
