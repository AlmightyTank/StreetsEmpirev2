import { describe, expect, it } from 'vitest';
import type { PublicLegacyDto } from '@streets/shared';
import { botTokenMatches, competitionRanks, roleKeysFor } from '../discord-bot.service.js';

const token = 'bot-token-'.repeat(8);
const legacy = (overrides: Partial<PublicLegacyDto> = {}): PublicLegacyDto => ({
  roundsPlayed: 0, roundWins: 0, bestNationalRank: null, totalFinalNetWorthCents: 0, ...overrides,
});

describe('botTokenMatches', () => {
  it('accepts only the exact bearer token', () => {
    expect(botTokenMatches(`Bearer ${token}`, token)).toBe(true);
    for (const header of [undefined, '', token, `bearer ${token}`, `Bearer ${token}x`, 'Bearer ', `Basic ${token}`]) {
      expect(botTokenMatches(header, token)).toBe(false);
    }
  });

  it('never matches when the bot API is disabled', () => {
    expect(botTokenMatches('Bearer ', '')).toBe(false);
    expect(botTokenMatches(`Bearer ${token}`, '')).toBe(false);
  });
});

describe('competitionRanks', () => {
  it('shares ranks on ties and skips the tied positions', () => {
    const rows = [500n, 300n, 300n, 100n, 100n, 50n].map((netWorthCents) => ({ netWorthCents }));
    expect(competitionRanks(rows)).toEqual([1, 2, 2, 4, 4, 6]);
    expect(competitionRanks([])).toEqual([]);
  });
});

describe('roleKeysFor', () => {
  it('gives every linked account "linked", and "player" only in the round', () => {
    expect(roleKeysFor({ inRound: false, nationalRank: null, legacy: legacy(), forumGroups: [] })).toEqual(['linked']);
    expect(roleKeysFor({ inRound: true, nationalRank: 42, legacy: legacy(), forumGroups: [] })).toEqual(['linked', 'player']);
  });

  it('adds rank roles, earned legacy roles and forum group roles', () => {
    expect(roleKeysFor({
      inRound: true,
      nationalRank: 1,
      legacy: legacy({ roundsPlayed: 4, roundWins: 3, bestNationalRank: 1 }),
      forumGroups: [{ name: 'Admin', color: '#b72a2a' }],
    })).toEqual(['linked', 'player', 'national-1', 'top-10', 'veteran', 'past-winner', 'hall-of-fame', 'top-finisher', 'forum:Admin']);

    expect(roleKeysFor({ inRound: true, nationalRank: 10, legacy: legacy({ roundsPlayed: 1, bestNationalRank: 11 }), forumGroups: [] }))
      .toEqual(['linked', 'player', 'top-10', 'veteran']);
    expect(roleKeysFor({ inRound: true, nationalRank: 11, legacy: legacy(), forumGroups: [] })).not.toContain('top-10');
  });
});
