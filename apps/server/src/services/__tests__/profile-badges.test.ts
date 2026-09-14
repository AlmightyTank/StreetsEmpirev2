import { describe, expect, it } from 'vitest';
import type { PublicAwardDto } from '@streets/shared';
import { selectProfileBadges } from '../profile-badges.js';
import { ForumGroupsService, parseForumGroups } from '../forum-groups.service.js';

function award(key: string, rarity: PublicAwardDto['rarity'], category: PublicAwardDto['category'], unlocked = true): PublicAwardDto {
  return { key, title: key, description: `${key} description`, category, rarity, unlocked, earnedAt: null, progress: null };
}

describe('selectProfileBadges', () => {
  it('puts earned legacy badges first, then this round rarest first, skipping locked ones', () => {
    const badges = selectProfileBadges([
      award('first-stack', 'common', 'wealth'),
      award('veteran', 'common', 'legacy'),
      award('millionaire', 'epic', 'wealth'),
      award('national-number-one', 'legendary', 'rank', false),
      award('past-winner', 'legendary', 'legacy'),
      award('enforcer', 'uncommon', 'combat'),
    ]);
    expect(badges.map((badge) => [badge.key, badge.permanent])).toEqual([
      ['past-winner', true],
      ['veteran', true],
      ['millionaire', false],
      ['enforcer', false],
      ['first-stack', false],
    ]);
  });

  it('caps the strip and keeps equal rarities in their original order', () => {
    const awards = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((key) => award(key, 'common', 'combat'));
    expect(selectProfileBadges(awards).map((badge) => badge.key)).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    expect(selectProfileBadges(awards, 2)).toHaveLength(2);
  });

  it('shares only public badge fields', () => {
    expect(Object.keys(selectProfileBadges([award('veteran', 'common', 'legacy')])[0]!).sort())
      .toEqual(['category', 'description', 'key', 'permanent', 'rarity', 'title']);
  });
});

const group = (id: string, attributes: Record<string, unknown>) => ({ type: 'groups', id, attributes: { nameSingular: `Group ${id}`, ...attributes } });
const userDocument = (memberOf: string[], included: unknown[]) => ({
  data: { type: 'users', id: '1', relationships: { groups: { data: memberOf.map((id) => ({ type: 'groups', id })) } } },
  included,
});

describe('parseForumGroups', () => {
  it('keeps visible groups the user belongs to, with safe hex colors only', () => {
    expect(parseForumGroups(userDocument(['1', '2', '3'], [
      group('1', { nameSingular: 'Admin', color: '#B72A2A', isHidden: 0 }),
      group('2', { nameSingular: 'Secret', color: '#fff', isHidden: 1 }),
      group('3', { nameSingular: 'Mod', color: 'red;background:url(x)' }),
      group('4', { nameSingular: 'Not a member', color: '#000' }),
      { type: 'tags', id: '1', attributes: { nameSingular: 'Not a group' } },
    ]))).toEqual([
      { name: 'Admin', color: '#B72A2A' },
      { name: 'Mod', color: null },
    ]);
  });

  it('caps at three groups and ignores malformed documents', () => {
    const ids = ['1', '2', '3', '4'];
    expect(parseForumGroups(userDocument(ids, ids.map((id) => group(id, {}))))).toHaveLength(3);
    for (const body of [null, 'nope', {}, { data: null }, userDocument(['1'], [group('1', { nameSingular: '' })])]) {
      expect(parseForumGroups(body)).toEqual([]);
    }
  });
});

describe('ForumGroupsService.groupsFor', () => {
  it('caches results, briefly caches failures, and never fetches invalid IDs', async () => {
    let now = 1_000_000;
    let calls = 0;
    const ok = (async () => {
      calls += 1;
      return new Response(JSON.stringify(userDocument(['1'], [group('1', { nameSingular: 'Admin', color: '#b72a2a' })])));
    }) as typeof fetch;
    const failing = (async () => { calls += 1; throw new Error('forum down'); }) as typeof fetch;

    expect(await ForumGroupsService.groupsFor('9100001', { fetch: ok, now: () => now })).toEqual([{ name: 'Admin', color: '#b72a2a' }]);
    expect(await ForumGroupsService.groupsFor('9100001', { fetch: ok, now: () => now + 60_000 })).toHaveLength(1);
    expect(calls).toBe(1);

    expect(await ForumGroupsService.groupsFor('9100002', { fetch: failing, now: () => now })).toEqual([]);
    expect(await ForumGroupsService.groupsFor('9100002', { fetch: ok, now: () => now + 10_000 })).toEqual([]);
    now += 31_000;
    expect(await ForumGroupsService.groupsFor('9100002', { fetch: ok, now: () => now })).toHaveLength(1);
    expect(calls).toBe(3);

    for (const id of ['0', '../admin', '1e5']) expect(await ForumGroupsService.groupsFor(id, { fetch: ok })).toEqual([]);
    expect(calls).toBe(3);
  });
});
