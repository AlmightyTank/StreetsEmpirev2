import { describe, expect, it } from 'vitest';
import {
  compareEmbed,
  escapeMarkdown,
  formatRemaining,
  hallOfFameEmbed,
  helpEmbed,
  memberEmbed,
  newsEmbed,
  profileEmbed,
  rankingsEmbed,
  roundEmbed,
  syncAllText,
  syncMemberText,
  truncate,
} from '../format.js';
import type { ProfileCard } from '../game-api.js';

const origin = 'https://streetsempire.dev';

const card: ProfileCard = {
  roundName: 'Game #008',
  displayName: '*Big*_Daddy',
  publicPimpId: 1842,
  city: 'Detroit',
  netWorthCents: 123_456_78,
  rank: { local: 2, national: 5, nationalMovement: 3 },
  legacy: { roundsPlayed: 2, roundWins: 1, bestNationalRank: 1 },
  badges: [
    { key: 'past-winner', title: 'Past Winner', description: 'd', rarity: 'legendary', permanent: true },
    { key: 'enforcer', title: 'Enforcer', description: 'd', rarity: 'uncommon', permanent: false },
  ],
  profileUrl: `${origin}/game/players/1842`,
  forumProfileUrl: 'https://forum.streetsempire.dev/street-empire/u/1',
};

describe('helpers', () => {
  it('escapes markdown and links in player text', () => {
    expect(escapeMarkdown('*Big*_Daddy [x](y)')).toBe('\\*Big\\*\\_Daddy \\[x\\]\\(y\\)');
  });

  it('truncates with an ellipsis within the limit', () => {
    expect(truncate('abcdef', 4)).toBe('abc…');
    expect(truncate('abc', 4)).toBe('abc');
  });

  it('formats time remaining', () => {
    expect(formatRemaining(0)).toBe('Ended');
    expect(formatRemaining(30_000)).toBe('1m');
    expect(formatRemaining(90 * 60_000)).toBe('1h 30m');
    expect(formatRemaining((3 * 24 + 4) * 3_600_000)).toBe('3d 4h');
  });
});

describe('profileEmbed', () => {
  it('shows public stats, badges with the permanent marker and the forum link', () => {
    const embed = profileEmbed(card);
    expect(embed.url).toBe(card.profileUrl);
    expect(embed.fields).toEqual(expect.arrayContaining([
      // Whole dollars, like everywhere else in the game.
      { name: 'Net worth', value: '$123,456', inline: true },
      { name: 'National rank', value: '#5 ▲3', inline: true },
      { name: 'Badges', value: '◆ Past Winner · Enforcer' },
      { name: 'Legacy', value: '2 past rounds · 1 wins · best #1' },
      { name: 'Forum', value: `[Forum profile](${card.forumProfileUrl})` },
    ]));
  });

  it('never shows the forum field without a link, and handles no badges', () => {
    const embed = profileEmbed({ ...card, badges: [], forumProfileUrl: null });
    expect(embed.fields!.find((field) => field.name === 'Badges')!.value).toBe('None yet');
    expect(embed.fields!.some((field) => field.name === 'Forum')).toBe(false);
  });
});

describe('rankingsEmbed', () => {
  it('lists escaped, linked entries with movement', () => {
    const embed = rankingsEmbed({
      round: { name: 'Game #008', status: 'ACTIVE', endsAt: '2026-10-11T00:00:00.000Z' },
      entries: [
        { rank: 1, publicPimpId: 1, displayName: '[evil](http://x)', city: 'Detroit', netWorthCents: 500_00, movement: -2, profileUrl: `${origin}/game/players/1` },
      ],
    }, origin);
    expect(embed.description).toBe(`**#1** [\\[evil\\]\\(http://x\\)](${origin}/game/players/1) · $500 · Detroit ▼2`);
  });

  it('handles no round and an empty round', () => {
    expect(rankingsEmbed({ round: null, entries: [] }, origin).title).toBe('No game running');
    expect(rankingsEmbed({ round: { name: 'R', status: 'ACTIVE', endsAt: '' }, entries: [] }, origin).description).toBe('Nobody has joined this round yet.');
  });
});

describe('roundEmbed and newsEmbed', () => {
  it('summarizes the round', () => {
    const embed = roundEmbed({
      round: { name: 'Game #008', status: 'REGISTRATION', msRemaining: 3_600_000, playerCount: 12 },
      ruleset: { name: 'Classic OG' },
      turns: { amountPerInterval: 2, intervalMinutes: 10, cap: 200 },
    }, origin);
    expect(embed.fields!.map((field) => field.value)).toEqual(['Registration open', '1h 0m', '12', '+2 every 10 min, up to 200', 'Classic OG']);
    expect(roundEmbed({ round: null, ruleset: null, turns: null }, origin).title).toBe('No game running');
  });

  it('shows at most five posts within Discord field limits', () => {
    const post = { title: 't'.repeat(300), body: 'b'.repeat(5000), isPinned: true, publishedAt: '2026-09-13T12:00:00.000Z', authorName: 'Admin' };
    const embed = newsEmbed({ news: Array.from({ length: 8 }, () => post) }, origin);
    expect(embed.fields).toHaveLength(5);
    for (const field of embed.fields!) {
      expect(field.name.length).toBeLessThanOrEqual(256);
      expect(field.value.length).toBeLessThanOrEqual(1024);
    }
    expect(newsEmbed({ news: [] }, origin).description).toBe('No round news has been posted yet.');
  });
});

describe('city rankings', () => {
  it('names the city in the title and the empty state', () => {
    const embed = rankingsEmbed({ round: { name: 'Game #008', status: 'ACTIVE', endsAt: '' }, city: { slug: 'detroit', name: 'Detroit' }, entries: [] }, origin);
    expect(embed.title).toBe('Game #008 · Detroit · Top 10');
    expect(embed.description).toBe('Nobody in Detroit has joined this round yet.');
  });
});

describe('compareEmbed', () => {
  const rival: ProfileCard = { ...card, displayName: 'Rival', publicPimpId: 7, netWorthCents: 100_000_00, badges: [], forumProfileUrl: null };

  it('puts two escaped columns side by side and names the leader', () => {
    const embed = compareEmbed(card, rival);
    expect(embed.title).toBe('*Big*_Daddy vs Rival');
    expect(embed.description).toBe('Game \\#008 · \\*Big\\*\\_Daddy leads by $23,456.');
    expect(embed.fields!.map((field) => [field.name, field.inline])).toEqual([['*Big*_Daddy (#1842)', true], ['Rival (#7)', true]]);
    expect(embed.fields![0]!.value).toBe([
      '**$123,456**', 'National #5 ▲3', 'Detroit #2', 'Badges: ◆ Past Winner · Enforcer', 'Legacy: 1 wins · best #1', `[Profile](${card.profileUrl})`,
    ].join('\n'));
    expect(embed.fields![1]!.value).toContain('Badges: None yet');
  });

  it('calls a tie', () => {
    expect(compareEmbed(card, card).description).toBe('Game \\#008 · Dead even on net worth.');
  });
});

describe('hallOfFameEmbed', () => {
  it('shows each finished round podium with medals, ties included', () => {
    const embed = hallOfFameEmbed({ rounds: [
      { name: 'Game #007', endedAt: '2026-09-01T00:00:00.000Z', podium: [
        { rank: 1, displayName: 'King_Pin', netWorthCents: 9_000_000_00, city: 'Detroit' },
        { rank: 1, displayName: 'Tie', netWorthCents: 9_000_000_00, city: 'Detroit' },
        { rank: 3, displayName: 'Third', netWorthCents: 1_00, city: 'Chicago' },
      ] },
      { name: 'Game #006', endedAt: '2026-08-01T00:00:00.000Z', podium: [] },
    ] }, origin);
    expect(embed.fields![0]).toEqual({
      name: 'Game #007 · 2026-09-01',
      value: '🥇 King\\_Pin · $9,000,000 · Detroit\n🥇 Tie · $9,000,000 · Detroit\n🥉 Third · $1 · Chicago',
    });
    expect(embed.fields![1]!.value).toBe('No final standings recorded.');
    expect(hallOfFameEmbed({ rounds: [] }, origin).description).toMatch(/^No round has finished yet/);
  });
});

describe('memberEmbed', () => {
  it('explains how to link when not linked', () => {
    const embed = memberEmbed({ linked: false, username: null, forumUsername: null, roundName: null, player: null, roles: [] }, [], origin);
    expect(embed.title).toBe('Discord not linked');
    expect(embed.description).toContain(`${origin}/account`);
  });

  it('shows the account, forum, round and qualifying roles', () => {
    const notJoined = memberEmbed({ linked: true, username: 'big_daddy', forumUsername: null, roundName: 'Game #008', player: null, roles: ['linked'] }, ['Linked'], origin);
    expect(notJoined.fields).toEqual([
      { name: 'Game account', value: 'big\\_daddy', inline: true },
      { name: 'Forum', value: 'Not linked', inline: true },
      { name: 'This round (Game #008)', value: `Not joined yet · [Join](${origin}/join)` },
      { name: 'Roles you qualify for', value: 'Linked' },
    ]);

    const playing = memberEmbed({
      linked: true, username: 'big_daddy', forumUsername: 'Big', roundName: 'Game #008',
      player: { displayName: 'Big Daddy', publicPimpId: 1842, profileUrl: `${origin}/game/players/1842` }, roles: ['linked', 'player'],
    }, ['Linked', 'Player'], origin);
    expect(playing.fields![2]!.value).toBe(`[Big Daddy (#1842)](${origin}/game/players/1842)`);
    expect(playing.fields![3]!.value).toBe('Linked, Player');
  });
});

describe('help and sync text', () => {
  it('lists every help line', () => {
    expect(helpEmbed(origin).description!.split('\n')).toHaveLength(11);
  });

  it('summarizes role changes', () => {
    expect(syncMemberText({ added: ['Player'], removed: ['Top 10'], failed: false })).toBe('Added: Player\nRemoved: Top 10');
    expect(syncMemberText({ added: [], removed: [], failed: false })).toBe('Your roles are already up to date.');
    expect(syncAllText({ members: 12, added: 3, removed: 1, failed: 0 })).toBe('Synced 12 members: 3 roles added, 1 removed.');
    expect(syncAllText({ members: 12, added: 3, removed: 1, failed: 2 })).toBe('Synced 12 members: 3 roles added, 1 removed. 2 members could not be updated; check the bot log.');
  });
});
