import { describe, expect, it } from 'vitest';
import { isCurrent, SECTIONS } from './gameNav.js';

const pages = SECTIONS.flatMap((section) => section.pages);
const page = (key: string) => {
  const found = pages.find((candidate) => candidate.key === key);
  if (!found) throw new Error(`Missing nav page ${key}`);
  return found;
};

describe('game navigation route matching', () => {
  it('keeps the Casino nav and phone tab active on casino game routes', () => {
    expect(isCurrent(page('casino'), '/game/casino')).toBe(true);
    expect(isCurrent(page('casino'), '/game/casino/slots')).toBe(true);
    expect(isCurrent(page('casino'), '/game/casino/blackjack')).toBe(true);
  });

  it('does not let the Casino tab claim other casino-labeled pages', () => {
    expect(isCurrent(page('casino'), '/game/admin/casino')).toBe(false);
  });

  it('still keeps other detail routes attached to their top-level tabs', () => {
    expect(isCurrent(page('stores'), '/game/stores/pip')).toBe(true);
    expect(isCurrent(page('players'), '/game/players/123')).toBe(true);
    expect(isCurrent(page('alliance'), '/game/alliances/kings')).toBe(true);
  });
});
