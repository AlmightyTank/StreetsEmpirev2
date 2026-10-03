import type { CasinoSlotMachineRules, CasinoSlotSymbolRules } from '@streets/rulesets';
import type { Rng } from '../rng.js';

export interface SlotSpinMath {
  reels: readonly [CasinoSlotSymbolRules, CasinoSlotSymbolRules, CasinoSlotSymbolRules];
  payoutBps: number;
  payoutCents: bigint;
  jackpotContributionCents: bigint;
  jackpotTriggered: boolean;
}

function drawSymbol(machine: CasinoSlotMachineRules, rng: Rng): CasinoSlotSymbolRules {
  const total = machine.symbols.reduce((sum, symbol) => sum + symbol.weight, 0);
  if (!Number.isInteger(total) || total <= 0) throw new Error(`${machine.key} has no weighted symbols.`);
  const raw = rng();
  const normalized = Number.isFinite(raw) ? Math.min(0.9999999999999999, Math.max(0, raw)) : 0;
  let ticket = Math.floor(normalized * total);
  for (const symbol of machine.symbols) {
    if (!Number.isInteger(symbol.weight) || symbol.weight <= 0) throw new Error(`${machine.key}/${symbol.key} has an invalid weight.`);
    if (ticket < symbol.weight) return symbol;
    ticket -= symbol.weight;
  }
  return machine.symbols[machine.symbols.length - 1]!;
}

export function slotPayoutBps(
  machine: CasinoSlotMachineRules,
  reels: readonly [CasinoSlotSymbolRules, CasinoSlotSymbolRules, CasinoSlotSymbolRules],
): number {
  const [a, b, c] = reels;
  if (a.key === b.key && b.key === c.key) return machine.triplePayoutBps[a.key] ?? 0;
  const pair = a.key === b.key ? a.key : a.key === c.key ? a.key : b.key === c.key ? b.key : null;
  return pair ? machine.pairPayoutBps[pair] ?? 0 : 0;
}

/**
 * 1.2.0-B. Pure three-reel math. The caller supplies RNG; the browser never does.
 * Payout is the total return from the machine, so bankroll delta is payout - wager.
 */
export function resolveSlotSpin(
  machine: CasinoSlotMachineRules,
  wagerCents: bigint,
  rng: Rng,
): SlotSpinMath {
  const reels = [drawSymbol(machine, rng), drawSymbol(machine, rng), drawSymbol(machine, rng)] as const;
  const payoutBps = slotPayoutBps(machine, reels);
  const payoutCents = (wagerCents * BigInt(payoutBps)) / 10_000n;
  const jackpotContributionCents = machine.progressive
    ? (wagerCents * BigInt(machine.progressive.contributionBps)) / 10_000n
    : 0n;
  const jackpotTriggered = Boolean(
    machine.progressive
      && wagerCents >= BigInt(machine.progressive.eligibleWagerCents)
      && reels.every((symbol) => symbol.key === machine.progressive!.symbolKey),
  );

  return { reels, payoutBps, payoutCents, jackpotContributionCents, jackpotTriggered };
}

/** Exact base-game RTP, excluding a progressive pool award, in basis points. */
export function theoreticalSlotRtpBps(machine: CasinoSlotMachineRules): number {
  const total = machine.symbols.reduce((sum, symbol) => sum + symbol.weight, 0);
  const denominator = BigInt(total ** 3);
  let weightedPayout = 0n;

  for (const a of machine.symbols) {
    for (const b of machine.symbols) {
      for (const c of machine.symbols) {
        const weight = BigInt(a.weight * b.weight * c.weight);
        weightedPayout += weight * BigInt(slotPayoutBps(machine, [a, b, c]));
      }
    }
  }

  return Number((weightedPayout + denominator / 2n) / denominator);
}
