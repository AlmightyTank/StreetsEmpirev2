import type { Ruleset } from '@streets/rulesets';
import {
  runTravelRoundSimulation,
  travelRoundStarts,
  travelRoundStyles,
  type TravelRoundSummary,
} from './travel-round.js';
import { runTurfPushSimulation, runTurfSimulation, type TurfBlockSummary } from './turf.js';
import type { TravelCrew } from './travel.js';

/**
 * 0.6.0-F. Full-round Turf release model.
 *
 * The 0.5.0-F round simulator remains the source of truth for street, Produce,
 * travel risk, runs and relocation. This layer asks what changes when that same
 * crew also spends turns establishing/servicing turf, leaves muscle on corners,
 * gets pushed, pushes back, and optionally maintains one away outpost.
 *
 * This is deliberately an expected-value release gate, not a bot AI. It prices
 * opportunity cost against the exact travel-round result for the same
 * style/start/home so Turf cannot "win" by pretending the road does not exist.
 */

export type TurfRoundStrategyKey = 'holder' | 'raider' | 'runner' | 'mover' | 'mixed';
export type TurfRoundField = 'solo' | 'alliance';

export interface TurfRoundSummary {
  readonly style: string;
  readonly start: string;
  readonly home: string;
  readonly field: TurfRoundField;
  readonly strategy: TurfRoundStrategyKey;
  readonly strategyName: string;
  readonly baseStrategy: string;
  readonly baseScoreCents: number;
  readonly turfDeltaCents: number;
  readonly scoreCents: number;
  readonly homeBlocks: number;
  readonly awayBlocks: number;
  readonly setupTurns: number;
  readonly serviceTurns: number;
  readonly pushes: number;
  readonly pushWins: number;
  readonly holdDays: number;
  readonly outpostDays: number;
  readonly garageBought: boolean;
  readonly garageCostCents: number;
}

export const TURF_ROUND_DAYS = 28;

/**
 * Unknown player-population behavior is kept in one explicit box so public
 * round data can replace assumptions without touching the model.
 */
export const TURF_ROUND_WORLD = {
  /** Serious pushes a visible holder attracts in a week. */
  pushesAtHolderPerWeek: 2,
  /** Pushes a turf-focused raider starts in a week. */
  raiderPushesPerWeek: 4,
  /** Opportunistic pushes mixed play starts in a week. */
  mixedPushesPerWeek: 1,
  /** Time a raider keeps a won corner before moving on. */
  raiderHoldDaysPerWin: 1.5,
  /** A successful enemy push costs this long before a rational holder is back on useful turf. */
  lostHoldDaysPerEnemyWin: 1.5,
  /** Away boxes are serviced weekly; each visit has a fill and a collect transfer. */
  outpostServiceEveryDays: 7,
  outpostTransfersPerVisit: 2,
  /** Share of won turf fights assumed to be against an away outpost. */
  raiderOutpostTargetShare: 0.25,
  /** Expected box fullness when a raider finds an outpost. */
  raiderOutpostCashFill: 0.4,
} as const;

const STRATEGY_NAMES: Readonly<Record<TurfRoundStrategyKey, string>> = {
  holder: 'Holder',
  raider: 'Turf raider',
  runner: 'Runner',
  mover: 'Mover',
  mixed: 'Mixed empire',
};

function startWorth(ruleset: Ruleset, startName: string): number {
  const start = travelRoundStarts.find((row) => row.name === startName);
  if (!start) return 0;
  const worth = ruleset.economy.netWorth;
  return start.cashCents * (worth.cashWeightPercent / 100)
    + start.whores * worth.perWhoreCents
    + start.thugs * worth.perThugCents
    + start.lowRiders * worth.perLowRiderCents;
}

function baseFor(group: readonly TravelRoundSummary[], strategy: TurfRoundStrategyKey): TravelRoundSummary | null {
  if (strategy === 'runner') return group.find((row) => row.strategy === 'runner') ?? null;
  if (strategy === 'holder' || strategy === 'raider') return group.find((row) => row.strategy === 'street') ?? null;

  // Moving is evaluated on the best mixed road/economy plan in the requested
  // destination. Mixed empire starts there too, then decides if Turf adds value.
  const mixed = group
    .filter((row) => row.strategy === 'mixed' || row.strategy === 'mixed-profit' || row.strategy === 'mixed-supply')
    .sort((a, b) => b.scoreCents - a.scoreCents)[0];
  return mixed ?? null;
}

function representativeCrew(base: TravelRoundSummary): TravelCrew {
  const start = travelRoundStarts.find((row) => row.name === base.start);
  return {
    name: `${base.style} · ${base.start} · ${base.home}`,
    whores: Math.max(1, Math.round(((start?.whores ?? base.whores) + base.whores) / 2)),
    thugs: Math.max(1, Math.round(((start?.thugs ?? base.thugs) + base.thugs) / 2)),
    lowRiders: Math.max(0, Math.round(((start?.lowRiders ?? base.lowRiders) + base.lowRiders) / 2)),
    cashCents: Math.max(0, Math.round(((start?.cashCents ?? base.cashCents) + base.cashCents) / 2)),
  };
}

function netCashPerDay(row: TurfBlockSummary): number {
  return row.gainCentsPerDay - row.costCentsPerDay;
}

function bestRows(rows: readonly TurfBlockSummary[], limit: number): TurfBlockSummary[] {
  return rows
    .filter((row) => row.takeable && netCashPerDay(row) > 0)
    .sort((a, b) => netCashPerDay(b) - netCashPerDay(a))
    .slice(0, Math.max(0, limit));
}

const pushRateCache = new WeakMap<object, { solo: number; alliance: number }>();

function fieldAttackerWinRate(ruleset: Ruleset, field: TurfRoundField): number {
  let cached = pushRateCache.get(ruleset);
  if (!cached) {
    const pushes = runTurfPushSimulation(ruleset);
    cached = {
      solo: pushes?.noBackupWinRate ?? 0,
      alliance: pushes?.reinforcementWinRate ?? 0,
    };
    pushRateCache.set(ruleset, cached);
  }
  return cached[field];
}

function holdDays(ruleset: Ruleset, field: TurfRoundField, days: number): number {
  const attempts = TURF_ROUND_WORLD.pushesAtHolderPerWeek * days / 7;
  const lost = attempts * fieldAttackerWinRate(ruleset, field) * TURF_ROUND_WORLD.lostHoldDaysPerEnemyWin;
  return Math.max(days * 0.5, days - lost);
}

function turnValue(ruleset: Ruleset, base: TravelRoundSummary, days: number): number {
  const style = travelRoundStyles.find((row) => row.name === base.style);
  const totalTurns = Math.max(1, (style?.sessionsPerDay ?? 1) * (style?.sessionTurns ?? 1) * days);
  return Math.max(1, (base.scoreCents - startWorth(ruleset, base.start)) / totalTurns);
}

function setupTurnsPerBlock(ruleset: Ruleset): number {
  const turf = ruleset.turf;
  if (!turf) return 0;
  return turf.presence.turnsToClaim + turf.corner.postTurnCost + turf.push.turnCost;
}

function cashToWorth(ruleset: Ruleset, cashCents: number): number {
  return cashCents * (ruleset.economy.netWorth.cashWeightPercent / 100);
}

function blockContribution(
  ruleset: Ruleset,
  row: TurfBlockSummary,
  daysHeld: number,
  turns: number,
  worthPerTurn: number,
): number {
  return cashToWorth(ruleset, netCashPerDay(row) * daysHeld) - turns * worthPerTurn;
}

function expectedOutpostLootCash(ruleset: Ruleset): number {
  const outposts = ruleset.turf?.outposts;
  if (!outposts) return 0;
  const stored = outposts.cashCapCents * TURF_ROUND_WORLD.raiderOutpostCashFill;
  return Math.min(stored * outposts.lootShare, outposts.lootCashCapCents);
}

function scoreSituation(
  ruleset: Ruleset,
  group: readonly TravelRoundSummary[],
  field: TurfRoundField,
  strategy: TurfRoundStrategyKey,
  days: number,
): TurfRoundSummary | null {
  const turf = ruleset.turf;
  const base = baseFor(group, strategy);
  if (!turf || !base) return null;

  if (strategy === 'runner' || strategy === 'mover') {
    return {
      style: base.style,
      start: base.start,
      home: base.home,
      field,
      strategy,
      strategyName: STRATEGY_NAMES[strategy],
      baseStrategy: base.strategyName,
      baseScoreCents: base.scoreCents,
      turfDeltaCents: 0,
      scoreCents: base.scoreCents,
      homeBlocks: 0,
      awayBlocks: 0,
      setupTurns: 0,
      serviceTurns: 0,
      pushes: 0,
      pushWins: 0,
      holdDays: 0,
      outpostDays: 0,
      garageBought: false,
      garageCostCents: 0,
    };
  }

  const crew = representativeCrew(base);
  const turfSummary = runTurfSimulation(ruleset, [crew])[0];
  if (!turfSummary) return null;
  const worthPerTurn = turnValue(ruleset, base, days);
  const home = turfSummary.blocks.filter((row) => row.block.citySlug === base.home);
  const away = turfSummary.blocks.filter((row) => row.block.citySlug !== base.home);
  const heldDays = holdDays(ruleset, field, days);
  const setupPer = setupTurnsPerBlock(ruleset);

  let delta = 0;
  let homeBlocks = 0;
  let awayBlocks = 0;
  let setupTurns = 0;
  let serviceTurns = 0;
  let pushes = 0;
  let pushWins = 0;
  let outpostDays = 0;
  let garageBought = false;
  let garageCostCents = 0;

  if (strategy === 'holder') {
    const chosen = bestRows(home, turf.caps.blocksPerCrewHome);
    for (const row of chosen) {
      const contribution = blockContribution(ruleset, row, heldDays, setupPer, worthPerTurn);
      if (contribution <= 0) continue;
      delta += contribution;
      homeBlocks += 1;
      setupTurns += setupPer;
    }
  }

  if (strategy === 'raider') {
    const target = [...home]
      .filter((row) => row.takeable)
      .sort((a, b) => b.gainCentsPerDay - a.gainCentsPerDay)[0];
    pushes = Math.floor(TURF_ROUND_WORLD.raiderPushesPerWeek * days / 7);
    const winRate = fieldAttackerWinRate(ruleset, field);
    pushWins = pushes * winRate;
    setupTurns = turf.presence.turnsToClaim + pushes * turf.push.turnCost;
    delta -= setupTurns * worthPerTurn;
    if (target) {
      delta += cashToWorth(
        ruleset,
        Math.max(0, netCashPerDay(target)) * TURF_ROUND_WORLD.raiderHoldDaysPerWin * pushWins,
      );
    }
    delta += cashToWorth(
      ruleset,
      pushWins * TURF_ROUND_WORLD.raiderOutpostTargetShare * expectedOutpostLootCash(ruleset),
    );
  }

  if (strategy === 'mixed') {
    // Mixed play takes only turf that is actually additive after setup/service
    // opportunity cost. It never has to hold turf just because the feature exists.
    const homeChoice = bestRows(home, 1)[0];
    if (homeChoice) {
      const contribution = blockContribution(ruleset, homeChoice, heldDays, setupPer, worthPerTurn);
      if (contribution > 0) {
        delta += contribution;
        homeBlocks = 1;
        setupTurns += setupPer;
      }
    }

    const awayChoice = bestRows(away, Math.min(1, turf.caps.blocksPerCrewAway))[0];
    if (awayChoice && turf.outposts) {
      const visits = Math.ceil(days / TURF_ROUND_WORLD.outpostServiceEveryDays);
      const transfers = visits * TURF_ROUND_WORLD.outpostTransfersPerVisit;
      const candidateServiceTurns = transfers * turf.outposts.transferTurnCost;
      const candidateSetupTurns = setupPer + turf.outposts.transferTurnCost;
      const candidateOutpostDays = heldDays;
      const garageCost = ruleset.hideout?.rooms.GARAGE?.costsCents?.[0] ?? 0;
      const canBuyGarage = Boolean(
        garageCost > 0
        && (ruleset.hideout?.buffs.garageRunLimit ?? 1) > 1
        && base.runs > 0
        && base.cashCents >= garageCost * 2,
      );
      const garageWorthCost = canBuyGarage ? cashToWorth(ruleset, garageCost) : 0;
      const contribution = blockContribution(
        ruleset,
        awayChoice,
        candidateOutpostDays,
        candidateSetupTurns + candidateServiceTurns,
        worthPerTurn,
      ) - garageWorthCost;

      if (contribution > 0) {
        delta += contribution;
        awayBlocks = 1;
        setupTurns += candidateSetupTurns;
        serviceTurns += candidateServiceTurns;
        outpostDays = candidateOutpostDays;
        garageBought = canBuyGarage;
        garageCostCents = canBuyGarage ? garageCost : 0;
      }
    }

    // Mixed play contests a block occasionally, but only when the expected
    // short hold/loot exceeds the turns it costs. This is the "raider" leg of
    // mixed play without forcing PvP into every successful empire.
    const target = [...home]
      .filter((row) => row.takeable)
      .sort((a, b) => b.gainCentsPerDay - a.gainCentsPerDay)[0];
    const candidatePushes = Math.floor(TURF_ROUND_WORLD.mixedPushesPerWeek * days / 7);
    if (target && candidatePushes > 0) {
      const winRate = fieldAttackerWinRate(ruleset, field);
      const wins = candidatePushes * winRate;
      const candidateTurns = turf.presence.turnsToClaim + candidatePushes * turf.push.turnCost;
      const prize = cashToWorth(
        ruleset,
        Math.max(0, netCashPerDay(target)) * TURF_ROUND_WORLD.raiderHoldDaysPerWin * wins
          + wins * TURF_ROUND_WORLD.raiderOutpostTargetShare * expectedOutpostLootCash(ruleset),
      ) - candidateTurns * worthPerTurn;
      if (prize > 0) {
        delta += prize;
        pushes += candidatePushes;
        pushWins += wins;
        setupTurns += candidateTurns;
      }
    }
  }

  return {
    style: base.style,
    start: base.start,
    home: base.home,
    field,
    strategy,
    strategyName: STRATEGY_NAMES[strategy],
    baseStrategy: base.strategyName,
    baseScoreCents: base.scoreCents,
    turfDeltaCents: Math.round(delta),
    scoreCents: Math.round(base.scoreCents + delta),
    homeBlocks,
    awayBlocks,
    setupTurns,
    serviceTurns,
    pushes,
    pushWins,
    holdDays: homeBlocks > 0 ? heldDays : 0,
    outpostDays,
    garageBought,
    garageCostCents,
  };
}

export function runTurfRoundSimulation(ruleset: Ruleset, days = TURF_ROUND_DAYS): TurfRoundSummary[] {
  if (!ruleset.turf) return [];
  const travel = runTravelRoundSimulation(ruleset, days);
  const rows: TurfRoundSummary[] = [];
  const fields: readonly TurfRoundField[] = ['solo', 'alliance'];
  const strategies: readonly TurfRoundStrategyKey[] = ['holder', 'raider', 'runner', 'mover', 'mixed'];

  for (const style of travelRoundStyles) {
    for (const start of travelRoundStarts) {
      for (const home of Object.keys(ruleset.cities ?? {})) {
        const group = travel.filter((row) => row.style === style.name && row.start === start.name && row.home === home);
        for (const field of fields) {
          for (const strategy of strategies) {
            const scored = scoreSituation(ruleset, group, field, strategy, days);
            if (scored) rows.push(scored);
          }
        }
      }
    }
  }
  return rows;
}

/**
 * 0.6.0-F release gate. Mixed play must beat the three pure release strategies
 * in every session style, start, city and solo/alliance field. Mover is retained
 * as a separate reference line; mixed may tie it when no block/outpost is worth
 * the opportunity cost, but Turf is never allowed to make the mixed line worse.
 */
export function turfRoundGate(ruleset: Ruleset, rows: readonly TurfRoundSummary[]): string[] {
  const problems: string[] = [];
  const expectedCities = Object.keys(ruleset.cities ?? {}).length;
  const groups = new Map<string, TurfRoundSummary[]>();
  for (const row of rows) {
    const key = `${row.style} · ${row.start} · ${row.home} · ${row.field}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  const expectedGroups = travelRoundStyles.length * travelRoundStarts.length * expectedCities * 2;
  if (groups.size !== expectedGroups) {
    problems.push(`Turf round produced ${groups.size} situations; expected ${expectedGroups} across every city and solo/alliance field.`);
  }

  for (const [situation, group] of groups) {
    const mixed = group.find((row) => row.strategy === 'mixed');
    if (!mixed) {
      problems.push(`${situation}: no mixed empire result.`);
      continue;
    }
    for (const key of ['holder', 'raider', 'runner'] as const) {
      const rival = group.find((row) => row.strategy === key);
      if (rival && rival.scoreCents >= mixed.scoreCents) {
        problems.push(`${situation}: ${rival.strategyName} (${money(rival.scoreCents)}) is not beaten by mixed play (${money(mixed.scoreCents)}).`);
      }
    }
    const mover = group.find((row) => row.strategy === 'mover');
    if (mover && mixed.scoreCents < mover.scoreCents) {
      problems.push(`${situation}: adding optional Turf made mixed play worse than the same road/move plan.`);
    }
  }

  return problems;
}

function money(cents: number): string {
  return `${cents < 0 ? '-' : ''}$${Math.round(Math.abs(cents) / 100).toLocaleString('en-US')}`;
}

export function turfRoundMarkdown(ruleset: Ruleset, rows: readonly TurfRoundSummary[]): string {
  if (!ruleset.turf) return '# Full round with Turf\n\nThis ruleset has no Turf.\n';
  const problems = turfRoundGate(ruleset, rows);
  const cityName = (slug: string) => ruleset.cities?.[slug]?.name ?? slug;
  const lines = [
    `# Full round with Turf - ${ruleset.meta.version}`,
    '',
    `Ruleset \`${ruleset.meta.id}\`. ${TURF_ROUND_DAYS} days. Street, Produce, road risk, runs and relocation come directly from the 0.5.0-F full-round model; this release layer adds expected Turf setup, corner opportunity cost/upkeep, pushes and one optional away outpost.`,
    '',
    `World assumptions: a holder draws ${TURF_ROUND_WORLD.pushesAtHolderPerWeek} serious pushes/week; a turf raider starts ${TURF_ROUND_WORLD.raiderPushesPerWeek}/week; mixed play starts ${TURF_ROUND_WORLD.mixedPushesPerWeek}/week when worthwhile; a raider keeps a won block ${TURF_ROUND_WORLD.raiderHoldDaysPerWin} days; an outpost is serviced every ${TURF_ROUND_WORLD.outpostServiceEveryDays} days.`,
    '',
    'Alliance rows use the configured chance-to-show reinforcement result when pricing holder uptime and contested pushes. Controlled-city tax immunity is deliberately left out of the score, so alliance results do not get free upside from an assumed city-control state.',
    '',
    'Outpost tax stays in the remote box but still counts toward net worth. Away upkeep and lost home production are already in the block contribution. The Garage is bought only when an away holding is additive after its full purchase price and service-turn opportunity cost.',
    '',
    '## Gate',
    '',
    problems.length
      ? `**Fails.**\n\n${problems.map((line) => `- ${line}`).join('\n')}`
      : '**Passes.** In every session style, start, city and solo/alliance field, mixed play beats pure holding, turf raiding and running; optional Turf never makes the move/road plan worse.',
    '',
  ];

  const strategies: readonly TurfRoundStrategyKey[] = ['holder', 'raider', 'runner', 'mover', 'mixed'];
  for (const style of travelRoundStyles) {
    for (const start of travelRoundStarts) {
      for (const field of ['solo', 'alliance'] as const) {
        lines.push(
          `## ${style.name} · ${start.name} · ${field === 'alliance' ? 'Alliance field' : 'Solo field'}`,
          '',
          `| Home | ${strategies.map((key) => STRATEGY_NAMES[key]).join(' | ')} | Mixed turf | Garage |`,
          `| --- | ${strategies.map(() => '---:').join(' | ')} | --- | :--: |`,
        );
        for (const home of Object.keys(ruleset.cities ?? {})) {
          const group = rows.filter((row) => row.style === style.name && row.start === start.name && row.home === home && row.field === field);
          const cells = strategies.map((key) => {
            const row = group.find((entry) => entry.strategy === key);
            return row ? money(row.scoreCents) : '-';
          });
          const mixed = group.find((row) => row.strategy === 'mixed');
          const turf = mixed ? `${mixed.homeBlocks} home / ${mixed.awayBlocks} away; ${money(mixed.turfDeltaCents)}` : '-';
          lines.push(`| ${cityName(home)} | ${cells.join(' | ')} | ${turf} | ${mixed?.garageBought ? 'yes' : 'no'} |`);
        }
        lines.push('');
      }
    }
  }
  return lines.join('\n');
}
