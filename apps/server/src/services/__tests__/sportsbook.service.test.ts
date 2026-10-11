import { describe, expect, it } from 'vitest';
import { americanPayout, eventOdds, isSportsbookBettingOpen } from '../sportsbook.service.js';

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
});
