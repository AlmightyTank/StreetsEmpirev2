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

export interface SlotSpinMath {
  /** Three visible rows, each containing one symbol per reel. */
  grid: readonly (readonly CasinoSlotSymbolRules[])[];
  activePaylineKeys: readonly string[];
  betPerLineCents: bigint;
  totalWagerCents: bigint;
  payoutBps: number;
  payoutCents: bigint;
  winningLines: readonly SlotLineWinMath[];
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
    if (!Number.isInteger(symbol.weight) || symbol.weight <= 0) {
      throw new Error(`${machine.key}/${symbol.key} has an invalid weight.`);
    }
    if (ticket < symbol.weight) return symbol;
    ticket -= symbol.weight;
  }
  return machine.symbols[machine.symbols.length - 1]!;
}

function paylineFor(machine: CasinoSlotMachineRules, key: string): CasinoSlotPaylineRules {
  const line = machine.paylines.find((candidate) => candidate.key === key);
  if (!line) throw new Error(`${machine.key} has no payline ${key}.`);
  if (line.rows.length !== machine.reels || line.rows.some((row) => !Number.isInteger(row) || row < 0 || row >= machine.rows)) {
    throw new Error(`${machine.key}/${line.key} has an invalid row path.`);
  }
  return line;
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

/**
 * 1.2.0-B. Pure video-slot math. The caller supplies RNG; the browser never does.
 * A spin draws a 3-row window, evaluates only selected paylines, and pays matching
 * symbols consecutively from the leftmost reel.
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

  const grid = Array.from({ length: machine.rows }, () =>
    Array.from({ length: machine.reels }, () => drawSymbol(machine, rng)),
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
    activePaylineKeys: activeLines.map((line) => line.key),
    betPerLineCents,
    totalWagerCents,
    payoutBps,
    payoutCents,
    winningLines,
    jackpotContributionCents,
    jackpotTriggered,
  };
}

/**
 * Exact base-game RTP at one line denomination, excluding progressive awards.
 * Payouts are rounded down to cents exactly the same way as a real resolved spin.
 */
export function theoreticalSlotRtpBps(
  machine: CasinoSlotMachineRules,
  betPerLineCents = machine.minBetPerLineCents,
): number {
  if (!Number.isSafeInteger(betPerLineCents) || betPerLineCents <= 0) {
    throw new Error('betPerLineCents must be a positive whole-cent amount.');
  }

  const totalWeight = machine.symbols.reduce((sum, symbol) => sum + symbol.weight, 0);
  if (!Number.isInteger(totalWeight) || totalWeight <= 0) throw new Error(`${machine.key} has no weighted symbols.`);
  const denominator = BigInt(totalWeight) ** BigInt(machine.reels);
  let weightedPaidCents = 0n;

  function visit(
    reel: number,
    firstKey: string | null,
    run: number,
    stillMatching: boolean,
    weightProduct: bigint,
  ): void {
    if (reel === machine.reels) {
      if (!firstKey || run < 3) return;
      const payoutBps = slotLinePayoutBps(machine, firstKey, run);
      const payoutCents = (BigInt(betPerLineCents) * BigInt(payoutBps)) / 10_000n;
      weightedPaidCents += weightProduct * payoutCents;
      return;
    }

    for (const symbol of machine.symbols) {
      const same = reel === 0 || (stillMatching && symbol.key === firstKey);
      visit(
        reel + 1,
        reel === 0 ? symbol.key : firstKey,
        same ? run + 1 : run,
        reel === 0 ? true : stillMatching && symbol.key === firstKey,
        weightProduct * BigInt(symbol.weight),
      );
    }
  }

  visit(0, null, 0, true, 1n);
  const expectedDenominator = denominator * BigInt(betPerLineCents);
  return Number((weightedPaidCents * 10_000n + expectedDenominator / 2n) / expectedDenominator);
}
