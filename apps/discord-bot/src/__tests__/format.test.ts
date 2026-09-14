import { describe, expect, it } from 'vitest';
import { escapeMarkdown, formatRemaining, newsEmbed, profileEmbed, rankingsEmbed, roundEmbed, truncate } from '../format.js';
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
