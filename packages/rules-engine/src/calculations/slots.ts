import type {
  CasinoSlotMachineRules,
  CasinoSlotPaylineRules,
  CasinoSlotSymbolRules,
} from '@streets/rulesets';
import type { Rng } from '../rng.js';

export interface SlotLinePosition {
  reel: number;
  row: number;
}

export interface SlotLineWinMath {
  paylineKey: string;
  paylineName: string;
  symbolKey: string;
  symbolLabel: string;
  matchCount: number;
  payoutBps: number;
  payoutCents: bigint;
  positions: readonly SlotLinePosition[];
}

export interface SlotNearMissMath {
  paylineKey: string;
  symbolKey: string;
  symbolLabel: string;
  reel: number;
}

export interface SlotSpinMath {
  /** Three visible rows, each containing one symbol per reel. */
  grid: readonly (readonly CasinoSlotSymbolRules[])[];
  /** The server-selected middle-row stop on each circular virtual reel. */
  reelStops: readonly number[];
  activePaylineKeys: readonly string[];
  betPerLineCents: bigint;
  totalWagerCents: bigint;
  payoutBps: number;
  payoutCents: bigint;
  winningLines: readonly SlotLineWinMath[];
  jackpotContributionCents: bigint;
  jackpotTriggered: boolean;
  /** A genuine adjacent-strip near miss, never a fabricated client result. */
  nearMiss: SlotNearMissMath | null;
}

function normalizedRng(rng: Rng): number {
  const raw = rng();
  if (!Number.isFinite(raw)) return 0;
  return Math.min(0.9999999999999999, Math.max(0, raw));
}

function symbolMap(machine: CasinoSlotMachineRules): Map<string, CasinoSlotSymbolRules> {
  return new Map(machine.symbols.map((symbol) => [symbol.key, symbol]));
}

function paylineFor(machine: CasinoSlotMachineRules, key: string): CasinoSlotPaylineRules {
  const line = machine.paylines.find((candidate) => candidate.key === key);
  if (!line) throw new Error(`${machine.key} has no payline ${key}.`);
  if (line.rows.length !== machine.reels || line.rows.some((row) => !Number.isInteger(row) || row < 0 || row >= machine.rows)) {
    throw new Error(`${machine.key}/${line.key} has an invalid row path.`);
  }
  return line;
}

function validatedStrips(machine: CasinoSlotMachineRules): readonly (readonly string[])[] {
  if (machine.reelStrips.length !== machine.reels) {
    throw new Error(`${machine.key} must define one virtual strip per reel.`);
  }
  const symbols = symbolMap(machine);
  for (const [reel, strip] of machine.reelStrips.entries()) {
    if (strip.length < machine.rows) throw new Error(`${machine.key} reel ${reel + 1} is too short.`);
    for (const key of strip) {
      if (!symbols.has(key)) throw new Error(`${machine.key} reel ${reel + 1} contains unknown symbol ${key}.`);
    }
  }
  return machine.reelStrips;
}

function lineMatch(
  machine: CasinoSlotMachineRules,
  grid: readonly (readonly CasinoSlotSymbolRules[])[],
  line: CasinoSlotPaylineRules,
): { symbol: CasinoSlotSymbolRules; matchCount: number; positions: SlotLinePosition[] } {
  const first = grid[line.rows[0]!]![0]!;
  let matchCount = 1;
  const positions: SlotLinePosition[] = [{ reel: 0, row: line.rows[0]! }];

  for (let reel = 1; reel < machine.reels; reel++) {
    const row = line.rows[reel]!;
    const symbol = grid[row]![reel]!;
    if (symbol.key !== first.key) break;
    matchCount += 1;
    positions.push({ reel, row });
  }
  return { symbol: first, matchCount, positions };
}

export function slotLinePayoutBps(
  machine: CasinoSlotMachineRules,
  symbolKey: string,
  matchCount: number,
): number {
  if (matchCount < 3 || matchCount > 5) return 0;
  return machine.linePayoutBps[symbolKey]?.[matchCount as 3 | 4 | 5] ?? 0;
}

export function slotTotalWagerCents(
  betPerLineCents: bigint,
  activePaylineCount: number,
): bigint {
  if (betPerLineCents <= 0n || !Number.isInteger(activePaylineCount) || activePaylineCount <= 0) {
    throw new Error('A slot spin needs a positive line bet and at least one active payline.');
  }
  return betPerLineCents * BigInt(activePaylineCount);
}

function fullMatchValue(machine: CasinoSlotMachineRules, symbolKey: string): number {
  if (machine.progressive?.symbolKey === symbolKey) return Number.MAX_SAFE_INTEGER;
  return slotLinePayoutBps(machine, symbolKey, machine.reels);
}

function detectNearMiss(
  machine: CasinoSlotMachineRules,
  grid: readonly (readonly CasinoSlotSymbolRules[])[],
  activeLines: readonly CasinoSlotPaylineRules[],
): SlotNearMissMath | null {
  const lastReel = machine.reels - 1;
  for (const line of activeLines) {
    const targetRow = line.rows[lastReel]!;
    const first = grid[line.rows[0]!]![0]!;
    if (fullMatchValue(machine, first.key) < 500_000) continue;

    let prefixMatches = true;
    for (let reel = 1; reel < lastReel; reel++) {
      if (grid[line.rows[reel]!]![reel]!.key !== first.key) {
        prefixMatches = false;
        break;
      }
    }
    if (!prefixMatches || grid[targetRow]![lastReel]!.key === first.key) continue;

    const adjacentRows = [targetRow - 1, targetRow + 1].filter((row) => row >= 0 && row < machine.rows);
    if (adjacentRows.some((row) => grid[row]![lastReel]!.key === first.key)) {
      return {
        paylineKey: line.key,
        symbolKey: first.key,
        symbolLabel: first.label,
        reel: lastReel,
      };
    }
  }
  return null;
}

/**
 * Paid-spin-only bonus roll. A successful trigger gets a second weighted draw
 * for 1/2/3/5/10 spins. Free spins themselves never call this function.
 */
export function rollSlotFreeSpinAward(machine: CasinoSlotMachineRules, rng: Rng): number {
  const bonus = machine.freeSpins;
  if (!bonus || bonus.triggerBps <= 0) return 0;
  const triggerTicket = Math.floor(normalizedRng(rng) * 10_000);
  if (triggerTicket >= bonus.triggerBps) return 0;

  const totalWeight = bonus.awards.reduce((sum, award) => sum + award.weight, 0);
  if (!Number.isInteger(totalWeight) || totalWeight <= 0) throw new Error(`${machine.key} has invalid free-spin weights.`);
  let ticket = Math.floor(normalizedRng(rng) * totalWeight);
  for (const award of bonus.awards) {
    if (!Number.isInteger(award.weight) || award.weight <= 0) throw new Error(`${machine.key} has an invalid free-spin award weight.`);
    if (ticket < award.weight) return award.spins;
    ticket -= award.weight;
  }
  return bonus.awards[bonus.awards.length - 1]!.spins;
}

export function expectedFreeSpinsPerPaidSpin(machine: CasinoSlotMachineRules): number {
  const bonus = machine.freeSpins;
  if (!bonus?.triggerBps) return 0;
  const totalWeight = bonus.awards.reduce((sum, award) => sum + award.weight, 0);
  const weightedSpins = bonus.awards.reduce((sum, award) => sum + award.spins * award.weight, 0);
  return (bonus.triggerBps / 10_000) * (weightedSpins / totalWeight);
}

/**
 * 1.2.0-B. Pure virtual-reel math. The caller supplies RNG; the browser never does.
 * One random stop is chosen per reel, and the three visible rows are the adjacent
 * strip positions around that middle-row stop.
 */
export function resolveSlotSpin(
  machine: CasinoSlotMachineRules,
  betPerLineCents: bigint,
  activePaylineKeys: readonly string[],
  rng: Rng,
): SlotSpinMath {
  if (machine.rows !== 3 || machine.reels < 3 || machine.reels > 5) {
    throw new Error(`${machine.key} has unsupported reel dimensions.`);
  }
  if (!activePaylineKeys.length) throw new Error('Select at least one payline.');

  const requested = new Set(activePaylineKeys);
  if (requested.size !== activePaylineKeys.length) throw new Error('A payline cannot be selected twice.');
  for (const key of requested) paylineFor(machine, key);

  const activeLines = machine.paylines.filter((line) => requested.has(line.key));
  if (activeLines.length !== requested.size) throw new Error('One or more selected paylines are invalid.');

  const strips = validatedStrips(machine);
  const symbols = symbolMap(machine);
  const reelStops = strips.map((strip) => Math.floor(normalizedRng(rng) * strip.length));
  const grid = Array.from({ length: machine.rows }, (_, row) =>
    strips.map((strip, reel) => {
      const stop = reelStops[reel]!;
      const offset = row - 1;
      const index = (stop + offset + strip.length) % strip.length;
      return symbols.get(strip[index]!)!;
    }),
  );

  const totalWagerCents = slotTotalWagerCents(betPerLineCents, activeLines.length);
  const allLinesActive = activeLines.length === machine.paylines.length;
  const progressiveEligible = Boolean(
    machine.progressive
      && betPerLineCents >= BigInt(machine.progressive.eligibleBetPerLineCents)
      && (!machine.progressive.requiresAllPaylines || allLinesActive),
  );
  const winningLines: SlotLineWinMath[] = [];

  for (const line of activeLines) {
    const match = lineMatch(machine, grid, line);
    if (match.matchCount < 3) continue;
    const payoutBps = slotLinePayoutBps(machine, match.symbol.key, match.matchCount);
    const payoutCents = (betPerLineCents * BigInt(payoutBps)) / 10_000n;
    const qualifiesProgressive = Boolean(
      progressiveEligible
        && machine.progressive?.symbolKey === match.symbol.key
        && match.matchCount === machine.reels,
    );
    if (payoutBps > 0 || qualifiesProgressive) {
      winningLines.push({
        paylineKey: line.key,
        paylineName: line.name,
        symbolKey: match.symbol.key,
        symbolLabel: match.symbol.label,
        matchCount: match.matchCount,
        payoutBps,
        payoutCents,
        positions: match.positions,
      });
    }
  }

  const payoutCents = winningLines.reduce((sum, win) => sum + win.payoutCents, 0n);
  const payoutBps = totalWagerCents > 0n ? Number((payoutCents * 10_000n) / totalWagerCents) : 0;
  const jackpotContributionCents = machine.progressive
    ? (totalWagerCents * BigInt(machine.progressive.contributionBps)) / 10_000n
    : 0n;
  const jackpotTriggered = Boolean(
    progressiveEligible
      && machine.progressive
      && winningLines.some(
        (win) => win.symbolKey === machine.progressive!.symbolKey && win.matchCount === machine.reels,
      ),
  );

  return {
    grid,
    reelStops,
    activePaylineKeys: activeLines.map((line) => line.key),
    betPerLineCents,
    totalWagerCents,
    payoutBps,
    payoutCents,
    winningLines,
    jackpotContributionCents,
    jackpotTriggered,
    nearMiss: winningLines.length ? null : detectNearMiss(machine, grid, activeLines),
  };
}

function reelSymbolCounts(machine: CasinoSlotMachineRules): Array<Map<string, number>> {
  const strips = validatedStrips(machine);
  return strips.map((strip) => {
    const counts = new Map<string, number>();
    for (const key of strip) counts.set(key, (counts.get(key) ?? 0) + 1);
    return counts;
  });
}

/**
 * Exact base-game RTP for one selected payline at a given line denomination.
 * Every row of a circular reel has the same marginal symbol frequency, so this
 * is also the RTP when several paylines are selected.
 */
export function theoreticalSlotRtpBps(
  machine: CasinoSlotMachineRules,
  betPerLineCents = machine.minBetPerLineCents,
): number {
  if (!Number.isSafeInteger(betPerLineCents) || betPerLineCents <= 0) {
    throw new Error('betPerLineCents must be a positive whole-cent amount.');
  }
  const strips = validatedStrips(machine);
  const counts = reelSymbolCounts(machine);
  const denominator = strips.reduce((product, strip) => product * BigInt(strip.length), 1n);
  let weightedPaidCents = 0n;

  for (const symbol of machine.symbols) {
    for (let run = 3; run <= machine.reels; run++) {
      let numerator = 1n;
      for (let reel = 0; reel < run; reel++) {
        numerator *= BigInt(counts[reel]!.get(symbol.key) ?? 0);
      }
      if (run < machine.reels) {
        numerator *= BigInt(strips[run]!.length - (counts[run]!.get(symbol.key) ?? 0));
        for (let reel = run + 1; reel < machine.reels; reel++) numerator *= BigInt(strips[reel]!.length);
      }
      const payoutBps = slotLinePayoutBps(machine, symbol.key, run);
      const payoutCents = (BigInt(betPerLineCents) * BigInt(payoutBps)) / 10_000n;
      weightedPaidCents += numerator * payoutCents;
    }
  }

  const expectedDenominator = denominator * BigInt(betPerLineCents);
  return Number((weightedPaidCents * 10_000n + expectedDenominator / 2n) / expectedDenominator);
}

/** Base-game RTP plus the expected value of non-retriggering free spins. */
export function effectiveSlotRtpBps(
  machine: CasinoSlotMachineRules,
  betPerLineCents = machine.minBetPerLineCents,
): number {
  const base = BigInt(theoreticalSlotRtpBps(machine, betPerLineCents));
  const bonus = machine.freeSpins;
  if (!bonus?.triggerBps) return Number(base);
  const totalWeight = BigInt(bonus.awards.reduce((sum, award) => sum + award.weight, 0));
  const weightedSpins = BigInt(bonus.awards.reduce((sum, award) => sum + award.spins * award.weight, 0));
  const denominator = 10_000n * totalWeight;
  const expectedFreeNumerator = BigInt(bonus.triggerBps) * weightedSpins;
  return Number((base * (denominator + expectedFreeNumerator) + denominator / 2n) / denominator);
}
