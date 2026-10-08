import { describe, expect, it } from 'vitest';
import { isCurrent, newPlayerSectionsFor, SECTIONS } from './gameNav.js';

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

describe('new player navigation model', () => {
  it('puts the core loop in the first open section', () => {
    const sections = newPlayerSectionsFor(SECTIONS);
    expect(sections[0]).toMatchObject({
      id: 'new-player-core',
      title: 'Start Here',
    });
    expect(sections[0]!.pages.map((item) => item.key)).toEqual([
      'dashboard',
      'scout',
      'stores',
      'produce',
      'raids',
      'quests',
    ]);
  });

  it('tucks later systems away without removing them from the nav directory', () => {
    const sections = newPlayerSectionsFor(SECTIONS);
    const next = sections.find((section) => section.id === 'new-player-next');
    expect(next?.defaultOpen).toBe(false);
    expect(next?.pages.map((item) => item.key)).toEqual([
      'hideout',
      'travel',
      'turf',
      'casino',
      'street-pass',
    ]);
  });
});
