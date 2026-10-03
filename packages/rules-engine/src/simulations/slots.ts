import type { CasinoSlotMachineRules } from '@streets/rulesets';
import { resolveSlotSpin, theoreticalSlotRtpBps } from '../calculations/slots.js';
import type { Rng } from '../rng.js';

export interface SlotSimulationSummary {
  spins: number;
  wagerCents: bigint;
  paidCents: bigint;
  observedRtpBps: number;
  theoreticalRtpBps: number;
  hitRateBps: number;
  jackpotTriggers: number;
}

/** 1.2.0-B QA helper: large-sample machine behavior with injectable seeded RNG. */
export function simulateSlots(
  machine: CasinoSlotMachineRules,
  spins: number,
  rng: Rng,
  wagerCents = BigInt(machine.maxWagerCents),
): SlotSimulationSummary {
  if (!Number.isInteger(spins) || spins <= 0) throw new Error('spins must be a positive integer');
  let paidCents = 0n;
  let hits = 0;
  let jackpotTriggers = 0;

  for (let i = 0; i < spins; i++) {
    const result = resolveSlotSpin(machine, wagerCents, rng);
    paidCents += result.payoutCents;
    if (result.payoutCents > 0n) hits += 1;
    if (result.jackpotTriggered) jackpotTriggers += 1;
  }

  const wageredCents = wagerCents * BigInt(spins);
  return {
    spins,
    wagerCents: wageredCents,
    paidCents,
    observedRtpBps: wageredCents > 0n ? Number((paidCents * 10_000n) / wageredCents) : 0,
    theoreticalRtpBps: theoreticalSlotRtpBps(machine),
    hitRateBps: Math.round((hits / spins) * 10_000),
    jackpotTriggers,
  };
}
