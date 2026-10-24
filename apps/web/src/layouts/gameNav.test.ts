import { describe, expect, it } from 'vitest';
import { ADMIN_SECTIONS, adminOverviewSectionsFor, adminSectionsFor, DEFAULT_TABS, filterNavSections, isCurrent, SECTIONS } from './gameNav.js';

const pages = SECTIONS.flatMap((section) => section.pages);
const page = (key: string) => {
  const found = pages.find((candidate) => candidate.key === key);
  if (!found) throw new Error(`Missing nav page ${key}`);
  return found;
};

describe('consolidated game navigation', () => {
  it('makes the core loop immediately accessible and gives Quests a primary shortcut', () => {
    expect(SECTIONS[0]).toMatchObject({ id: 'command', title: 'Command' });
    expect(SECTIONS[0]!.pages.map((item) => item.key)).toEqual([
      'dashboard', 'quests', 'scout', 'produce', 'raids', 'operations', 'black-book',
    ]);
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
      .toEqual(['hideout', 'armory', 'crew-roster', 'dealers', 'stores', 'supply', 'loans', 'travel', 'turf']);
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
    expect(adminPages).toHaveLength(26);
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

  it('shows each staff role only the admin pages it can use', () => {
    const keys = (role: Parameters<typeof adminSectionsFor>[0]) => adminSectionsFor(role).flatMap((section) => section.pages.map((page) => page.key));
    expect(keys(null)).toEqual([]);
    expect(keys('FOUNDER')).toHaveLength(adminPages.length);
    expect(keys('ADMIN')).toHaveLength(adminPages.length);
    expect(keys('MOD')).toEqual(['admin-accounts', 'admin-staff', 'admin-reports', 'admin-bugs']);
    expect(keys('JR_MOD')).toEqual(['admin-accounts', 'admin-staff', 'admin-reports', 'admin-bugs']);
    expect(keys('HELPER')).toEqual(['admin-accounts', 'admin-staff', 'admin-bugs']);
    expect(adminSectionsFor('HELPER').map((section) => section.id)).toEqual(['admin-players']);
  });

  it('condenses the admin sidebar to one destination per work area', () => {
    const overview = adminOverviewSectionsFor('ADMIN');
    expect(overview).toHaveLength(5);
    expect(overview.flatMap((section) => section.pages)).toHaveLength(5);
    expect(isCurrent(overview[1]!.pages[0]!, '/game/admin/accounts/account-id')).toBe(true);
    expect(isCurrent(overview[0]!.pages[0]!, '/game/admin/rounds/round-id')).toBe(true);
  });
});
