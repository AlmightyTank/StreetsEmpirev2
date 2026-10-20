import { describe, expect, it } from 'vitest';
import { classicOgV12E2 } from '@streets/rulesets';
import {
  poolAvailableShots,
  poolBreak,
  poolCanPress,
  poolPlayerShot,
  poolReturnBps,
  poolReturnCents,
  poolShotOdds,
  seededRng,
  type Rng,
} from '../index.js';

const rules = classicOgV12E2.casino.pool;
const table = rules.tables[0]!;

/** Feed rolls as basis points so each branch can be pinned exactly. */
function rolls(...bps: number[]): Rng {
  let index = 0;
  return () => {
    const value = bps[index++];
    if (value === undefined) throw new Error('Ran out of scripted rolls.');
    return value / 10_000;
  };
}

describe('pool', () => {
  it('drops the 8 on a golden break for the golden return', () => {
    const rack = poolBreak(rules, table, rolls(0));
    expect(rack.status).toBe('WON');
    expect(rack.finish).toBe('GOLDEN_BREAK');
    expect(poolReturnBps(table, rack)).toBe(table.goldenBreakReturnBps);
  });

  it('keeps the table after balls drop on the break', () => {
    const { goldenBps, scratchBps, dryBps } = rules.break;
    const rack = poolBreak(rules, table, rolls(goldenBps + scratchBps + dryBps));
    expect(rack.status).toBe('ACTIVE');
    expect(rack.playerBalls).toEqual([3, 4, 5, 6, 7]);
    expect(rack.hustlerVisits).toBe(0);
  });

  it('hands the hustler the table on a dry break and gives ball in hand when they scratch', () => {
    const { goldenBps, scratchBps } = rules.break;
    // Dry break, hustler pots one, then scratches.
    const rack = poolBreak(rules, table, rolls(goldenBps + scratchBps, table.hustler.scratchBps, 0));
    expect(rack.hustlerBalls).toHaveLength(6);
    expect(rack.ballInHand).toBe(true);
    expect(rack.hustlerVisits).toBe(1);
    expect(poolShotOdds(rules, rack, 'STEADY').potBps).toBe(rules.steady.potBps + rules.ballInHandBonusBps);
  });

  it('pays a break-and-run when the hustler never shoots', () => {
    const { goldenBps, scratchBps, dryBps, twoBallBps } = rules.break;
    const rack = poolBreak(rules, table, rolls(goldenBps + scratchBps + dryBps + twoBallBps));
    const pot = rules.steady.scratchBps;
    while (rack.status === 'ACTIVE') poolPlayerShot(rules, table, rack, 'STEADY', rolls(pot));
    expect(rack.finish).toBe('BREAK_AND_RUN');
    expect(poolReturnCents(1_000n, table, rack)).toBe((1_000n * BigInt(table.breakAndRunReturnBps)) / 10_000n);
  });

  it('loses the rack on a scratch while shooting the 8', () => {
    const rack = poolBreak(rules, table, rolls(9_999));
    rack.playerBalls = [];
    poolPlayerShot(rules, table, rack, 'STEADY', rolls(0));
    expect(rack.status).toBe('LOST');
    expect(rack.finish).toBe('SCRATCHED_EIGHT');
    expect(poolReturnBps(table, rack)).toBe(0);
  });

  it('wins when a snookered hustler scratches on the 8', () => {
    const rack = poolBreak(rules, table, rolls(9_999));
    rack.hustlerBalls = [];
    // Safety holds, then the hustler fouls on the 8.
    poolPlayerShot(rules, table, rack, 'SAFETY', rolls(rules.safety.foulBps, 0));
    expect(rack.status).toBe('WON');
    expect(rack.finish).toBe('HUSTLER_SCRATCHED_EIGHT');
    expect(poolReturnBps(table, rack)).toBe(table.winReturnBps);
  });

  it('offers Power only with two balls left and press only while the hustler is ahead', () => {
    const rack = poolBreak(rules, table, rolls(9_999));
    expect(poolAvailableShots(rack)).toContain('POWER');
    expect(poolCanPress(rack, false)).toBe(false);
    rack.hustlerBalls = [14, 15];
    expect(poolCanPress(rack, false)).toBe(true);
    expect(poolCanPress(rack, true)).toBe(false);
    rack.ballInHand = true;
    expect(poolCanPress(rack, false)).toBe(false);
    rack.ballInHand = false;
    rack.hustlerBalls = [];
    expect(poolCanPress(rack, false)).toBe(false);
    rack.playerBalls = [7];
    expect(poolAvailableShots(rack)).toEqual(['STEADY', 'SAFETY']);
    expect(() => poolPlayerShot(rules, table, rack, 'POWER', rolls(0))).toThrow(/not available/);
  });

  it('keeps every table under a 100% return for a strong fixed strategy', () => {
    for (const candidate of rules.tables) {
      const rng = seededRng(4_242);
      let returned = 0;
      const racks = 20_000;
      for (let i = 0; i < racks; i++) {
        const rack = poolBreak(rules, candidate, rng);
        while (rack.status === 'ACTIVE') {
          const shot = rack.hustlerBalls.length === 0 && rack.playerBalls.length >= 1 && !rack.ballInHand
            ? 'SAFETY'
            : rack.ballInHand && rack.playerBalls.length >= 2 && rack.playerBalls.length > rack.hustlerBalls.length
              ? 'POWER'
              : 'STEADY';
          poolPlayerShot(rules, candidate, rack, shot, rng);
        }
        returned += poolReturnBps(candidate, rack);
      }
      expect(returned / racks / 10_000).toBeLessThan(0.98);
    }
  });
});
