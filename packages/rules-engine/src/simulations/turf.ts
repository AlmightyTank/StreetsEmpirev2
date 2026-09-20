import type { DistrictKey, Ruleset } from '@streets/rulesets';
import { hashParts, happinessMultiplier, seededRng } from '../rng.js';
import { clientMultiplier } from '../calculations/clients.js';
import { cityRules, rulesetForCity } from '../calculations/cities.js';
import {
  DISTRICT_KEYS,
  cornerMinimumFor,
  cornerUpkeep,
  localsThugs,
  turfBlocks,
  turfRulesetProblems,
  turfTax,
  turfPushCombatModel,
  type Block,
} from '../calculations/turf.js';
import { simulateRaid } from '../calculations/combat.js';
import { travelCrews, type TravelCrew } from './travel.js';

/**
 * 0.6.0-A. Is a block worth holding? For every crew and every one of the forty blocks:
 * what holding it pays over a day, against what the corner crew standing on it would be
 * worth at home, and against a day of the same crew's street work.
 *
 * Deliberately generous to turf, the way the 0.5.0-A travel simulation was generous to
 * runs: nobody pushes the holder off, the corner never goes short, and the rivals who pay
 * the tax turn up every day. 0.6.0-C cuts into this ceiling with pushes.
 *
 * The common currency is cash per day. The corner's cost is the street work those thugs
 * would have covered at home: a thug covers `protectionWhoresPerThug` girls on a block,
 * and a girl nobody is covering does not earn. A crew with muscle to spare pays nothing
 * to hold a block, which is exactly why the caps exist.
 */

const HAPPINESS = 85;
const KEEP = 0.5;

/** Turns a holder works its own block in a day, and a rival works someone else's. */
export const HOLDER_TURNS_PER_DAY = 120;
export const RIVAL_TURNS_PER_DAY = 60;
/** Rivals working a block: a quiet city and a busy one. */
export const QUIET_RIVALS = 1;
export const BUSY_RIVALS = 3;

/** A block is worth holding when a day of it pays this share of the corner crew's keep. */
export const TURF_WORTH_HOLDING = 1;
/**
 * Holding the home cap has to take a real bite out of the crew that defends the house, or
 * turf is free money for anyone with thugs to spare, and it must never strip the house bare.
 */
export const TURF_MIN_DEFENSE_SHARE = 0.1;
export const TURF_MAX_DEFENSE_SHARE = 0.6;

export interface TurfBlockSummary {
  readonly crew: string;
  readonly block: Block;
  readonly cityName: string;
  readonly district: DistrictKey;
  readonly cornerThugs: number;
  readonly localsThugs: number;
  /** Can this crew take it off the locals at all: armed, fit thugs against the locals' strength. */
  readonly takeable: boolean;
  readonly takePerTurnCents: number;
  /** What the hold bonus adds over a day of working your own block. */
  readonly holdBonusCentsPerDay: number;
  readonly quietTaxCentsPerDay: number;
  readonly busyTaxCentsPerDay: number;
  /** Hold bonus plus the tax a busy block mints. */
  readonly gainCentsPerDay: number;
  /** What the posted thugs would have covered at home. Zero for a crew with muscle to spare. */
  readonly costCentsPerDay: number;
  readonly paybackRatio: number;
  /** A day of holding against a day of this crew's street work. Under 1, turf never replaces the street. */
  readonly streetShare: number;
  /** Share of the crew's thugs standing on this corner instead of defending the house. */
  readonly defenseShare: number;
}

export interface TurfCrewSummary {
  readonly crew: TravelCrew;
  readonly streetCentsPerDay: number;
  readonly blocks: readonly TurfBlockSummary[];
}

/** What one turn on a block takes for this crew, in the city it is in. */
function takePerTurnCents(ruleset: Ruleset, crew: TravelCrew, citySlug: string, district: DistrictKey): number {
  const living = rulesetForCity(ruleset, citySlug);
  const rules = living.scouting;
  // A city's own district pay (0.5.0-D) lives on `scouting.districts`, not the catalog.
  const pay = rules.districts[district].payMultiplier;
  const capacities = rules.clients.capacities;
  // The average block, not the busiest: the capacities are hidden and reshuffled hourly.
  const clients = capacities.reduce((sum, capacity) => sum + clientMultiplier(capacity, crew.whores), 0) / capacities.length;
  return crew.whores * rules.grossPerWhorePerTurnCents * happinessMultiplier(HAPPINESS, rules.minHappinessMultiplier) * pay * clients * KEEP;
}

/** The best street day this crew can put together in its own city, whoever holds the block. */
function streetCentsPerDay(ruleset: Ruleset, crew: TravelCrew, citySlug: string): number {
  const living = rulesetForCity(ruleset, citySlug);
  let best = 0;
  for (const district of DISTRICT_KEYS) {
    if (crew.thugs * living.scouting.districts[district].protectionWhoresPerThug < crew.whores) continue;
    best = Math.max(best, takePerTurnCents(ruleset, crew, citySlug, district) * HOLDER_TURNS_PER_DAY);
  }
  return best;
}

/** Beer and product a corner burns in a day, priced where it stands. */
function cornerUpkeepCentsPerDay(ruleset: Ruleset, citySlug: string, thugs: number): number {
  const living = rulesetForCity(ruleset, citySlug);
  const { beer, product } = cornerUpkeep(ruleset, thugs, 24);
  const beerCents = living.stores.CORNER.items.BEER?.buyCents ?? 0;
  const productCents = living.stores.PIP.items.CRACK?.buyCents ?? 0;
  return beer * beerCents + product * productCents;
}

export function runTurfSimulation(ruleset: Ruleset, crews: readonly TravelCrew[] = travelCrews): TurfCrewSummary[] {
  const rules = ruleset.turf;
  if (!rules) return [];
  const blocks = turfBlocks(ruleset);

  return crews.map((crew) => {
    const home = ruleset.round.startingCitySlug;
    const summaries = blocks.map((block) => {
      const district = rules.districts[block.district];
      // A corner is as big as the crew that holds it, so a late crew posts more than a mid one.
      const cornerThugs = cornerMinimumFor(ruleset, block.district, crew.thugs);
      const locals = localsThugs(ruleset, block);
      const take = takePerTurnCents(ruleset, crew, block.citySlug, block.district);

      const holdBonusCentsPerDay = take * HOLDER_TURNS_PER_DAY * (district.holdBonus - 1);
      const perRival = turfTax(ruleset, block.district, take * RIVAL_TURNS_PER_DAY).mintCents;
      const quietTaxCentsPerDay = perRival * QUIET_RIVALS;
      const busyTaxCentsPerDay = perRival * BUSY_RIVALS;

      // What the posted thugs were worth at home: the girls they were covering, plus what
      // the corner drinks and smokes standing there.
      const cover = ruleset.scouting.districts[block.district].protectionWhoresPerThug;
      const spare = Math.max(0, crew.thugs - Math.ceil(crew.whores / cover));
      const uncovered = Math.min(crew.whores, Math.max(0, cornerThugs - spare) * cover);
      const perWhore = crew.whores > 0 ? take / crew.whores : 0;
      const costCentsPerDay = uncovered * perWhore * HOLDER_TURNS_PER_DAY
        + cornerUpkeepCentsPerDay(ruleset, block.citySlug, cornerThugs);

      const gainCentsPerDay = holdBonusCentsPerDay + busyTaxCentsPerDay;
      const street = streetCentsPerDay(ruleset, crew, block.citySlug);
      return {
        crew: crew.name,
        block,
        cityName: cityRules(ruleset, block.citySlug)?.name ?? block.citySlug,
        district: block.district,
        cornerThugs,
        localsThugs: locals,
        takeable: crew.thugs >= locals,
        takePerTurnCents: take,
        holdBonusCentsPerDay,
        quietTaxCentsPerDay,
        busyTaxCentsPerDay,
        gainCentsPerDay,
        costCentsPerDay,
        paybackRatio: costCentsPerDay > 0 ? gainCentsPerDay / costCentsPerDay : Number.POSITIVE_INFINITY,
        streetShare: street > 0 ? gainCentsPerDay / street : 0,
        defenseShare: crew.thugs > 0 ? cornerThugs / crew.thugs : 1,
      } satisfies TurfBlockSummary;
    });
    return { crew, streetCentsPerDay: streetCentsPerDay(ruleset, crew, home), blocks: summaries };
  });
}

export interface TurfPushSimulation {
  samples: number;
  squad: number;
  helperThugs: number;
  noBackupWinRate: number;
  reinforcementWinRate: number;
  reinforcementShowRate: number;
}

/**
 * 0.6.0-C's fight gate. Equal, pistol-armed crews contest the same corner many
 * deterministic times. The reinforced line includes the configured alliance show-up roll,
 * rather than pretending every call arrives.
 */
export function runTurfPushSimulation(ruleset: Ruleset, samples = 4_000): TurfPushSimulation | null {
  if (!ruleset.turf?.wars) return null;
  const model = turfPushCombatModel(ruleset);
  if (!model) return null;
  const squad = Math.min(20, model.squadCap);
  const helperThugs = Math.max(1, Math.floor(squad * ruleset.turf.push.allies.maxShareOfDefender));
  const weapons = (count: number) => ({ PISTOL: count, SHOTGUN: 0, TEK9: 0, AK47: 0 });
  const crew = (count: number) => ({ thugs: count, thugHappiness: HAPPINESS, weapons: weapons(count) });
  let noBackupWins = 0;
  let reinforcementWins = 0;
  let showed = 0;

  for (let i = 0; i < samples; i++) {
    const plain = simulateRaid({
      attacker: crew(squad),
      defender: crew(squad),
      attackingThugs: squad,
      attackerTurns: model.turnCost,
      defenderCashCents: 0n,
    }, model, seededRng(hashParts(ruleset.meta.id, 'turf-push-plain', i)));
    if (plain.winner === 'ATTACKER') noBackupWins += 1;

    const rng = seededRng(hashParts(ruleset.meta.id, 'turf-push-help', i));
    const help = rng() < ruleset.turf.push.allies.chanceToShowUp;
    if (help) showed += 1;
    const defended = squad + (help ? helperThugs : 0);
    const reinforced = simulateRaid({
      attacker: crew(squad),
      defender: crew(defended),
      attackingThugs: squad,
      attackerTurns: model.turnCost,
      defenderCashCents: 0n,
    }, model, rng);
    if (reinforced.winner === 'ATTACKER') reinforcementWins += 1;
  }

  return {
    samples,
    squad,
    helperThugs,
    noBackupWinRate: noBackupWins / samples,
    reinforcementWinRate: reinforcementWins / samples,
    reinforcementShowRate: showed / samples,
  };
}

/**
 * The 0.6.0-A gate:
 * - the ruleset's turf numbers hold together;
 * - every block is worth holding for somebody, or it is dead data;
 * - no block pays more than working the street, because turf supplements the street;
 * - the locals are a ladder: a fresh crew cannot walk onto every corner in the game, and
 *   a late crew is not shut out of any.
 */
export function turfGate(ruleset: Ruleset, summaries: readonly TurfCrewSummary[]): string[] {
  const problems = [...turfRulesetProblems(ruleset)];
  if (!ruleset.turf || summaries.length === 0) return problems;

  const blocks = turfBlocks(ruleset);
  for (const block of blocks) {
    const rows = summaries.flatMap((summary) =>
      summary.blocks.filter((row) => row.block.citySlug === block.citySlug && row.block.district === block.district));
    if (!rows.some((row) => row.paybackRatio >= TURF_WORTH_HOLDING && row.gainCentsPerDay > 0)) {
      problems.push(`${rows[0]?.cityName ?? block.citySlug} ${block.district}: no crew is better off holding it.`);
    }
    if (!rows.some((row) => row.takeable)) {
      problems.push(`${rows[0]?.cityName ?? block.citySlug} ${block.district}: the locals hold it against every crew in the game.`);
    }
  }

  for (const summary of summaries) {
    for (const row of summary.blocks) {
      if (row.streetShare >= 1) {
        problems.push(`${summary.crew.name} on ${row.cityName} ${row.district}: holding pays more than working (${row.streetShare.toFixed(2)}x a street day).`);
      }
    }
  }

  // The cheapest and dearest ways to fill the home cap, for every crew big enough to try.
  // A corner scales with its holder, so this has to bite the late crew as hard as the mid one.
  const cap = ruleset.turf.caps.blocksPerCrewHome;
  for (const summary of summaries) {
    // The home cap is blocks in one city, so each city is weighed on its own.
    const byCity = new Map<string, number[]>();
    for (const row of summary.blocks) {
      const shares = byCity.get(row.block.citySlug) ?? [];
      shares.push(row.defenseShare);
      byCity.set(row.block.citySlug, shares);
    }
    const sums = [...byCity.values()].map((shares) => {
      const sorted = [...shares].sort((a, b) => a - b);
      return {
        cheapest: sorted.slice(0, cap).reduce((sum, share) => sum + share, 0),
        dearest: sorted.slice(-cap).reduce((sum, share) => sum + share, 0),
      };
    });
    const cheapest = Math.min(...sums.map((entry) => entry.cheapest));
    const dearest = Math.max(...sums.map((entry) => entry.dearest));
    // A crew that cannot man the cap at all is not who the caps are for.
    if (cheapest > 1) continue;
    if (cheapest < TURF_MIN_DEFENSE_SHARE) {
      problems.push(`${summary.crew.name} can hold the cap on ${(cheapest * 100).toFixed(0)}% of its crew: turf costs it nothing to defend.`);
    }
    if (dearest > TURF_MAX_DEFENSE_SHARE) {
      problems.push(`${summary.crew.name} holding the dearest blocks posts ${(dearest * 100).toFixed(0)}% of its crew: the house is left bare.`);
    }
  }

  const fresh = summaries[0];
  if (fresh && fresh.blocks.every((row) => row.takeable)) {
    problems.push(`${fresh.crew.name} can take every block in the game: the locals are no ladder.`);
  }
  const late = summaries[summaries.length - 1];
  if (late && !late.blocks.every((row) => row.takeable)) {
    const shut = late.blocks.filter((row) => !row.takeable).map((row) => `${row.cityName} ${row.district}`);
    problems.push(`${late.crew.name} cannot take ${shut.join(', ')}.`);
  }

  const push = runTurfPushSimulation(ruleset);
  if (push) {
    if (push.noBackupWinRate < 0.30 || push.noBackupWinRate > 0.47) {
      problems.push(`Turf push without backup wins ${(push.noBackupWinRate * 100).toFixed(1)}%: expected 30-47%.`);
    }
    if (push.reinforcementWinRate < 0.14 || push.reinforcementWinRate > 0.32) {
      problems.push(`Turf push against a reinforcement call wins ${(push.reinforcementWinRate * 100).toFixed(1)}%: expected 14-32%.`);
    }
    if (push.noBackupWinRate - push.reinforcementWinRate < 0.08) {
      problems.push('Turf backup changes attacker win rate by less than 8 points: the call is not worth making.');
    }
    if (Math.abs(push.reinforcementShowRate - ruleset.turf.push.allies.chanceToShowUp) > 0.03) {
      problems.push(`Turf helper show rate ${(push.reinforcementShowRate * 100).toFixed(1)}% missed the configured ${(ruleset.turf.push.allies.chanceToShowUp * 100).toFixed(0)}% by more than 3 points.`);
    }
  }

  return problems;
}

function money(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString('en-US')}`;
}

export function turfMarkdown(ruleset: Ruleset, summaries: readonly TurfCrewSummary[]): string {
  if (!ruleset.turf || summaries.length === 0) return '## Turf\n\nThis ruleset has no turf.\n';
  const lines: string[] = ['## Turf', '', `Holding a block for a day, against a day of street work. A holder works its own block ${HOLDER_TURNS_PER_DAY} turns a day; ${BUSY_RIVALS} rivals work it ${RIVAL_TURNS_PER_DAY} turns each.`, ''];

  const push = runTurfPushSimulation(ruleset);
  if (push) {
    lines.push('### Turf wars', '');
    lines.push(`Equal ${push.squad}-thug pistol crews over ${push.samples.toLocaleString('en-US')} seeded pushes: **${(push.noBackupWinRate * 100).toFixed(1)}%** attacker wins without backup, **${(push.reinforcementWinRate * 100).toFixed(1)}%** with an alliance call (${push.helperThugs} potential helpers, ${(push.reinforcementShowRate * 100).toFixed(1)}% showed).`, '');
  }

  for (const summary of summaries) {
    lines.push(`### ${summary.crew.name}`, '');
    lines.push(`A street day at home: **${money(summary.streetCentsPerDay)}**.`, '');
    lines.push('| Block | Corner | Locals | Take it? | Hold bonus | Tax (busy) | Gain/day | Corner costs | Payback | Street share | Off the house |');
    lines.push('| --- | ---: | ---: | :--: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
    for (const row of summary.blocks) {
      const payback = row.paybackRatio === Number.POSITIVE_INFINITY ? 'free' : `${row.paybackRatio.toFixed(1)}x`;
      lines.push(`| ${row.cityName} ${row.district} | ${row.cornerThugs} | ${row.localsThugs} | ${row.takeable ? 'yes' : 'no'} | ${money(row.holdBonusCentsPerDay)} | ${money(row.busyTaxCentsPerDay)} | ${money(row.gainCentsPerDay)} | ${money(row.costCentsPerDay)} | ${payback} | ${row.streetShare.toFixed(2)}x | ${(row.defenseShare * 100).toFixed(0)}% |`);
    }
    lines.push('');
  }
  return lines.join('\n');
}
