import { describe, expect, it } from 'vitest';
import { casinoTournamentReturnBps, casinoTournamentWeekWindow } from '../casino-tournaments.service.js';

describe('casino tournament scoring', () => {
  it('normalizes table results by the equal buy-in instead of raw chip volume', () => {
    expect(casinoTournamentReturnBps(25_000n, 100_000n)).toBe(2_500);
    expect(casinoTournamentReturnBps(2_500n, 10_000n)).toBe(2_500);
    expect(casinoTournamentReturnBps(-2_500n, 10_000n)).toBe(-2_500);
    expect(casinoTournamentReturnBps(1n, 0n)).toBe(0);
  });

  it('uses a Monday 00:00 UTC start for the weekly board', () => {
    const { startsAt, endsAt } = casinoTournamentWeekWindow(new Date('2026-10-04T19:00:00.000Z'));
    expect(startsAt.toISOString()).toBe('2026-09-28T00:00:00.000Z');
    expect(endsAt.toISOString()).toBe('2026-10-05T00:00:00.000Z');
  });
});
