import { describe, expect, it } from 'vitest';
import { SPORTSBOOK_LIMITS, sportsbookLineReason, sportsbookPayoutCents, sportsbookReturnCents } from '@streets/shared';
import { classicOgV18E, classicOgV26K, rulesets } from '@streets/rulesets';
import {
  americanPayout,
  isSportsbookBettingOpen,
  sportsbookFeedStatus,
  sportsbookEventIsVisitAvailable,
  sportsbookLineState,
  sportsbookTeamIsVisitInCity,
} from '../sportsbook.service.js';

describe('pregame sportsbook', () => {
  it('limits feed teams to cities available in the current round', () => {
    expect(sportsbookTeamIsVisitInCity('NFL', 'Detroit Lions', 'Detroit')).toBe(true);
    expect(sportsbookTeamIsVisitInCity('NBA', 'Miami Heat', 'Miami Beach')).toBe(true);
    expect(sportsbookTeamIsVisitInCity('NFL', 'Boston Patriots', 'Detroit')).toBe(false);
    expect(sportsbookEventIsVisitAvailable({ sport: 'NFL', homeTeam: 'Detroit Lions', awayTeam: 'Seattle Seahawks' }, classicOgV26K)).toBe(true);
    expect(sportsbookEventIsVisitAvailable({ sport: 'NFL', homeTeam: 'Detroit Lions', awayTeam: 'New England Patriots' }, classicOgV26K)).toBe(false);
  });

  it('pins whole-cent payouts for positive and negative American odds', () => {
    expect(americanPayout(1_000n, 150)).toBe(2_500n);
    expect(americanPayout(1_000n, -150)).toBe(1_667n);
  });

  it('closes the market at the exact scheduled start time', () => {
    const now = new Date('2026-10-10T20:00:00.000Z');
    const recentOdds = new Date(now.getTime() - 5 * 60_000);
    expect(isSportsbookBettingOpen({ status: 'PRE', startsAt: new Date(now.getTime() + 1), oddsUpdatedAt: recentOdds }, now)).toBe(true);
    expect(isSportsbookBettingOpen({ status: 'PRE', startsAt: now, oddsUpdatedAt: recentOdds }, now)).toBe(false);
    expect(isSportsbookBettingOpen({ status: 'LIVE', startsAt: new Date(now.getTime() + 1), oddsUpdatedAt: recentOdds }, now)).toBe(false);
  });

  it('previews on the bet slip exactly the payout the server pins', () => {
    for (const odds of [-10_000, -1_250, -333, -150, -115, -110, -101, -100, 100, 101, 115, 150, 333, 1_250, 10_000]) {
      for (const stake of [100, 101, 999, 1_000, 1_667, 2_501, 12_345, 99_999, 100_000_000]) {
        expect(sportsbookPayoutCents(stake, odds)).toBe(Number(americanPayout(BigInt(stake), odds)));
      }
    }
  });

  it('names one reason for a closed line, reporting a stale feed ahead of a stale line', () => {
    const now = new Date('2026-10-10T20:00:00.000Z');
    const line = { status: 'PRE', startsAt: new Date(now.getTime() + 3_600_000), oddsUpdatedAt: new Date(now.getTime() - 5 * 60_000), homeOdds: -120, awayOdds: 105 };
    expect(sportsbookLineState(line, true, now)).toBe('OPEN');
    expect(sportsbookLineState({ ...line, startsAt: now }, true, now)).toBe('STARTED');
    expect(sportsbookLineState({ ...line, status: 'LIVE' }, true, now)).toBe('STARTED');
    expect(sportsbookLineState(line, false, now)).toBe('FEED_UNAVAILABLE');
    expect(sportsbookLineState({ ...line, oddsUpdatedAt: new Date(now.getTime() - 46 * 60_000) }, false, now)).toBe('FEED_UNAVAILABLE');
    expect(sportsbookLineState({ ...line, oddsUpdatedAt: new Date(now.getTime() - 46 * 60_000) }, true, now)).toBe('STALE_ODDS');
    expect(sportsbookLineState({ ...line, homeOdds: null, awayOdds: null }, true, now)).toBe('NO_LINE');
    // One missing side still leaves the other side bettable.
    expect(sportsbookLineState({ ...line, homeOdds: null }, true, now)).toBe('OPEN');
    for (const state of ['NO_LINE', 'STALE_ODDS', 'FEED_UNAVAILABLE', 'STARTED'] as const) {
      expect(sportsbookLineReason(state)).toMatch(/\.$/);
    }
    expect(sportsbookLineReason('OPEN')).toBeNull();
  });

  it('reports feed freshness without hiding a fresh cache behind a missing key', () => {
    const now = new Date('2026-10-10T20:00:00.000Z');
    const fresh = new Date(now.getTime() - 10 * 60_000);
    const old = new Date(now.getTime() - 90 * 60_000);
    expect(sportsbookFeedStatus({ configured: true, lastPolledAt: fresh }, now)).toBe('FRESH');
    expect(sportsbookFeedStatus({ configured: false, lastPolledAt: fresh }, now)).toBe('FRESH');
    expect(sportsbookFeedStatus({ configured: true, lastPolledAt: old }, now)).toBe('STALE');
    expect(sportsbookFeedStatus({ configured: true, lastPolledAt: null }, now)).toBe('WAITING');
    expect(sportsbookFeedStatus({ configured: false, lastPolledAt: old }, now)).toBe('OFF');
  });

  it('returns the payout on a win, the stake on a push or void, and nothing otherwise', () => {
    expect(sportsbookReturnCents('WON', 1_000, 2_300)).toBe(2_300);
    expect(sportsbookReturnCents('PUSH', 1_000, 2_300)).toBe(1_000);
    expect(sportsbookReturnCents('VOID', 1_000, 2_300)).toBe(1_000);
    expect(sportsbookReturnCents('LOST', 1_000, 2_300)).toBe(0);
    expect(sportsbookReturnCents('OPEN', 1_000, 2_300)).toBe(0);
  });

  it('pins the simulated limits to 1.8.0-E and keeps every earlier ruleset free of the sportsbook', () => {
    // docs/SPORTSBOOK-SIMULATION-1.8.0-D.md tuned SPORTSBOOK_LIMITS; the pinned ruleset must match it.
    expect(classicOgV18E.casino.sportsbook.limits).toEqual(SPORTSBOOK_LIMITS);
    const { sportsbook: _sportsbook, ...casinoWithoutBook } = classicOgV18E.casino;
    const { classicOgV17E } = { classicOgV17E: rulesets['classic-og-v1.7-e']! };
    expect(casinoWithoutBook).toEqual(classicOgV17E.casino);
    // Rulesets registered after 1.8.0-E build on it and carry the same book.
    const all = Object.values(rulesets);
    const pinned = all.indexOf(classicOgV18E);
    for (const [index, ruleset] of all.entries()) {
      if (index < pinned) expect(ruleset.casino?.sportsbook, ruleset.meta.id).toBeUndefined();
      else expect(ruleset.casino?.sportsbook, ruleset.meta.id).toBe(classicOgV18E.casino.sportsbook);
    }
  });
});
