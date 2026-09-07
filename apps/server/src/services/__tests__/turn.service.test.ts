import { describe, expect, it } from 'vitest';
import { classicOgV01 } from '@streets/rulesets';
import { TurnService } from '../turn.service.js';

const INTERVAL_MS = classicOgV01.turns.intervalMinutes * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const now = new Date('2026-01-01T12:00:00.000Z');

function ago(ms: number): Date {
  return new Date(now.getTime() - ms);
}

function player(overrides: Partial<Parameters<typeof TurnService.settle>[0]> = {}) {
  return {
    turns: 100,
    lastTurnCalculationAt: ago(0),
    lastActiveAt: ago(0),
    lastAwayBonusAt: null,
    ...overrides,
  };
}

describe('TurnService.settle', () => {
  it('reports nothing to write when no interval has passed', () => {
    const result = TurnService.settle(player(), now, classicOgV01);

    expect(result.changed).toBe(false);
    expect(result.turns).toBe(100);
    expect(result.regenerated).toBe(0);
    expect(result.awayBonus.awarded).toBe(false);
  });

  it('regenerates whole intervals', () => {
    const result = TurnService.settle(
      player({ lastTurnCalculationAt: ago(INTERVAL_MS * 3 + 90_000) }),
      now,
      classicOgV01,
    );

    expect(result.regenerated).toBe(6);
    expect(result.turns).toBe(106);
    expect(result.changed).toBe(true);
    // The 90 second remainder is not thrown away.
    expect(result.nextTurnAt.getTime()).toBe(now.getTime() + (INTERVAL_MS - 90_000));
  });

  it('stacks the away bonus on top of regeneration', () => {
    const result = TurnService.settle(
      player({
        turns: 100,
        lastTurnCalculationAt: ago(INTERVAL_MS * 2),
        lastActiveAt: ago(7 * HOUR),
      }),
      now,
      classicOgV01,
    );

    expect(result.regenerated).toBe(4);
    expect(result.awayBonus).toEqual({ awarded: true, amount: 6 });
    expect(result.turns).toBe(110);
  });

  it('applies the cap once, to the combined total', () => {
    const result = TurnService.settle(
      player({
        turns: 196,
        lastTurnCalculationAt: ago(INTERVAL_MS * 5), // would be +10
        lastActiveAt: ago(7 * HOUR), // would be +6
      }),
      now,
      classicOgV01,
    );

    // Regeneration alone fills to the cap, leaving no room for the bonus.
    expect(result.turns).toBe(200);
    expect(result.awayBonus.awarded).toBe(false);
    expect(result.turnsGeneratedNextTick).toBe(0);
  });

  it('pays a partial away bonus rather than overfilling', () => {
    const result = TurnService.settle(
      player({
        turns: 197,
        lastTurnCalculationAt: ago(0),
        lastActiveAt: ago(7 * HOUR),
      }),
      now,
      classicOgV01,
    );

    expect(result.awayBonus).toEqual({ awarded: true, amount: 3 });
    expect(result.turns).toBe(200);
    expect(result.changed).toBe(true);
  });

  it('does not pay the bonus twice for one away period', () => {
    const result = TurnService.settle(
      player({
        lastActiveAt: ago(7 * HOUR),
        lastAwayBonusAt: ago(30 * 60 * 1000),
      }),
      now,
      classicOgV01,
    );

    expect(result.awayBonus.awarded).toBe(false);
    expect(result.turns).toBe(100);
  });

  it('reports the next tick size while below the cap', () => {
    const result = TurnService.settle(player({ turns: 10 }), now, classicOgV01);
    expect(result.turnsGeneratedNextTick).toBe(2);
    expect(result.turnCap).toBe(200);
  });
});
