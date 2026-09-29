import { describe, expect, it } from 'vitest';
import { allianceRoles, betaTesterRoles, managedRoles, normalizeRoleKey, parseForumGroupList, planRoleChanges, roleNamesForKeys, staleAllianceRoleNames } from '../roles.js';

describe('parseForumGroupList', () => {
  it('trims, drops blanks and case-insensitive duplicates, and caps the list', () => {
    expect(parseForumGroupList(' Admin, mod,,admin ,Mod ')).toEqual(['Admin', 'mod']);
    expect(parseForumGroupList('')).toEqual([]);
    expect(parseForumGroupList(Array.from({ length: 15 }, (_, i) => `G${i}`).join(','))).toHaveLength(10);
    expect(parseForumGroupList(`${'x'.repeat(41)},Ok`)).toEqual(['Ok']);
  });
});

describe('managedRoles', () => {
  it('owns the fixed roles plus one "Forum <group>" role per configured group', () => {
    const roles = managedRoles(['Admin']);
    expect(roles.map((role) => role.name)).toEqual([
      'Linked', 'Player', 'National #1', 'Top 10', 'Veteran', 'Top Finisher', 'Past Winner', 'Hall of Fame', 'Kingpin', 'Forum Admin',
    ]);
    expect(roles.at(-1)!.key).toBe('forum:admin');
  });
});

describe('betaTesterRoles', () => {
  it('owns only the Beta Tester role for beta-only sync', () => {
    expect(betaTesterRoles()).toEqual([
      { key: 'beta-tester', name: 'Beta Tester', color: 0x60a5fa },
    ]);
  });
});

describe('normalizeRoleKey', () => {
  it('lowercases only forum group names', () => {
    expect(normalizeRoleKey('forum:Admin')).toBe('forum:admin');
    expect(normalizeRoleKey('top-10')).toBe('top-10');
  });
});

describe('planRoleChanges', () => {
  const managed = ['linked', 'player', 'top-10', 'forum:admin'];

  it('adds missing and removes stale managed roles', () => {
    expect(planRoleChanges(managed, new Set(['linked', 'top-10']), new Set(['linked', 'player'])))
      .toEqual({ add: ['player'], remove: ['top-10'] });
  });

  it('removes every managed role from an unlinked member, and ignores unmanaged keys', () => {
    expect(planRoleChanges(managed, new Set(['linked', 'forum:admin']), new Set()))
      .toEqual({ add: [], remove: ['linked', 'forum:admin'] });
    expect(planRoleChanges(managed, new Set(), new Set(['forum:mod', 'player'])))
      .toEqual({ add: ['player'], remove: [] });
  });
});

describe('roleNamesForKeys', () => {
  it('names managed roles in display order and skips unmanaged keys', () => {
    expect(roleNamesForKeys(['top-10', 'forum:Admin', 'linked', 'forum:Mod', 'unknown'], managedRoles(['Admin'])))
      .toEqual(['Linked', 'Top 10', 'Forum Admin']);
  });

  it('names alliance roles from their keys', () => {
    expect(roleNamesForKeys(['player', 'alliance:ESK'], managedRoles([]))).toEqual(['Player', 'Alliance [ESK]']);
  });
});

describe('allianceRoles', () => {
  it('owns one "Alliance [TAG]" role per live alliance, ignoring bad and duplicate tags', () => {
    expect(allianceRoles([{ tag: 'esk' }, { tag: 'WC' }, { tag: 'ESK' }, { tag: 'no spaces' }, { tag: 'TOOLONG' }]))
      .toEqual([
        { key: 'alliance:ESK', name: 'Alliance [ESK]', color: null },
        { key: 'alliance:WC', name: 'Alliance [WC]', color: null },
      ]);
  });
});

describe('staleAllianceRoleNames', () => {
  it('retires alliance roles that are no longer live and never touches anything else', () => {
    const live = allianceRoles([{ tag: 'ESK' }]);
    expect(staleAllianceRoleNames(['Alliance [ESK]', 'Alliance [OLD]', 'Alliance [old]', 'Alliance Leaders', 'Player', 'Forum Admin', 'Alliance [TOOLONG]'], live))
      .toEqual(['Alliance [OLD]']);
    expect(staleAllianceRoleNames(['Alliance [ESK]'], [])).toEqual(['Alliance [ESK]']);
  });
});
