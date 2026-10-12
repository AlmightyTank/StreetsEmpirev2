import { describe, expect, it } from 'vitest';
import { SPORTSBOOK_LIMITS, sportsbookLineReason, sportsbookPayoutCents, sportsbookReturnCents } from '@streets/shared';
import { classicOgV18E, rulesets } from '@streets/rulesets';
import { providerOutcome, summarizeSnapshot } from '../sportsbook-feed.service.js';
import {
  americanPayout,
  eventOdds,
  isSportsbookBettingOpen,
  sportsbookFeedStatus,
  sportsbookLineState,
} from '../sportsbook.service.js';

describe('pregame sportsbook', () => {
  it('reads the two selected moneyline prices from a narrow provider snapshot', () => {
    expect(eventOdds({
      event_id: 'game-1',
      teams: [
        { name: 'Away Club', is_away: true },
        { name: 'Home Club', is_away: false },
      ],
      markets: [{
        market_id: 1,
        name: 'moneyline',
        participants: [
          { name: 'Away Club', price: '+125' },
          { name: 'Home Club', price: '-140' },
        ],
      }],
    })).toEqual({ home: 'Home Club', away: 'Away Club', homeOdds: -140, awayOdds: 125 });
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

  describe('TheRundown v2 payloads', () => {
    const v2 = (overrides: Record<string, unknown> = {}) => ({
      event_id: 'evt-v2', sport_id: 2, event_date: '2026-10-11T13:30:00Z',
      score: { event_status: 'STATUS_SCHEDULED', score_away: 0, score_home: 0 },
      teams: [
        { team_id: 31, name: 'Philadelphia', mascot: 'Eagles', abbreviation: 'PHI', is_away: true, is_home: false },
        { team_id: 15, name: 'Jacksonville', mascot: 'Jaguars', abbreviation: 'JAX', is_away: false, is_home: true },
      ],
      markets: [{
        market_id: 1, period_id: 0, name: 'moneyline',
        participants: [
          { id: 31, type: 'TYPE_TEAM', name: 'Philadelphia Eagles', lines: [{ id: 1, value: '', prices: { 3: { id: 7, price: -175, is_main_line: true } } }] },
          { id: 15, type: 'TYPE_TEAM', name: 'Jacksonville Jaguars', lines: [{ id: 2, value: '', prices: { 3: { id: 8, price: 145, is_main_line: true } } }] },
        ],
      }],
      ...overrides,
    });
    const market = (participants: unknown[], extra: Record<string, unknown> = {}) => ({ market_id: 1, period_id: 0, name: 'moneyline', participants, ...extra });
    const side = (id: number, name: string, prices: Record<string, unknown>, more: unknown[] = []) =>
      ({ id, type: 'TYPE_TEAM', name, lines: [...more, { id: id * 10, value: '', prices }] });

    it('reads the moneyline nested under lines and prices, with full team names', () => {
      expect(eventOdds(v2())).toEqual({ home: 'Jacksonville Jaguars', away: 'Philadelphia Eagles', homeOdds: 145, awayOdds: -175 });
    });

    it('matches participants by team id even when their names differ from the team record', () => {
      const event = v2({ markets: [market([side(31, 'PHI Eagles', { 3: { price: 120 } }), side(15, 'JAX Jaguars', { 3: { price: -140 } })])] });
      expect(eventOdds(event)).toMatchObject({ awayOdds: 120, homeOdds: -140 });
    });

    it('keeps a line our book took off the board off, and prefers the main line', () => {
      const event = v2({ markets: [market([
        side(31, 'Philadelphia Eagles', { 3: { price: 0.0001, is_main_line: true }, 19: { price: -180 } }),
        side(15, 'Jacksonville Jaguars', { 3: { price: 150, is_main_line: true } }, [{ id: 99, value: '', prices: { 3: { price: 400, is_main_line: false } } }]),
      ])] });
      expect(eventOdds(event)).toMatchObject({ awayOdds: null, homeOdds: 150 });
    });

    it('uses the full-game moneyline over a period one, and the provider order when teams carry no flags', () => {
      const event = v2({
        teams: [{ team_id: 31, name: 'Philadelphia', mascot: 'Eagles' }, { team_id: 15, name: 'Jacksonville', mascot: 'Jaguars' }],
        markets: [
          market([side(31, 'Philadelphia Eagles', { 3: { price: -110 } }), side(15, 'Jacksonville Jaguars', { 3: { price: -110 } })], { period_id: 1 }),
          market([side(31, 'Philadelphia Eagles', { 3: { price: -175 } }), side(15, 'Jacksonville Jaguars', { 3: { price: 145 } })]),
        ],
      });
      expect(eventOdds(event)).toEqual({ home: 'Jacksonville Jaguars', away: 'Philadelphia Eagles', homeOdds: 145, awayOdds: -175 });
    });

    it('reads the game status from the score object', () => {
      expect(providerOutcome(v2())).toBe('PRE');
      expect(providerOutcome(v2({ score: { event_status: 'STATUS_IN_PROGRESS' } }))).toBe('LIVE');
      expect(providerOutcome(v2({ score: { event_status: 'STATUS_FINAL', score_away: 24, score_home: 17 } }))).toBe('FINAL');
      expect(providerOutcome(v2({ score: { event_status: 'STATUS_POSTPONED' } }))).toBe('CANCELLED');
      expect(summarizeSnapshot([v2()])).toMatchObject({ parsed: 1, withoutPrices: 0, statuses: [{ raw: 'STATUS_SCHEDULED', outcome: 'PRE', count: 1 }] });
    });
  });
});
