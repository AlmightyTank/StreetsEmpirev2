import { describe, expect, it } from 'vitest';
import { roundRollCallClock } from '../round-roll-call.service.js';
import { roundRollCallCatalog, ROUND_ROLL_CALL_REWARD_VERSION } from '../round-roll-call-rewards.js';
import { rollCallEconomyProjection, rollCallReleaseWarnings } from '../round-roll-call-release.service.js';
import { rollCallRecoveryPolicy } from '../round-roll-call-recovery.service.js';
import { rollCallFinaleEligible } from '../round-roll-call-cosmetic.service.js';
import { assertRoundRollCallClaimable } from '../round-roll-call-reward.service.js';

const DAY = 86_400_000;
const BEGIN = new Date('2026-10-01T18:00:00.000Z');
const statusAt = (roundDays: number, dayIndex: number, pausedMinutesTotal = 0) => {
  const end = new Date(BEGIN.getTime() + roundDays * DAY + pausedMinutesTotal * 60_000);
  const round = { startsAt: BEGIN, endsAt: end, pausedMinutesTotal, pausedAt: null, status: 'ACTIVE' as const };
  return roundRollCallClock(round, new Date(BEGIN.getTime() + (dayIndex - 1) * DAY + pausedMinutesTotal * 60_000 + 1000));
};
const stamp = (dayIndex: number, source = 'LOGIN') => ({ dayIndex, source });

describe('Round Roll Call Slice F — deterministic economy release matrix', () => {
  it('keeps exactly one final Legendary for every supported length, with no weapon or combat boost', () => {
    for (const days of [7, 8, 14, 21, 28, 35, 42, 56, 90, 365]) {
      const p = rollCallEconomyProjection(days, 1000);
      expect(p.requiredStamps).toBe(Math.max(0, days - 7));
      expect(p.allStepsWithinCaps).toBe(true);
      expect(p.gameplayOnly).toBe(true);
      expect(p.rarityCounts.legendary).toBe(days <= 7 ? 0 : 1);
      expect(p.finaleTier).toBe(days <= 7 ? null : days - 7);
      expect(p.worstCase.cashCents).toBe(p.perPlayer.cashCents * 1000);
      expect(p.worstCase.turns).toBe(p.perPlayer.turns * 1000);
      expect(p.worstCase.supplies).toBe(p.totalSuppliesPerPlayer * 1000);
      const catalog = roundRollCallCatalog(p.requiredStamps);
      expect(catalog).toHaveLength(p.requiredStamps);
      for (const reward of catalog.flatMap((tier) => tier.rewards)) {
        expect(['CASH', 'TURNS', 'ITEM']).toContain(reward.kind);
        if (reward.kind === 'ITEM') expect(['condoms', 'beer', 'medicine']).toContain(reward.key);
      }
    }
  });

  it('pins the standard 28-day round payouts and does not inflate Slice B economics', () => {
    const projected = rollCallEconomyProjection(28, 150);
    expect(projected.rewardVersion).toBe(ROUND_ROLL_CALL_REWARD_VERSION);
    expect(projected.perPlayer).toEqual({
      cashCents: 1_915_000,
      turns: 74,
      supplies: { beer: 42, condoms: 37, medicine: 20 },
    });
    expect(projected.totalSuppliesPerPlayer).toBe(99);
    expect(projected.rarityCounts).toEqual({ common: 10, uncommon: 6, rare: 4, legendary: 1 });
    expect(projected.worstCase.cashCents).toBe(287_250_000);
    expect(projected.worstCase.turns).toBe(11_100);
  });

  it('rejects non-integer inputs, unrealistic simulations, and unknown pinned reward versions', () => {
    expect(() => rollCallEconomyProjection(28.3, 10)).toThrow();
    expect(() => rollCallEconomyProjection(28, -1)).toThrow();
    expect(() => rollCallEconomyProjection(28, 1_000_001)).toThrow();
    expect(() => rollCallEconomyProjection(28, 100, 'round-roll-call-v2')).toThrow('Unsupported');
  });

  it('flags implausible aggregated recovery, stamp and claim receipts for operator review', () => {
    const clean = { players: 2, roundDays: 28, requiredStamps: 21, actualLogins: 25,
      recoveredStamps: 2, recoveryAudits: 2, rewardClaims: 21, rewardVersion: ROUND_ROLL_CALL_REWARD_VERSION };
    expect(rollCallReleaseWarnings(clean)).toEqual([]);
    const broken = rollCallReleaseWarnings({ ...clean, actualLogins: 90, recoveredStamps: 6,
      recoveryAudits: 1, rewardClaims: 50, rewardVersion: 'other' });
    expect(broken).toEqual(expect.arrayContaining([
      'RECOVERY_AUDIT_MISMATCH',
      'RECOVERY_CAP_EXCEEDED',
      'STAMP_CAP_EXCEEDED',
      'CLAIM_CAP_EXCEEDED',
      'UNKNOWN_REWARD_VERSION',
    ]));
  });
});

describe('Round Roll Call Slice F — participation and anti-abuse matrix', () => {
  it('keeps the requirement constant for first-day and seven-missed-days schedules', () => {
    for (const roundDays of [14, 21, 28, 35, 42]) {
      const first = statusAt(roundDays, 1);
      const final = statusAt(roundDays, roundDays);
      expect(first.requiredStamps).toBe(roundDays - 7);
      expect(final.requiredStamps).toBe(roundDays - 7);
      // Seven arbitrary missed days (including at the beginning) do not
      // require paid makeup, a consecutive streak, or a reset.
      expect(rollCallFinaleEligible(first.requiredStamps, roundDays - 7)).toBe(true);
      expect(rollCallFinaleEligible(first.requiredStamps, roundDays - 8)).toBe(false);
    }
  });

  it('does not make a recovered credit legal until eight days are genuinely missed', () => {
    const createView = (today: number, days: number[], recoveredDays: number[] = []) => {
      const clock = statusAt(28, today);
      const stamped = [...days.map((day) => stamp(day)), ...recoveredDays.map((day) => stamp(day, 'RECOVERY'))];
      const saved = stamped.filter((s) => s.dayIndex <= clock.completedDaySlots).length;
      return { clock, stamped, attendance: {
        ...clock,
        stamps: stamped.length,
        completed: stamped.length >= clock.requiredStamps,
        missedCompletedDays: clock.completedDaySlots - saved,
        active: clock.active,
      } };
    };
    const early = createView(9, [1]);
    expect(early.attendance.missedCompletedDays).toBe(7);
    expect(rollCallRecoveryPolicy(early.attendance as never, early.stamped, []).reason).toBe('allowance');
    const eighth = createView(10, [1]);
    const ready = rollCallRecoveryPolicy(eighth.attendance as never, eighth.stamped, []);
    expect(ready.reason).toBe('ready');
    expect(ready.nextDayIndex).toBe(2);
    const oneRecovered = createView(10, [1], [2]);
    const receipt = [{ dayIndex: 2, actionId: 'once', createdAt: BEGIN }];
    expect(rollCallRecoveryPolicy(oneRecovered.attendance as never, oneRecovered.stamped, receipt).reason).toBe('allowance');
  });

  it('rejects out-of-range and unearned tiers even after the browser says they are ready', () => {
    for (const stamps of [0, 1, 7, 20, 21]) {
      for (const tier of [1, 7, 21, 22, 10_000]) {
        const eligible = tier <= stamps && tier <= 21;
        if (eligible) expect(() => assertRoundRollCallClaimable(21, stamps, tier, false)).not.toThrow();
        else expect(() => assertRoundRollCallClaimable(21, stamps, tier, false)).toThrow();
      }
    }
    expect(() => assertRoundRollCallClaimable(21, 21, 21, true)).toThrow('already collected');
  });

  it('never doubles the attendance target when a pause extends the end date', () => {
    for (const pausedMinutes of [60, 12 * 60, 24 * 60, 5 * 24 * 60]) {
      expect(statusAt(28, 20, pausedMinutes).requiredStamps).toBe(21);
      expect(statusAt(28, 20, pausedMinutes).roundDay).toBe(20);
    }
  });
});
