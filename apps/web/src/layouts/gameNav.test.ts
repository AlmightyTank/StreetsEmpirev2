import { describe, expect, it } from 'vitest';
import { ADMIN_SECTIONS, DEFAULT_TABS, filterNavSections, isCurrent, newPlayerSectionsFor, SECTIONS } from './gameNav.js';

const pages = SECTIONS.flatMap((section) => section.pages);
const page = (key: string) => {
  const found = pages.find((candidate) => candidate.key === key);
  if (!found) throw new Error(`Missing nav page ${key}`);
  return found;
};

describe('consolidated game navigation', () => {
  it('makes the core loop immediately accessible and gives Quests a primary shortcut', () => {
    expect(SECTIONS[0]).toMatchObject({ id: 'command', title: 'Command' });
    expect(SECTIONS[0]!.pages.map((item) => item.key)).toEqual(['dashboard', 'quests', 'scout', 'produce', 'raids']);
    expect(DEFAULT_TABS).toEqual(['dashboard', 'quests', 'scout', 'stores']);
  });

  it('does not duplicate or lose a page while reorganizing', () => {
    expect(new Set(pages.map((item) => item.key)).size).toBe(pages.length);
    expect(new Set(pages.map((item) => item.to)).size).toBe(pages.length);
    expect(SECTIONS.map((section) => section.title)).toEqual([
      'Command', 'Build Your Empire', 'Competition', 'Progress & Rewards', 'Messages & News', 'Help & Settings',
    ]);
  });

  it('searches by section or page without mutating menu contents', () => {
    expect(filterNavSections(SECTIONS, '  piP  ')).toEqual([]);
    expect(filterNavSections(SECTIONS, ' STORES ').flatMap((section) => section.pages.map((item) => item.key))).toEqual(['stores']);
    expect(filterNavSections(SECTIONS, 'your empire').flatMap((section) => section.pages.map((item) => item.key)))
      .toEqual(['hideout', 'crew-roster', 'dealers', 'stores', 'supply', 'loans', 'travel', 'turf']);
    expect(filterNavSections(SECTIONS, '').flatMap((section) => section.pages)).toEqual(pages);
  });
});

describe('game navigation route matching', () => {
  it('keeps game-specific nested routes with their destination', () => {
    expect(isCurrent(page('casino'), '/game/casino/blackjack')).toBe(true);
    expect(isCurrent(page('stores'), '/game/stores/pip')).toBe(true);
    expect(isCurrent(page('players'), '/game/players/123')).toBe(true);
    expect(isCurrent(page('alliance'), '/game/alliances/kings')).toBe(true);
    expect(isCurrent(page('casino'), '/game/admin/casino')).toBe(false);
  });

  it('preserves legacy route aliases and direct navigation', () => {
    expect(isCurrent(page('quests'), '/game/reputation')).toBe(true);
    expect(isCurrent(page('console'), '/game/activity')).toBe(true);
    expect(isCurrent(page('news'), '/game/surveys')).toBe(true);
    expect(isCurrent(page('rankings'), '/game/hall-of-fame')).toBe(true);
  });
});

describe('admin workspace navigation', () => {
  const adminPages = ADMIN_SECTIONS.flatMap((section) => section.pages);

  it('groups every admin tool once into the five operator work areas', () => {
    expect(ADMIN_SECTIONS.map((section) => section.title)).toEqual([
      'Admin · Operations', 'Admin · Players', 'Admin · Economy', 'Admin · Content', 'Admin · Monitoring',
    ]);
    expect(adminPages).toHaveLength(24);
    expect(new Set(adminPages.map((item) => item.key)).size).toBe(adminPages.length);
    expect(new Set(adminPages.map((item) => item.to)).size).toBe(adminPages.length);
  });

  it('keeps player and account detail URLs in the Players work area', () => {
    const accounts = adminPages.find((page) => page.key === 'admin-accounts')!;
    expect(isCurrent(accounts, '/game/admin/accounts/account-id')).toBe(true);
    expect(isCurrent(accounts, '/game/admin/players/player-id')).toBe(true);
  });

  it('does not put restricted admin destinations in ordinary player sections', () => {
    expect(SECTIONS.flatMap((section) => section.pages).some((page) => page.to.startsWith('/game/admin'))).toBe(false);
  });
});

describe('new player navigation model', () => {
  it('keeps the story quest in the first open section', () => {
    const sections = newPlayerSectionsFor(SECTIONS);
    expect(sections[0]).toMatchObject({ id: 'new-player-core', title: 'Start Here', defaultOpen: true });
    expect(sections[0]!.pages.map((item) => item.key)).toEqual([
      'dashboard', 'quests', 'scout', 'produce', 'raids', 'stores',
    ]);
    expect(sections.slice(1).every((section) => section.defaultOpen === false)).toBe(true);
  });

  it('keeps every full-menu page reachable exactly once', () => {
    const shown = newPlayerSectionsFor(SECTIONS).flatMap((section) => section.pages.map((item) => item.key));
    expect(shown).toHaveLength(pages.length);
    expect(new Set(shown)).toEqual(new Set(pages.map((item) => item.key)));
  });

  it('does not add empty gated groups for players without a Street Pass', () => {
    const withoutPass = SECTIONS.map((section) => ({
      ...section,
      pages: section.pages.filter((item) => item.key !== 'street-pass'),
    }));
    expect(newPlayerSectionsFor(withoutPass).flatMap((section) => section.pages.map((item) => item.key)))
      .not.toContain('street-pass');
  });
});
