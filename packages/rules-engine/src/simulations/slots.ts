import type { CasinoSlotMachineRules } from '@streets/rulesets';
import {
  effectiveSlotRtpBps,
  resolveSlotSpin,
  rollSlotFreeSpinAward,
  theoreticalSlotRtpBps,
} from '../calculations/slots.js';
import type { Rng } from '../rng.js';

export interface SlotSimulationSummary {
  /** Number of player-paid trigger spins. */
  spins: number;
  /** Player-paid wager only. Comped free-spin nominal bets are excluded. */
  wagerCents: bigint;
  paidCents: bigint;
  observedRtpBps: number;
  /** Effective theoretical return including non-retriggering free spins. */
  theoreticalRtpBps: number;
  baseRtpBps: number;
  hitRateBps: number;
  jackpotTriggers: number;
  freeSpins: number;
  bonusTriggers: number;
}

/** 1.2.0-B QA helper: paid spins plus every awarded non-retriggering free spin. */
export function simulateSlots(
  machine: CasinoSlotMachineRules,
  spins: number,
  rng: Rng,
  betPerLineCents = machine.minBetPerLineCents,
  activePaylineKeys: readonly string[] = machine.paylines.map((line) => line.key),
): SlotSimulationSummary {
  if (!Number.isInteger(spins) || spins <= 0) throw new Error('spins must be a positive integer');
  let paidCents = 0n;
  let wagerCents = 0n;
  let hits = 0;
  let resolvedSpins = 0;
  let jackpotTriggers = 0;
  let freeSpins = 0;
  let bonusTriggers = 0;

  const settle = (isPaid: boolean) => {
    const result = resolveSlotSpin(machine, BigInt(betPerLineCents), activePaylineKeys, rng);
    if (isPaid) wagerCents += result.totalWagerCents;
    paidCents += result.payoutCents;
    resolvedSpins += 1;
    if (result.payoutCents > 0n) hits += 1;
    if (result.jackpotTriggered) jackpotTriggers += 1;
    return result;
  };

  for (let i = 0; i < spins; i++) {
    settle(true);
    const awarded = rollSlotFreeSpinAward(machine, rng);
    if (awarded > 0) {
      bonusTriggers += 1;
      freeSpins += awarded;
      for (let free = 0; free < awarded; free++) settle(false);
    }
  }

  return {
    spins,
    wagerCents,
    paidCents,
    observedRtpBps: wagerCents > 0n ? Number((paidCents * 10_000n) / wagerCents) : 0,
    theoreticalRtpBps: effectiveSlotRtpBps(machine, betPerLineCents),
    baseRtpBps: theoreticalSlotRtpBps(machine, betPerLineCents),
    hitRateBps: resolvedSpins > 0 ? Math.round((hits / resolvedSpins) * 10_000) : 0,
    jackpotTriggers,
    freeSpins,
    bonusTriggers,
  };
}
