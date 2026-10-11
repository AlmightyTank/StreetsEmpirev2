import { describe, expect, it } from 'vitest';
import {
  SPORTSBOOK_LIMITS,
  sportsbookMaxStake,
  sportsbookProfitCents,
  sportsbookStakeCheck,
  sportsbookStakeForProfit,
  type SportsbookStakeUsage,
} from '../sportsbook.js';

const fresh: SportsbookStakeUsage = {
  bankrollCents: 100_000_000, openStakeCents: 0, openTickets: 0, dailyStakeCents: 0, gameStakeCents: 0, sideLiabilityCents: 0,
};

describe('1.8.0-D sportsbook limits', () => {
  it('finds the exact top stake for a profit cap at any price', () => {
    for (const odds of [-10_000, -333, -150, -110, -101, 100, 101, 137, 250, 400, 999, 2_500]) {
      for (const profit of [1, 99, 5_000_000, 1_234_567]) {
        const stake = sportsbookStakeForProfit(profit, odds, 1e9);
        expect(sportsbookProfitCents(stake, odds)).toBeLessThanOrEqual(profit);
        expect(sportsbookProfitCents(stake + 1, odds)).toBeGreaterThan(profit);
      }
    }
    expect(sportsbookStakeForProfit(0, 150, 1e9)).toBe(0);
  });

  it('shrinks the top stake on long shots so one ticket cannot win more than the cap', () => {
    // $50,000 to win at +400 is a $12,500 stake; at -200 the $25,000 ticket cap binds first.
    expect(sportsbookMaxStake(400, SPORTSBOOK_LIMITS, fresh)).toEqual({ maxStakeCents: 1_250_000, binding: 'SPORTSBOOK_MAX_PROFIT' });
    expect(sportsbookMaxStake(-200, SPORTSBOOK_LIMITS, fresh)).toEqual({ maxStakeCents: 2_500_000, binding: 'SPORTSBOOK_STAKE' });
    expect(sportsbookStakeCheck(1_250_001, 400, SPORTSBOOK_LIMITS, fresh)).toMatchObject({
      code: 'SPORTSBOOK_MAX_PROFIT', message: 'A ticket can win at most $50,000, so the top stake at +400 is $12,500.',
    });
    expect(sportsbookStakeCheck(1_250_000, 400, SPORTSBOOK_LIMITS, fresh)).toBeNull();
  });

  it('names the limit that binds, in the player\'s words', () => {
    const check = (stake: number, usage: Partial<SportsbookStakeUsage>, odds = -110) =>
      sportsbookStakeCheck(stake, odds, SPORTSBOOK_LIMITS, { ...fresh, ...usage });
    expect(check(999, {})).toMatchObject({ code: 'SPORTSBOOK_STAKE', message: 'Tickets start at $10.' });
    expect(check(2_500_001, {})).toMatchObject({ code: 'SPORTSBOOK_STAKE', message: 'The largest ticket is $25,000.' });
    expect(check(1_500_000, { gameStakeCents: 1_500_000 })).toMatchObject({
      code: 'SPORTSBOOK_GAME_LIMIT', maxStakeCents: 1_000_000, message: 'You can stake $10,000 more on this game ($25,000 per game).',
    });
    expect(check(1_000, { gameStakeCents: 2_500_000 })).toMatchObject({ code: 'SPORTSBOOK_GAME_LIMIT', message: 'You have reached the $25,000 limit on this game.' });
    expect(check(2_000_000, { openStakeCents: 14_000_000 })).toMatchObject({ code: 'SPORTSBOOK_OPEN_LIMIT', maxStakeCents: 1_000_000 });
    expect(check(1_000, { openTickets: 20 })).toMatchObject({ code: 'SPORTSBOOK_OPEN_TICKETS', maxStakeCents: 0 });
    expect(check(2_000_000, { dailyStakeCents: 11_500_000 })).toMatchObject({
      code: 'SPORTSBOOK_DAILY_LIMIT', message: 'Tickets placed in the last 24 hours can total $125,000; you have $10,000 left.',
    });
    expect(check(1_000, { sideLiabilityCents: 100_000_000 }, 150)).toMatchObject({ code: 'SPORTSBOOK_SIDE_LIMIT', message: 'This side has reached the book\'s limit for this game.' });
    expect(check(100_000, { bankrollCents: 50_050 })).toMatchObject({ code: 'NOT_ENOUGH_BANKROLL', message: 'You have $500.50 in casino chips on the floor.' });
    expect(check(2_500_000, {})).toBeNull();
  });

  it('keeps every limit in a sane order', () => {
    const limits = SPORTSBOOK_LIMITS;
    expect(limits.minStakeCents).toBeLessThan(limits.maxStakeCents);
    expect(limits.maxStakeCents).toBeLessThanOrEqual(limits.perGameStakeCents);
    expect(limits.perGameStakeCents).toBeLessThanOrEqual(limits.dailyStakeCents);
    expect(limits.dailyStakeCents).toBeLessThanOrEqual(limits.openStakeCents);
    expect(limits.maxProfitCents).toBeLessThan(limits.sideLiabilityCents);
  });
});
