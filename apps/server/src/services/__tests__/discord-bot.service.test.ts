import { describe, expect, it } from 'vitest';
import type { PublicLegacyDto } from '@streets/shared';
import { botTokenMatches, roleKeysFor } from '../discord-bot.service.js';
import { rankAlertFor, reminderDecision } from '../notification.service.js';
import { competitionRanks, rankValues } from '../standings.js';

const token = 'bot-token-'.repeat(8);
const legacy = (overrides: Partial<PublicLegacyDto> = {}): PublicLegacyDto => ({
  roundsPlayed: 0,
  roundWins: 0,
  topTenFinishes: 0,
  podiumFinishes: 0,
  bestNationalRank: null,
  bestLocalRank: null,
  totalFinalNetWorthCents: 0,
  ...overrides,
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
      legacy: legacy({ roundsPlayed: 4, roundWins: 3, topTenFinishes: 3, bestNationalRank: 1 }),
      forumGroups: [{ name: 'Admin', color: '#b72a2a' }],
    })).toEqual(['linked', 'player', 'national-1', 'top-10', 'veteran', 'past-winner', 'hall-of-fame', 'top-finisher', 'forum:Admin']);

    expect(roleKeysFor({ inRound: true, nationalRank: 10, legacy: legacy({ roundsPlayed: 1, bestNationalRank: 11 }), forumGroups: [] }))
      .toEqual(['linked', 'player', 'top-10', 'veteran']);
    expect(roleKeysFor({ inRound: true, nationalRank: 11, legacy: legacy(), forumGroups: [] })).not.toContain('top-10');
  });

  it('adds beta tester when enabled for Discord-linked beta accounts', () => {
    expect(roleKeysFor({ inRound: false, nationalRank: null, legacy: legacy(), forumGroups: [], betaTester: true }))
      .toEqual(['linked', 'beta-tester']);
  });

  it('adds the alliance role only for players in the round', () => {
    expect(roleKeysFor({ inRound: true, nationalRank: 3, legacy: legacy(), forumGroups: [], allianceTag: 'esk' })).toEqual(['linked', 'player', 'alliance:ESK', 'top-10']);
    expect(roleKeysFor({ inRound: false, nationalRank: null, legacy: legacy(), forumGroups: [], allianceTag: 'ESK' })).toEqual(['linked']);
  });
});

describe('reminderDecision', () => {
  it('arms below the cap, notifies once on reaching it, then waits for the next drop', () => {
    expect(reminderDecision({ armed: false, turns: 100, cap: 144 })).toBe('arm');
    expect(reminderDecision({ armed: true, turns: 143, cap: 144 })).toBe('none');
    expect(reminderDecision({ armed: true, turns: 144, cap: 144 })).toBe('notify');
    expect(reminderDecision({ armed: false, turns: 144, cap: 144 })).toBe('none');
    expect(reminderDecision({ armed: false, turns: 150, cap: 144 })).toBe('none');
  });
});

describe('rankValues', () => {
  it('ranks plain counts the same way as net worth', () => {
    expect(rankValues([9, 7, 7, 3])).toEqual([1, 2, 2, 4]);
    expect(rankValues([])).toEqual([]);
  });
});

describe('rankAlertFor', () => {
  it('alerts on losing #1 or falling out of the top 10, never on the way up', () => {
    expect(rankAlertFor(1, 2)).toBe('lost-first');
    expect(rankAlertFor(1, 40)).toBe('lost-first');
    expect(rankAlertFor(10, 11)).toBe('out-of-top-10');
    expect(rankAlertFor(4, 9)).toBeNull();
    expect(rankAlertFor(12, 30)).toBeNull();
    expect(rankAlertFor(2, 1)).toBeNull();
    expect(rankAlertFor(1, 1)).toBeNull();
    expect(rankAlertFor(null, 50)).toBeNull();
  });
});
