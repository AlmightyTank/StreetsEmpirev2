import type { BusinessKey, DistrictKey, Ruleset } from '@streets/rulesets';
import { cityRules, rulesetForCity } from '../calculations/cities.js';
import { cornerMinimumFor, localsThugs, turfBlocks, type Block } from '../calculations/turf.js';
import {
  averageOutputShare,
  blockWarFatigue,
  businessIncomeCentsPerHour,
  businessLots,
  businessRules,
  businessRulesetProblems,
  businessStaff,
  businessTotalCostCents,
  businessLevelCostCents,
  businessUpkeep,
  dormantHoursToEmpty,
  fatigueRecoveryHours,
  lotsOpen,
  siegeHoursToWin,
  tierAfterTake,
  tierHoldHours,
  type BusinessTier,
} from '../calculations/business.js';
import { travelCrews, type TravelCrew } from './travel.js';
import { turfBlockTakePerTurnCents, turfStreetCentsPerDay, HOLDER_TURNS_PER_DAY } from './turf.js';

/**
 * 1.1.0-A. Is a business worth building? For every crew, every one of the forty blocks and
 * every lot on it: what the business earns a day, against what its staff would have earned
 * covering girls on that block, and against a day of the same crew's street work.
 *
 * Deliberately generous to businesses, the way the 0.6.0-A turf simulation was generous to
 * corners: nobody declares war on the holder, supply never runs short, the register is
 * collected every day and the block sits at full tier. 1.1.0-D cuts into this ceiling with
 * block wars; the war, fatigue, tier and decay numbers are checked here as pure timings.
 *
 * The staff model is the turf model: the holder works its own block, its corner crew is
 * posted first, and a staff thug costs the girls it can no longer cover there. A Strip Club
 * takes girls off the street outright.
 */

/** Building level 1 has to pay for itself within this many days of its net income. */
export const BUSINESS_BUILD_PAYBACK_DAYS = 4;
/** Taking a lot all the way to the top level has to pay back within this many days at max. */
export const BUSINESS_FULL_PAYBACK_DAYS = 14;
/** A fully built home cap's gross income never replaces a day of street work... */
export const BUSINESS_HOME_CAP_STREET_SHARE = 1;
/** ...and what it adds after its staff's lost street income is a supplement. */
export const BUSINESS_HOME_CAP_NET_SHARE = 0.5;
/** A fully built home cap has to cost a late crew real muscle, or businesses are free. */
export const BUSINESS_MIN_STAFF_SHARE = 0.05;
/** A raider who keeps a captured block this long (0.6.0-F's world assumption)... */
export const RAIDER_HOLD_HOURS = 36;
/** ...earns under this share of what a stable holder makes from it. */
export const BUSINESS_FLIP_MAX_SHARE = 0.5;
/** Round length the pace checks are judged against. */
export const BUSINESS_ROUND_DAYS = 28;

export interface BusinessLotSummary {
  readonly crew: string;
  readonly block: Block;
  readonly cityName: string;
  readonly district: DistrictKey;
  readonly lot: number;
  readonly business: BusinessKey;
  readonly businessName: string;
  readonly signature: boolean;
  /** Can this crew take the block off the locals, and staff this lot at level 1? */
  readonly canHold: boolean;
  readonly canStaff: boolean;
  readonly staffAtOne: number;
  readonly staffAtMax: number;
  readonly incomeAtOneCentsPerDay: number;
  readonly incomeAtMaxCentsPerDay: number;
  /** What the staff would have earned on the street, plus their beer and product. */
  readonly costAtOneCentsPerDay: number;
  readonly costAtMaxCentsPerDay: number;
  readonly buildCostCents: number;
  readonly totalCostCents: number;
  /** Days of level-1 net income to pay for the build. Infinite when it never pays. */
  readonly buildPaybackDays: number;
  /** Days of top-level net income to pay for every level. */
  readonly fullPaybackDays: number;
  /** Top-level income against a day of this crew's street work. */
  readonly streetShare: number;
}

export interface BusinessHomeCapSummary {
  readonly citySlug: string;
  readonly cityName: string;
  readonly districts: readonly DistrictKey[];
  readonly incomeCentsPerDay: number;
  readonly netCentsPerDay: number;
  readonly staff: number;
  readonly streetShare: number;
  /** Net of the staff's lost street income, against a street day. */
  readonly netStreetShare: number;
  /** Share of the crew's thugs working these businesses. */
  readonly staffShare: number;
}

export interface BusinessCrewSummary {
  readonly crew: TravelCrew;
  readonly streetCentsPerDay: number;
  readonly lots: readonly BusinessLotSummary[];
  /** The best home cap of fully built blocks this crew could hold in each city. */
  readonly homeCaps: readonly BusinessHomeCapSummary[];
}

interface StaffCost {
  readonly streetCentsPerDay: number;
  readonly upkeepCentsPerDay: number;
}

function upkeepCentsPerDay(ruleset: Ruleset, citySlug: string, staff: number): number {
  const living = rulesetForCity(ruleset, citySlug);
  const { beer, product } = businessUpkeep(ruleset, staff, 24);
  return beer * (living.stores.CORNER.items.BEER?.buyCents ?? 0) + product * (living.stores.PIP.items.CRACK?.buyCents ?? 0);
}

/**
 * What `staff` cost this crew a day on a block it holds and works, on top of the corner
 * crew and of `alreadyThugs` staff thugs on the block's other businesses.
 */
function staffCost(
  ruleset: Ruleset,
  crew: TravelCrew,
  block: Block,
  kind: 'THUGS' | 'WHORES',
  staff: number,
  alreadyThugs = 0,
): StaffCost {
  const take = turfBlockTakePerTurnCents(ruleset, crew, block.citySlug, block.district);
  const perWhore = crew.whores > 0 ? take / crew.whores : 0;
  const upkeep = upkeepCentsPerDay(ruleset, block.citySlug, staff);
  if (kind === 'WHORES') {
    return { streetCentsPerDay: Math.min(staff, crew.whores) * perWhore * HOLDER_TURNS_PER_DAY, upkeepCentsPerDay: upkeep };
  }
  const cover = ruleset.scouting.districts[block.district].protectionWhoresPerThug;
  const corner = cornerMinimumFor(ruleset, block.district, crew.thugs);
  const spare = Math.max(0, crew.thugs - Math.ceil(crew.whores / cover));
  const uncovered = (away: number) => Math.min(crew.whores, Math.max(0, away - spare) * cover);
  const before = uncovered(corner + alreadyThugs);
  const after = uncovered(corner + alreadyThugs + staff);
  return { streetCentsPerDay: (after - before) * perWhore * HOLDER_TURNS_PER_DAY, upkeepCentsPerDay: upkeep };
}

function totalCost(cost: StaffCost): number {
  return cost.streetCentsPerDay + cost.upkeepCentsPerDay;
}

function paybackDays(costCents: number, netCentsPerDay: number): number {
  return netCentsPerDay > 0 ? costCents / netCentsPerDay : Number.POSITIVE_INFINITY;
}

export function runBusinessSimulation(ruleset: Ruleset, crews: readonly TravelCrew[] = travelCrews): BusinessCrewSummary[] {
  const rules = businessRules(ruleset);
  if (!rules) return [];
  const max = rules.levels.maxLevel;
  const blocks = turfBlocks(ruleset);

  return crews.map((crew) => {
    const home = ruleset.round.startingCitySlug;
    const lots: BusinessLotSummary[] = [];
    for (const block of blocks) {
      const corner = cornerMinimumFor(ruleset, block.district, crew.thugs);
      const canHold = crew.thugs >= localsThugs(ruleset, block) && crew.thugs >= corner;
      const street = turfStreetCentsPerDay(ruleset, crew, block.citySlug);
      for (const lot of businessLots(ruleset, block)) {
        const type = rules.catalog[lot.business];
        const staffAtOne = businessStaff(ruleset, lot.business, 1);
        const staffAtMax = businessStaff(ruleset, lot.business, max);
        const canStaff = type.staff === 'WHORES' ? crew.whores >= staffAtOne : crew.thugs - corner >= staffAtOne;
        const incomeAtOne = businessIncomeCentsPerHour(ruleset, { citySlug: block.citySlug, district: block.district, business: lot.business, level: 1 }) * 24;
        const incomeAtMax = businessIncomeCentsPerHour(ruleset, { citySlug: block.citySlug, district: block.district, business: lot.business, level: max }) * 24;
        const costAtOne = totalCost(staffCost(ruleset, crew, block, type.staff, staffAtOne));
        const costAtMax = totalCost(staffCost(ruleset, crew, block, type.staff, staffAtMax));
        const buildCost = businessLevelCostCents(ruleset, lot.business, 1);
        const fullCost = businessTotalCostCents(ruleset, lot.business, max);
        lots.push({
          crew: crew.name,
          block,
          cityName: cityRules(ruleset, block.citySlug)?.name ?? block.citySlug,
          district: block.district,
          lot: lot.lot,
          business: lot.business,
          businessName: type.name,
          signature: lot.signature,
          canHold,
          canStaff,
          staffAtOne,
          staffAtMax,
          incomeAtOneCentsPerDay: incomeAtOne,
          incomeAtMaxCentsPerDay: incomeAtMax,
          costAtOneCentsPerDay: costAtOne,
          costAtMaxCentsPerDay: costAtMax,
          buildCostCents: buildCost,
          totalCostCents: fullCost,
          buildPaybackDays: paybackDays(buildCost, incomeAtOne - costAtOne),
          fullPaybackDays: paybackDays(fullCost, incomeAtMax - costAtMax),
          streetShare: street > 0 ? incomeAtMax / street : 0,
        });
      }
    }

    // A fully built block: every lot at the top level, its staff added one business at a
    // time so the block's thugs are priced together, not as if each were the first.
    const fullBlock = (block: Block) => {
      let thugs = 0;
      let staff = 0;
      let income = 0;
      let cost = 0;
      for (const lot of businessLots(ruleset, block)) {
        const type = rules.catalog[lot.business];
        const count = businessStaff(ruleset, lot.business, max);
        income += businessIncomeCentsPerHour(ruleset, { citySlug: block.citySlug, district: block.district, business: lot.business, level: max }) * 24;
        cost += totalCost(staffCost(ruleset, crew, block, type.staff, count, type.staff === 'THUGS' ? thugs : 0));
        if (type.staff === 'THUGS') thugs += count;
        staff += count;
      }
      return { block, income, net: income - cost, staff, thugs };
    };

    const cap = ruleset.turf?.caps.blocksPerCrewHome ?? 0;
    const homeCaps: BusinessHomeCapSummary[] = [];
    for (const citySlug of new Set(blocks.map((block) => block.citySlug))) {
      const street = turfStreetCentsPerDay(ruleset, crew, citySlug);
      const holdable = blocks
        .filter((block) => block.citySlug === citySlug && crew.thugs >= localsThugs(ruleset, block))
        .map(fullBlock)
        .sort((a, b) => b.income - a.income)
        .slice(0, cap);
      if (!holdable.length) continue;
      const income = holdable.reduce((sum, row) => sum + row.income, 0);
      const thugs = holdable.reduce((sum, row) => sum + row.thugs, 0);
      homeCaps.push({
        citySlug,
        cityName: cityRules(ruleset, citySlug)?.name ?? citySlug,
        districts: holdable.map((row) => row.block.district),
        incomeCentsPerDay: income,
        netCentsPerDay: holdable.reduce((sum, row) => sum + row.net, 0),
        staff: holdable.reduce((sum, row) => sum + row.staff, 0),
        streetShare: street > 0 ? income / street : 0,
        netStreetShare: street > 0 ? holdable.reduce((sum, row) => sum + row.net, 0) / street : 0,
        staffShare: crew.thugs > 0 ? thugs / crew.thugs : 1,
      });
    }

    return { crew, streetCentsPerDay: turfStreetCentsPerDay(ruleset, crew, home), lots, homeCaps };
  });
}

export interface BusinessWarTimings {
  readonly siegeHours: number;
  readonly fastestSiegeHours: number;
  readonly outcomes: ReadonlyArray<{ readonly label: string; readonly fatigue: number; readonly outputShare: number; readonly recoveryHours: number }>;
  /** A raider's captured block over `RAIDER_HOLD_HOURS`, against a stable holder's. */
  readonly raiderShareOfStable: number;
  /** A captured Stronghold over a week, against the same week held stably. */
  readonly weekAfterTakeShareOfStable: number;
  readonly strongholdDays: number;
  readonly retakeStrongholdHours: number;
  readonly dormantDaysToEmpty: number;
}

/**
 * The war, fatigue, tier and decay numbers as pure timings: what a block looks like after
 * each way a war can end, what flipping a block is worth, how fast a block grows, and how
 * fast an abandoned one empties. No combat here; 1.1.0-D adds the fights.
 */
export function runBusinessWarTimings(ruleset: Ruleset): BusinessWarTimings | null {
  const rules = businessRules(ruleset);
  if (!rules) return null;
  const siegeHours = siegeHoursToWin(ruleset, 0);
  const halfSiege = siegeHours / 2;
  const outcome = (label: string, fatigue: number) => ({
    label,
    fatigue,
    outputShare: 1 - fatigue / 100,
    recoveryHours: fatigueRecoveryHours(ruleset, fatigue),
  });
  const take = blockWarFatigue(ruleset, { fights: 1, siegeHours, outcome: 'TAKE' });
  const outcomes = [
    outcome('Full siege, then Take', take),
    outcome('Holder concedes halfway through the siege', blockWarFatigue(ruleset, { fights: 1, siegeHours: halfSiege, outcome: 'CONCEDE' })),
    outcome('Holder breaks the siege halfway and wins', blockWarFatigue(ruleset, { fights: 2, siegeHours: halfSiege, outcome: 'DEFENDED' })),
    outcome('Full siege, then Sack', blockWarFatigue(ruleset, { fights: 1, siegeHours, outcome: 'SACK' })),
    outcome('Fought over again a day after a Take', blockWarFatigue(ruleset, {
      startFatigue: Math.max(0, take - rules.fatigue.recoveryPerHour * 24),
      fights: 1,
      siegeHours,
      outcome: 'TAKE',
    })),
  ];

  // Lot shares: a Stronghold runs three lots, the captured block one fewer until it climbs
  // back. Counted as equal lots, which flatters the captor (lot 3 is rarely the best).
  const strongLots = lotsOpen(ruleset, 'STRONGHOLD');
  const after = tierAfterTake(ruleset, 'STRONGHOLD');
  const droppedLots = lotsOpen(ruleset, after.tier);
  const raiderShareOfStable = averageOutputShare(ruleset, take, RAIDER_HOLD_HOURS) * droppedLots / strongLots;

  const week = 168;
  const climbBack = tierHoldHours(ruleset, 'STRONGHOLD') - after.heldHours;
  const firstPart = Math.min(week, climbBack);
  const output = (from: number, hours: number) => {
    // Average output over [from, from + hours) after the Take, fatigue recovering from the start.
    if (hours <= 0) return 0;
    const total = averageOutputShare(ruleset, take, from + hours) * (from + hours);
    const before = from > 0 ? averageOutputShare(ruleset, take, from) * from : 0;
    return total - before;
  };
  const captured = output(0, firstPart) * droppedLots + output(firstPart, week - firstPart) * strongLots;
  const weekAfterTakeShareOfStable = captured / (week * strongLots);

  return {
    siegeHours,
    fastestSiegeHours: siegeHoursToWin(ruleset, 1),
    outcomes,
    raiderShareOfStable,
    weekAfterTakeShareOfStable,
    strongholdDays: tierHoldHours(ruleset, 'STRONGHOLD') / 24,
    retakeStrongholdHours: climbBack,
    dormantDaysToEmpty: dormantHoursToEmpty(ruleset, rules.levels.maxLevel) / 24,
  };
}

/**
 * The 1.1.0-A gate:
 * - the ruleset's business numbers hold together and keep the roadmap's decisions;
 * - every lot in the game is worth building for some crew that can hold its block, or it is
 *   dead data;
 * - a fully built home cap never grosses a street day, nets at most half of one after its
 *   staff's lost street income, and costs a late crew real muscle;
 * - wars, fatigue, tiers and decay land where the roadmap says: a full Take recovers in two
 *   to three days, flipping a block pays well under holding it, a Stronghold is a
 *   mid-season goal, and an abandoned block empties inside half a round.
 */
export function businessGate(ruleset: Ruleset, summaries: readonly BusinessCrewSummary[]): string[] {
  const problems = [...businessRulesetProblems(ruleset)];
  const rules = businessRules(ruleset);
  if (!rules || summaries.length === 0) return problems;

  const keys = new Set(summaries.flatMap((summary) => summary.lots.map((row) => `${row.block.citySlug}:${row.district}:${row.lot}`)));
  for (const key of keys) {
    const rows = summaries.flatMap((summary) => summary.lots.filter((row) => `${row.block.citySlug}:${row.district}:${row.lot}` === key));
    const first = rows[0]!;
    const worth = rows.some((row) => row.canHold && row.canStaff
      && row.buildPaybackDays <= BUSINESS_BUILD_PAYBACK_DAYS
      && row.fullPaybackDays <= BUSINESS_FULL_PAYBACK_DAYS);
    if (!worth) {
      const best = Math.min(...rows.filter((row) => row.canHold && row.canStaff).map((row) => row.buildPaybackDays));
      problems.push(`${first.cityName} ${first.district} lot ${first.lot} (${first.businessName}): no crew that can hold and staff it gets its money back in time (best build payback ${Number.isFinite(best) ? best.toFixed(1) : 'never'} days).`);
    }
  }

  for (const summary of summaries) {
    for (const row of summary.lots) {
      if (row.canHold && row.streetShare >= 1) {
        problems.push(`${summary.crew.name}: ${row.cityName} ${row.businessName} at the top level pays ${row.streetShare.toFixed(2)}x a street day on its own.`);
      }
    }
    for (const cap of summary.homeCaps) {
      if (cap.streetShare >= BUSINESS_HOME_CAP_STREET_SHARE) {
        problems.push(`${summary.crew.name} in ${cap.cityName}: a fully built home cap grosses ${cap.streetShare.toFixed(2)}x a street day, replacing the street.`);
      }
      if (cap.netStreetShare > BUSINESS_HOME_CAP_NET_SHARE) {
        problems.push(`${summary.crew.name} in ${cap.cityName}: a fully built home cap nets ${cap.netStreetShare.toFixed(2)}x a street day after staff (limit ${BUSINESS_HOME_CAP_NET_SHARE}x).`);
      }
    }
  }
  const late = summaries[summaries.length - 1];
  if (late) {
    for (const cap of late.homeCaps) {
      if (cap.staffShare < BUSINESS_MIN_STAFF_SHARE) {
        problems.push(`${late.crew.name} in ${cap.cityName}: a fully built home cap takes only ${(cap.staffShare * 100).toFixed(1)}% of its thugs.`);
      }
    }
  }

  const timings = runBusinessWarTimings(ruleset);
  if (timings) {
    const take = timings.outcomes[0]!;
    if (take.recoveryHours < 36 || take.recoveryHours > 72) {
      problems.push(`A block recovers from a full Take in ${take.recoveryHours.toFixed(0)} hours: expected 36-72 (two to three days).`);
    }
    const [, concede, defended] = timings.outcomes;
    if (concede && concede.outputShare <= take.outputShare) problems.push('Conceding early must leave the block in better shape than a finished Take.');
    if (defended && defended.outputShare <= take.outputShare) problems.push('A defended block must come out in better shape than a taken one.');
    if (timings.raiderShareOfStable >= BUSINESS_FLIP_MAX_SHARE) {
      problems.push(`A raider holding a captured Stronghold for ${RAIDER_HOLD_HOURS} hours earns ${(timings.raiderShareOfStable * 100).toFixed(0)}% of a stable holder: flipping pays.`);
    }
    if (timings.weekAfterTakeShareOfStable >= 1) problems.push('A captured block earns as much over a week as one held stably.');
    if (timings.strongholdDays < 2 || timings.strongholdDays > BUSINESS_ROUND_DAYS / 4) {
      problems.push(`A Stronghold takes ${timings.strongholdDays.toFixed(1)} days: expected a mid-season goal, 2-${BUSINESS_ROUND_DAYS / 4} days of holding.`);
    }
    if (timings.dormantDaysToEmpty > BUSINESS_ROUND_DAYS / 2) {
      problems.push(`An abandoned top-level business takes ${timings.dormantDaysToEmpty.toFixed(1)} days to empty: more than half a round.`);
    }
  }

  return problems;
}

function money(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString('en-US')}`;
}

function days(value: number): string {
  return Number.isFinite(value) ? value.toFixed(1) : 'never';
}

function tierWord(tier: BusinessTier): string {
  return tier.charAt(0) + tier.slice(1).toLowerCase();
}

export function businessMarkdown(ruleset: Ruleset, summaries: readonly BusinessCrewSummary[]): string {
  const rules = businessRules(ruleset);
  if (!rules || summaries.length === 0) return '## Businesses\n\nThis ruleset has no businesses.\n';
  const home = ruleset.round.startingCitySlug;
  const homeName = cityRules(ruleset, home)?.name ?? home;
  const max = rules.levels.maxLevel;
  const lines: string[] = [
    '## Businesses',
    '',
    `Every lot at level 1 and level ${max}, against what its staff would have earned covering girls on the block, for a holder that works its own block ${HOLDER_TURNS_PER_DAY} turns a day. No wars, no shortages, the register collected daily.`,
    '',
  ];

  for (const summary of summaries) {
    lines.push(`### ${summary.crew.name}`, '');
    lines.push(`A street day at home: **${money(summary.streetCentsPerDay)}**. Lots in ${homeName}:`, '');
    lines.push(`| Block | Lot | Business | Hold? | Staff (1/${max}) | Income/day L1 | Staff cost L1 | Build | Payback | Income/day L${max} | Staff cost L${max} | All levels | Payback | Street share |`);
    lines.push('| --- | :-: | --- | :-: | :-: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
    for (const row of summary.lots.filter((entry) => entry.block.citySlug === home)) {
      lines.push(`| ${row.district} | ${row.lot} | ${row.businessName}${row.signature ? ' ★' : ''} | ${row.canHold ? 'yes' : 'no'} | ${row.staffAtOne}/${row.staffAtMax} | ${money(row.incomeAtOneCentsPerDay)} | ${money(row.costAtOneCentsPerDay)} | ${money(row.buildCostCents)} | ${days(row.buildPaybackDays)}d | ${money(row.incomeAtMaxCentsPerDay)} | ${money(row.costAtMaxCentsPerDay)} | ${money(row.totalCostCents)} | ${days(row.fullPaybackDays)}d | ${row.streetShare.toFixed(2)}x |`);
    }
    lines.push('');
    if (summary.homeCaps.length) {
      lines.push(`A fully built home cap (${ruleset.turf?.caps.blocksPerCrewHome ?? 0} blocks, every lot at level ${max}), by city:`, '');
      lines.push('| City | Blocks | Income/day | Net of staff | Staff | Gross / street | Net / street | Thugs used |');
      lines.push('| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |');
      for (const cap of summary.homeCaps) {
        lines.push(`| ${cap.cityName} | ${cap.districts.join(', ')} | ${money(cap.incomeCentsPerDay)} | ${money(cap.netCentsPerDay)} | ${cap.staff} | ${cap.streetShare.toFixed(2)}x | ${cap.netStreetShare.toFixed(2)}x | ${(cap.staffShare * 100).toFixed(0)}% |`);
      }
      lines.push('');
    } else {
      lines.push('This crew cannot take a block off the locals anywhere yet.', '');
    }
  }

  const mid = summaries[Math.min(1, summaries.length - 1)]!;
  lines.push('### City signatures', '');
  lines.push(`Each city's signature business at level ${max}, for the ${mid.crew.name.toLowerCase()} crew.`, '');
  lines.push(`| City | Signature | Block | Income/day L${max} | Payback (all levels) |`);
  lines.push('| --- | --- | --- | ---: | ---: |');
  for (const row of mid.lots.filter((entry) => entry.signature)) {
    lines.push(`| ${row.cityName} | ${row.businessName} | ${row.district} lot ${row.lot} | ${money(row.incomeAtMaxCentsPerDay)} | ${days(row.fullPaybackDays)}d |`);
  }
  lines.push('');

  const timings = runBusinessWarTimings(ruleset);
  if (timings) {
    lines.push('### Block wars and war fatigue', '');
    lines.push(`A siege takes **${timings.siegeHours.toFixed(1)} hours** alone and **${timings.fastestSiegeHours.toFixed(1)} hours** with an ally at the full cap. Output is 100% minus fatigue.`, '');
    lines.push('| Outcome | Fatigue | Output right after | Back to 100% in |');
    lines.push('| --- | ---: | ---: | ---: |');
    for (const outcome of timings.outcomes) {
      lines.push(`| ${outcome.label} | ${outcome.fatigue.toFixed(0)} | ${(outcome.outputShare * 100).toFixed(0)}% | ${outcome.recoveryHours.toFixed(0)} hours |`);
    }
    lines.push('');
    const after = tierAfterTake(ruleset, 'STRONGHOLD');
    lines.push(`- **Flipping:** a raider who keeps a captured Stronghold for ${RAIDER_HOLD_HOURS} hours earns **${(timings.raiderShareOfStable * 100).toFixed(0)}%** of what a stable holder makes from it (fatigue, plus the block dropping to ${tierWord(after.tier)}).`);
    lines.push(`- **A week after a Take**, the captor earns **${(timings.weekAfterTakeShareOfStable * 100).toFixed(0)}%** of a stable week, and the block is a Stronghold again after ${timings.retakeStrongholdHours.toFixed(0)} hours.`);
    lines.push(`- **Pace:** a Stronghold takes **${timings.strongholdDays.toFixed(1)} days** of holding; an abandoned level-${max} business is gone after **${timings.dormantDaysToEmpty.toFixed(1)} days** under the locals.`);
    lines.push('');
  }
  return lines.join('\n');
}
