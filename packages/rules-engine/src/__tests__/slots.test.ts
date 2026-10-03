import { describe, expect, it } from 'vitest';
import { classicOgV12A, classicOgV12B, hideoutV2For, type Ruleset } from '@streets/rulesets';
import { loadRuleset, resolveSlotSpin, seededRng, simulateSlots, theoreticalSlotRtpBps } from '../index.js';

describe('1.2.0-B casino-style slots', () => {
  it('pins 3x3, 4x3 and 5x3 machines without changing the A ruleset', () => {
    expect((classicOgV12A as Ruleset).casino?.slots).toBeUndefined();
    expect(classicOgV12B.casino.slots.machines.map((machine) => [machine.reels, machine.rows, machine.paylines.length]))
      .toEqual([[3, 3, 5], [4, 3, 10], [5, 3, 20]]);
    expect(loadRuleset('classic-og-v1.2-b', '1.2.0-B')).toBe(classicOgV12B);
    expect(hideoutV2For(classicOgV12A)).not.toBeNull();
    expect(hideoutV2For(classicOgV12B)).toEqual(hideoutV2For(classicOgV12A));
  });

  it('keeps every payline inside the visible three-row window', () => {
    for (const machine of classicOgV12B.casino.slots.machines) {
      for (const line of machine.paylines) {
        expect(line.rows).toHaveLength(machine.reels);
        expect(line.rows.every((row) => Number.isInteger(row) && row >= 0 && row < machine.rows)).toBe(true);
      }
    }
  });

  it('keeps each base game in the intended low-90s RTP band at the minimum line bet', () => {
    const expected = new Map([
      ['CORNER_CLASSIC', 9_269],
      ['NEON_SEVENS', 9_150],
      ['EMPIRE_GOLD', 9_209],
    ]);
    for (const machine of classicOgV12B.casino.slots.machines) {
      const actual = theoreticalSlotRtpBps(machine, machine.minBetPerLineCents);
      expect(actual).toBe(expected.get(machine.key));
      expect(actual).toBeGreaterThanOrEqual(9_100);
      expect(actual).toBeLessThanOrEqual(9_400);
    }
  });

  it('replays the exact same visible grid when the RNG sequence is the same', () => {
    const machine = classicOgV12B.casino.slots.machines[2]!;
    const active = machine.paylines.map((line) => line.key);
    const first = resolveSlotSpin(machine, BigInt(machine.minBetPerLineCents), active, seededRng(120));
    const second = resolveSlotSpin(machine, BigInt(machine.minBetPerLineCents), active, seededRng(120));
    expect(first.grid.map((row) => row.map((symbol) => symbol.key)))
      .toEqual(second.grid.map((row) => row.map((symbol) => symbol.key)));
    expect(first.winningLines).toEqual(second.winningLines);
    expect(first.payoutCents).toBe(second.payoutCents);
  });

  it('pays every selected all-cherry line and never an unselected line', () => {
    const machine = classicOgV12B.casino.slots.machines[0]!;
    const active = machine.paylines.slice(0, 3).map((line) => line.key);
    const result = resolveSlotSpin(machine, 100n, active, () => 0);
    expect(result.grid).toHaveLength(3);
    expect(result.grid.every((row) => row.length === 3 && row.every((symbol) => symbol.key === 'CHERRY'))).toBe(true);
    expect(result.activePaylineKeys).toEqual(active);
    expect(result.winningLines.map((win) => win.paylineKey)).toEqual(active);
    expect(result.winningLines.every((win) => win.matchCount === 3 && win.payoutCents === 600n)).toBe(true);
    expect(result.totalWagerCents).toBe(300n);
    expect(result.payoutCents).toBe(1_800n);
  });

  it('only makes Empire Gold progressive-eligible at max line bet with every line selected', () => {
    const machine = classicOgV12B.casino.slots.machines[2]!;
    const allLines = machine.paylines.map((line) => line.key);
    const jackpotRng = () => 0.999999999;
    expect(resolveSlotSpin(machine, 12_500n, allLines, jackpotRng).jackpotTriggered).toBe(true);
    expect(resolveSlotSpin(machine, 10_000n, allLines, jackpotRng).jackpotTriggered).toBe(false);
    expect(resolveSlotSpin(machine, 12_500n, allLines.slice(0, -1), jackpotRng).jackpotTriggered).toBe(false);
  });

  it('large-sample RTP stays near the exact line table', () => {
    for (const [index, machine] of classicOgV12B.casino.slots.machines.entries()) {
      const summary = simulateSlots(machine, 80_000, seededRng(12_000 + index));
      expect(Math.abs(summary.observedRtpBps - summary.theoreticalRtpBps)).toBeLessThan(350);
    }
  });
});
