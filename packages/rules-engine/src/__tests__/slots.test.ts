import { describe, expect, it } from 'vitest';
import {
  classicOgV12A,
  classicOgV12B,
  hideoutV2For,
  type CasinoSlotMachineRules,
  type Ruleset,
} from '@streets/rulesets';
import {
  effectiveSlotRtpBps,
  loadRuleset,
  resolveSlotSpin,
  rollSlotFreeSpinAward,
  seededRng,
  simulateSlots,
  theoreticalSlotRtpBps,
} from '../index.js';

function rngForMiddleSymbol(machine: CasinoSlotMachineRules, symbolKey: string): () => number {
  const tickets = machine.reelStrips.map((strip) => {
    const stop = strip.findIndex((key) => key === symbolKey);
    if (stop < 0) throw new Error(machine.key + ' has no ' + symbolKey + ' on one reel');
    return (stop + 0.25) / strip.length;
  });
  let index = 0;
  return () => tickets[index++ % tickets.length]!;
}

function sequenceRng(values: number[], fallback = 0.5): () => number {
  let index = 0;
  return () => values[index++] ?? fallback;
}

describe('1.2.0-B casino-style slots', () => {
  it('pins 3x3, 4x3 and 5x3 machines without changing the A ruleset', () => {
    expect((classicOgV12A as Ruleset).casino?.slots).toBeUndefined();
    expect(classicOgV12B.casino.slots.machines.map((machine) => [
      machine.reels,
      machine.rows,
      machine.paylines.length,
      machine.reelStrips.length,
    ])).toEqual([[3, 3, 5, 3], [4, 3, 10, 4], [5, 3, 20, 5]]);
    expect(loadRuleset('classic-og-v1.2-b', '1.2.0-B')).toBe(classicOgV12B);
    expect(hideoutV2For(classicOgV12A)).not.toBeNull();
    expect(hideoutV2For(classicOgV12B)).toEqual(hideoutV2For(classicOgV12A));
  });

  it('keeps every payline and virtual reel inside the pinned machine definition', () => {
    for (const machine of classicOgV12B.casino.slots.machines) {
      const symbolKeys = new Set<string>(machine.symbols.map((symbol) => symbol.key));
      for (const line of machine.paylines) {
        expect(line.rows).toHaveLength(machine.reels);
        expect(line.rows.every((row) => Number.isInteger(row) && row >= 0 && row < machine.rows)).toBe(true);
      }
      for (const strip of machine.reelStrips) {
        expect(strip.length).toBeGreaterThanOrEqual(3);
        expect(strip.every((key) => symbolKeys.has(key))).toBe(true);
      }
    }
  });

  it('preserves the base RTP and includes the free-spin value in effective RTP', () => {
    const expectedBase = new Map([
      ['CORNER_CLASSIC', 9_269],
      ['NEON_SEVENS', 9_150],
      ['EMPIRE_GOLD', 9_209],
    ]);
    const expectedEffective = new Map([
      ['CORNER_CLASSIC', 9_371],
      ['NEON_SEVENS', 9_251],
      ['EMPIRE_GOLD', 9_311],
    ]);

    for (const machine of classicOgV12B.casino.slots.machines) {
      const base = theoreticalSlotRtpBps(machine, machine.minBetPerLineCents);
      const effective = effectiveSlotRtpBps(machine, machine.minBetPerLineCents);
      expect(base).toBe(expectedBase.get(machine.key));
      expect(effective).toBe(expectedEffective.get(machine.key));
      expect(effective).toBeGreaterThan(base);
      expect(effective).toBeLessThan(9_500);
    }
  });

  it('replays the exact same visible grid and reel stops from the same RNG', () => {
    const machine = classicOgV12B.casino.slots.machines[2]!;
    const active = machine.paylines.map((line) => line.key);
    const first = resolveSlotSpin(machine, BigInt(machine.minBetPerLineCents), active, seededRng(120));
    const second = resolveSlotSpin(machine, BigInt(machine.minBetPerLineCents), active, seededRng(120));
    expect(first.reelStops).toEqual(second.reelStops);
    expect(first.grid.map((row) => row.map((symbol) => symbol.key)))
      .toEqual(second.grid.map((row) => row.map((symbol) => symbol.key)));
    expect(first.winningLines).toEqual(second.winningLines);
    expect(first.payoutCents).toBe(second.payoutCents);
  });

  it('pays selected middle-line cherries from virtual reel stops', () => {
    const machine = classicOgV12B.casino.slots.machines[0]!;
    const centerLine = machine.paylines[0]!;
    const result = resolveSlotSpin(machine, 100n, [centerLine.key], rngForMiddleSymbol(machine, 'CHERRY'));

    expect(result.grid[1]!.every((symbol) => symbol.key === 'CHERRY')).toBe(true);
    expect(result.activePaylineKeys).toEqual([centerLine.key]);
    expect(result.winningLines).toHaveLength(1);
    expect(result.winningLines[0]).toMatchObject({
      paylineKey: centerLine.key,
      symbolKey: 'CHERRY',
      matchCount: 3,
      payoutCents: 600n,
    });
    expect(result.totalWagerCents).toBe(100n);
    expect(result.payoutCents).toBe(600n);
  });

  it('only makes Empire Gold progressive-eligible at max line bet with every line selected', () => {
    const machine: CasinoSlotMachineRules = classicOgV12B.casino.slots.machines[2]!;
    const allLines = machine.paylines.map((line) => line.key);
    expect(resolveSlotSpin(machine, 12_500n, allLines, rngForMiddleSymbol(machine, 'JACKPOT')).jackpotTriggered).toBe(true);
    expect(resolveSlotSpin(machine, 10_000n, allLines, rngForMiddleSymbol(machine, 'JACKPOT')).jackpotTriggered).toBe(false);
    expect(resolveSlotSpin(machine, 12_500n, allLines.slice(0, -1), rngForMiddleSymbol(machine, 'JACKPOT')).jackpotTriggered).toBe(false);
  });

  it('awards rare free-spin bundles only after the paid-spin trigger succeeds', () => {
    const machine: CasinoSlotMachineRules = classicOgV12B.casino.slots.machines[0]!;
    expect(rollSlotFreeSpinAward(machine, sequenceRng([0.50]))).toBe(0);
    expect(rollSlotFreeSpinAward(machine, sequenceRng([0.0001, 0.10]))).toBe(1);
    expect(rollSlotFreeSpinAward(machine, sequenceRng([0.0001, 0.94]))).toBe(2);
    expect(rollSlotFreeSpinAward(machine, sequenceRng([0.0001, 0.985]))).toBe(3);
    expect(rollSlotFreeSpinAward(machine, sequenceRng([0.0001, 0.998]))).toBe(5);
    expect(rollSlotFreeSpinAward(machine, sequenceRng([0.0001, 0.9998]))).toBe(10);
  });

  it('large-sample return stays near the effective table including bonus spins', () => {
    for (const [index, machine] of classicOgV12B.casino.slots.machines.entries()) {
      const summary = simulateSlots(machine, 100_000, seededRng(12_000 + index));
      expect(summary.freeSpins).toBeGreaterThan(0);
      expect(summary.bonusTriggers).toBeGreaterThan(0);
      expect(Math.abs(summary.observedRtpBps - summary.theoreticalRtpBps)).toBeLessThan(400);
    }
  });
});
