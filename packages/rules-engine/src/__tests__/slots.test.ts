import { describe, expect, it } from 'vitest';
import { classicOgV12A, classicOgV12B } from '@streets/rulesets';
import { loadRuleset, resolveSlotSpin, seededRng, simulateSlots, theoreticalSlotRtpBps } from '../index.js';

describe('1.2.0-B slots', () => {
  it('pins three machines without changing the A ruleset', () => {
    expect(classicOgV12A.casino.slots).toBeUndefined();
    expect(classicOgV12B.casino.slots.machines).toHaveLength(3);
    expect(loadRuleset('classic-og-v1.2-b', '1.2.0-B')).toBe(classicOgV12B);
  });

  it('keeps each base game in the intended low-90s RTP band', () => {
    for (const machine of classicOgV12B.casino.slots.machines) {
      expect(theoreticalSlotRtpBps(machine)).toBeGreaterThanOrEqual(9_100);
      expect(theoreticalSlotRtpBps(machine)).toBeLessThanOrEqual(9_400);
    }
  });

  it('replays deterministic reels when the RNG sequence is the same', () => {
    const machine = classicOgV12B.casino.slots.machines[0]!;
    const first = resolveSlotSpin(machine, 10_000n, seededRng(120));
    const second = resolveSlotSpin(machine, 10_000n, seededRng(120));
    expect(first.reels.map((symbol) => symbol.key)).toEqual(second.reels.map((symbol) => symbol.key));
    expect(first.payoutCents).toBe(second.payoutCents);
  });

  it('large-sample RTP stays near the exact table', () => {
    for (const [index, machine] of classicOgV12B.casino.slots.machines.entries()) {
      const summary = simulateSlots(machine, 80_000, seededRng(12_000 + index));
      expect(Math.abs(summary.observedRtpBps - summary.theoreticalRtpBps)).toBeLessThan(350);
    }
  });
});
