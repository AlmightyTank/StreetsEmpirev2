import { describe, expect, it } from 'vitest';
import { classicOgV01 } from '@streets/rulesets';
import { evaluateAwayBonus, regenerateTurns } from '../calculations/turns.js';

const INTERVAL_MS = classicOgV01.turns.intervalMinutes * 60 * 1000;
const base = new Date('2026-01-01T12:00:00.000Z');

function at(msFromBase: number): Date {
  return new Date(base.getTime() + msFromBase);
}

describe('regenerateTurns', () => {
  it('adds two turns per completed interval', () => {
    const result = regenerateTurns(
      { turns: 100, lastTurnCalculationAt: base },
      at(INTERVAL_MS * 3),
    );

    expect(result.intervalsProcessed).toBe(3);
    expect(result.turns).toBe(106);
    expect(result.gained).toBe(6);
  });

  // Section 53: 198 + 2 = 200
  it('reaches the cap exactly', () => {
    const result = regenerateTurns(
      { turns: 198, lastTurnCalculationAt: base },
      at(INTERVAL_MS),
    );
    expect(result.turns).toBe(200);
  });

  // Section 53: 200 + 2 = 200
  it('never exceeds the cap', () => {
    const result = regenerateTurns(
      { turns: 200, lastTurnCalculationAt: base },
      at(INTERVAL_MS * 50),
    );
    expect(result.turns).toBe(200);
    expect(result.gained).toBe(0);
    expect(result.turnsGeneratedNextTick).toBe(0);
  });

  it('does not claw back turns already above the cap', () => {
    const result = regenerateTurns(
      { turns: 206, lastTurnCalculationAt: base },
      at(INTERVAL_MS * 2),
    );
    expect(result.turns).toBe(206);
  });

  it('gives nothing for a partial interval and leaves the clock alone', () => {
    const result = regenerateTurns(
      { turns: 100, lastTurnCalculationAt: base },
      at(INTERVAL_MS - 1),
    );

    expect(result.gained).toBe(0);
    expect(result.lastTurnCalculationAt.getTime()).toBe(base.getTime());
  });

  it('advances the clock by whole intervals only, so the remainder survives', () => {
    const elapsed = INTERVAL_MS * 2 + 4 * 60 * 1000; // two ticks plus 4 minutes
    const result = regenerateTurns(
      { turns: 100, lastTurnCalculationAt: base },
      at(elapsed),
    );

    expect(result.turns).toBe(104);
    expect(result.lastTurnCalculationAt.getTime()).toBe(
      base.getTime() + INTERVAL_MS * 2,
    );
    // The 4 minutes already served still count towards the next tick.
    expect(result.nextTurnAt.getTime()).toBe(base.getTime() + INTERVAL_MS * 3);
  });

  it('settles the clock even while capped, so idle time cannot be banked', () => {
    const result = regenerateTurns(
      { turns: 200, lastTurnCalculationAt: base },
      at(INTERVAL_MS * 12),
    );
    expect(result.lastTurnCalculationAt.getTime()).toBe(
      base.getTime() + INTERVAL_MS * 12,
    );
  });

  // Release test step 19: come back after 20 minutes, get 4 turns.
  it('gives four turns after twenty minutes away', () => {
    const result = regenerateTurns(
      { turns: 0, lastTurnCalculationAt: base },
      at(20 * 60 * 1000),
    );
    expect(result.turns).toBe(4);
  });

  it('is not fooled by a clock that runs backwards', () => {
    const result = regenerateTurns(
      { turns: 100, lastTurnCalculationAt: base },
      at(-INTERVAL_MS * 5),
    );
    expect(result.turns).toBe(100);
    expect(result.intervalsProcessed).toBe(0);
  });
});

describe('evaluateAwayBonus', () => {
  const SIX_HOURS = 6 * 60 * 60 * 1000;

  it('pays out after six hours away', () => {
    const result = evaluateAwayBonus(
      { turns: 100, lastActiveAt: base, lastAwayBonusAt: null },
      at(SIX_HOURS),
    );

    expect(result.awarded).toBe(true);
    expect(result.amount).toBe(6);
    expect(result.turns).toBe(106);
  });

  it('pays nothing before six hours', () => {
    const result = evaluateAwayBonus(
      { turns: 100, lastActiveAt: base, lastAwayBonusAt: null },
      at(SIX_HOURS - 1),
    );
    expect(result.awarded).toBe(false);
  });

  it('cannot be farmed by refreshing', () => {
    const collectedAt = at(SIX_HOURS);

    const second = evaluateAwayBonus(
      { turns: 106, lastActiveAt: base, lastAwayBonusAt: collectedAt },
      at(SIX_HOURS + 60_000),
    );

    expect(second.awarded).toBe(false);
  });

  it('pays again once the player has been active since the last bonus', () => {
    const firstCollectedAt = at(SIX_HOURS);
    const activeAgainAt = at(SIX_HOURS + 60_000);

    const result = evaluateAwayBonus(
      {
        turns: 100,
        lastActiveAt: activeAgainAt,
        lastAwayBonusAt: firstCollectedAt,
      },
      new Date(activeAgainAt.getTime() + SIX_HOURS),
    );

    expect(result.awarded).toBe(true);
  });

  it('respects the turn cap rather than wasting the bonus', () => {
    const result = evaluateAwayBonus(
      { turns: 200, lastActiveAt: base, lastAwayBonusAt: null },
      at(SIX_HOURS),
    );
    expect(result.awarded).toBe(false);

    const partial = evaluateAwayBonus(
      { turns: 198, lastActiveAt: base, lastAwayBonusAt: null },
      at(SIX_HOURS),
    );
    expect(partial.awarded).toBe(true);
    expect(partial.amount).toBe(2);
    expect(partial.turns).toBe(200);
  });
});
