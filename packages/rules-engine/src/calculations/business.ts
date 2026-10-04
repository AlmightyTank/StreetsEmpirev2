import type { BusinessKey, BusinessRules, BusinessTypeRules, DistrictKey, Ruleset } from '@streets/rulesets';
import { DISTRICT_KEYS, turfBlocks, type Block } from './turf.js';
import { roundStochastic, type Rng } from '../rng.js';

/**
 * 1.1.0-A. Businesses, Fronts & Rackets: what a block's lots hold, what a business costs,
 * staffs and earns, how a block's tier opens its lots, how war fatigue eats output, and how
 * the locals let an abandoned block decay. Everything here is pure and reads the ruleset;
 * a round without `business` gets the 1.0 answers, which are that blocks hold no businesses.
 */

export const BUSINESS_KEYS: readonly BusinessKey[] = [
  'CASINO_FRONT',
  'NIGHTCLUB',
  'STRIP_CLUB',
  'CHOP_SHOP',
  'AUTO_GARAGE',
  'PAWN_SHOP',
  'WAREHOUSE',
  'BAR',
  'LAUNDROMAT',
  'CONVENIENCE_STORE',
];

export type BusinessTier = 'FOOTHOLD' | 'ESTABLISHED' | 'STRONGHOLD';
export const BUSINESS_TIERS: readonly BusinessTier[] = ['FOOTHOLD', 'ESTABLISHED', 'STRONGHOLD'];

/** How a block war ended, as far as the block's fatigue is concerned. */
export type BlockWarOutcome = 'TAKE' | 'CONCEDE' | 'SACK' | 'DEFENDED';

export interface BusinessLot {
  /** 1-based. Lot 1 opens first. */
  readonly lot: number;
  readonly business: BusinessKey;
  /** This city's signature business sits on this lot. */
  readonly signature: boolean;
}

export function businessRules(ruleset: Ruleset): BusinessRules | undefined {
  return ruleset.turf ? ruleset.business : undefined;
}

export function businessType(ruleset: Ruleset, business: BusinessKey): BusinessTypeRules | undefined {
  return businessRules(ruleset)?.catalog[business];
}

/** The three lots on a block, fixed by its district. Empty before 1.1.0-A. */
export function businessLots(ruleset: Ruleset, block: Block): BusinessLot[] {
  const rules = businessRules(ruleset);
  if (!rules) return [];
  const signature = rules.signatures[block.citySlug]?.business;
  return rules.lots[block.district].map((business, index) => ({
    lot: index + 1,
    business,
    signature: business === signature,
  }));
}

/** Every lot in the round, block by block. */
export function businessLotsInRound(ruleset: Ruleset): Array<BusinessLot & { readonly block: Block }> {
  if (!businessRules(ruleset)) return [];
  return turfBlocks(ruleset).flatMap((block) => businessLots(ruleset, block).map((lot) => ({ ...lot, block })));
}

export function signatureMultiplier(ruleset: Ruleset, citySlug: string, business: BusinessKey): number {
  const signature = businessRules(ruleset)?.signatures[citySlug];
  return signature?.business === business ? signature.multiplier : 1;
}

function levelIndex(rules: BusinessRules, level: number): number | null {
  if (!Number.isInteger(level) || level < 1 || level > rules.levels.maxLevel) return null;
  return level - 1;
}

/** Staff a business needs at a level. Zero for an empty lot. */
export function businessStaff(ruleset: Ruleset, business: BusinessKey, level: number): number {
  const rules = businessRules(ruleset);
  const index = rules ? levelIndex(rules, level) : null;
  if (!rules || index === null) return 0;
  return Math.ceil(rules.catalog[business].baseStaff * rules.levels.staffMultiplier[index]!);
}

/** Output left after war fatigue, 0..1. */
export function fatigueOutputShare(ruleset: Ruleset, fatigue: number): number {
  const rules = businessRules(ruleset);
  if (!rules) return 1;
  return 1 - Math.min(rules.fatigue.max, Math.max(0, fatigue)) / 100;
}

export interface BusinessIncomeInput {
  readonly citySlug: string;
  readonly district: DistrictKey;
  readonly business: BusinessKey;
  readonly level: number;
  readonly fatigue?: number;
  /** An outpost business tops out at `awayOutputShare` of the same business at home. */
  readonly away?: boolean;
}

/** Front income an hour. Zero for an empty lot or a round without businesses. */
export function businessIncomeCentsPerHour(ruleset: Ruleset, input: BusinessIncomeInput): number {
  const rules = businessRules(ruleset);
  const index = rules ? levelIndex(rules, input.level) : null;
  if (!rules || index === null) return 0;
  return rules.catalog[input.business].incomeCentsPerHour
    * rules.levels.incomeMultiplier[index]!
    * rules.districtIncome[input.district]
    * signatureMultiplier(ruleset, input.citySlug, input.business)
    * fatigueOutputShare(ruleset, input.fatigue ?? 0)
    * (input.away ? rules.awayOutputShare : 1);
}

/** Most a business's register holds before income is lost. */
export function registerCapCents(ruleset: Ruleset, incomeCentsPerHour: number): number {
  const rules = businessRules(ruleset);
  return rules ? Math.round(incomeCentsPerHour * rules.register.capHours) : 0;
}

/**
 * Cash to take a business to `level` from the level below: the build at level 1. Above
 * `fatigue.upgradeMarkupAbove` the block is still shaken and every build costs more, so
 * capturing a block is not a shortcut to cheap levels.
 */
export function businessLevelCostCents(ruleset: Ruleset, business: BusinessKey, level: number, fatigue = 0): number {
  const rules = businessRules(ruleset);
  const index = rules ? levelIndex(rules, level) : null;
  if (!rules || index === null) return 0;
  const markup = fatigue > rules.fatigue.upgradeMarkupAbove ? 1 + rules.levels.fatiguedUpgradeMarkup : 1;
  return Math.round(rules.catalog[business].buildCostCents * rules.levels.costMultiplier[index]! * markup);
}

/** Everything spent to take an empty lot to `level`, with no fatigue markup. */
export function businessTotalCostCents(ruleset: Ruleset, business: BusinessKey, level: number): number {
  let total = 0;
  for (let at = 1; at <= level; at++) total += businessLevelCostCents(ruleset, business, at);
  return total;
}

/** Beer and product a business's staff burn for `hours`, the BUSINESS supply job. */
export function businessUpkeep(ruleset: Ruleset, staff: number, hours: number): { beer: number; product: number } {
  const supply = businessRules(ruleset)?.supply;
  if (!supply || staff <= 0 || hours <= 0) return { beer: 0, product: 0 };
  return {
    beer: Math.ceil(staff * supply.beerPerStaffPerHour * hours),
    product: Math.ceil(staff * supply.productPerStaffPerHour * hours),
  };
}

// ---------------------------------------------------------------------------
// Tiers

export interface BlockTierInput {
  /** Hours held without interruption; siege pauses the clock, a Take restarts it. */
  readonly heldHours: number;
  /** Business levels by lot, lot 1 first. Missing lots count as empty. */
  readonly levels: readonly number[];
}

/** The tier a block has earned: uninterrupted holding plus levels invested. */
export function blockTier(ruleset: Ruleset, input: BlockTierInput): BusinessTier {
  const tiers = businessRules(ruleset)?.tiers;
  if (!tiers) return 'FOOTHOLD';
  const lotOne = input.levels[0] ?? 0;
  const lotTwo = input.levels[1] ?? 0;
  const established = input.heldHours >= tiers.establishedHours && lotOne >= tiers.establishedLotOneLevel;
  if (!established) return 'FOOTHOLD';
  const stronghold = input.heldHours >= tiers.strongholdHours && lotOne + lotTwo >= tiers.strongholdLevels;
  return stronghold ? 'STRONGHOLD' : 'ESTABLISHED';
}

export function lotsOpen(ruleset: Ruleset, tier: BusinessTier): number {
  const tiers = businessRules(ruleset)?.tiers;
  if (!tiers) return 0;
  return tiers.lotsOpen[BUSINESS_TIERS.indexOf(tier)]!;
}

/** The first tier that opens a lot. */
export function tierOpening(ruleset: Ruleset, lot: number): BusinessTier | null {
  return BUSINESS_TIERS.find((tier) => lotsOpen(ruleset, tier) >= lot) ?? null;
}

export function tierDropped(tier: BusinessTier, steps: number): BusinessTier {
  return BUSINESS_TIERS[Math.max(0, BUSINESS_TIERS.indexOf(tier) - Math.max(0, steps))]!;
}

/** Hold time a tier needs. A Foothold needs none. */
export function tierHoldHours(ruleset: Ruleset, tier: BusinessTier): number {
  const tiers = businessRules(ruleset)?.tiers;
  if (!tiers || tier === 'FOOTHOLD') return 0;
  return tier === 'ESTABLISHED' ? tiers.establishedHours : tiers.strongholdHours;
}

/**
 * A Take drops the block one tier, and the new holder's clock starts at that tier's
 * threshold: a captured Stronghold is Established and needs the difference again.
 */
export function tierAfterTake(ruleset: Ruleset, tier: BusinessTier): { tier: BusinessTier; heldHours: number } {
  const tiers = businessRules(ruleset)?.tiers;
  if (!tiers) return { tier, heldHours: 0 };
  const dropped = tierDropped(tier, tiers.takeTierDrop);
  return { tier: dropped, heldHours: tierHoldHours(ruleset, dropped) };
}

// ---------------------------------------------------------------------------
// War fatigue

export function addFatigue(ruleset: Ruleset, fatigue: number, amount: number): number {
  const rules = businessRules(ruleset);
  if (!rules) return 0;
  return Math.min(rules.fatigue.max, Math.max(0, fatigue + amount));
}

/** Fatigue left after `hours` of peace. A block that keeps changing hands heals slower. */
export function fatigueAfter(ruleset: Ruleset, fatigue: number, hours: number, scarred = false): number {
  const rules = businessRules(ruleset);
  if (!rules || hours <= 0) return Math.max(0, fatigue);
  const rate = scarred ? rules.fatigue.scarredRecoveryPerHour : rules.fatigue.recoveryPerHour;
  return Math.max(0, fatigue - rate * hours);
}

/** Hours of peace until fatigue is gone. */
export function fatigueRecoveryHours(ruleset: Ruleset, fatigue: number, scarred = false): number {
  const rules = businessRules(ruleset);
  if (!rules || fatigue <= 0) return 0;
  return fatigue / (scarred ? rules.fatigue.scarredRecoveryPerHour : rules.fatigue.recoveryPerHour);
}

export function isScarred(ruleset: Ruleset, handsChangedInWindow: number): boolean {
  const rules = businessRules(ruleset);
  return Boolean(rules && handsChangedInWindow >= rules.fatigue.scarredHandsChanged);
}

export interface BlockWarFatigueInput {
  /** Fatigue on the block when the war was declared. */
  readonly startFatigue?: number;
  /** Every fight on the block during the war: the opening fight, break attempts, re-sieges. */
  readonly fights: number;
  readonly siegeHours: number;
  readonly outcome: BlockWarOutcome;
}

/** The block's fatigue the moment a war ends. */
export function blockWarFatigue(ruleset: Ruleset, input: BlockWarFatigueInput): number {
  const rules = businessRules(ruleset);
  if (!rules) return 0;
  const fatigue = rules.fatigue;
  const ending = input.outcome === 'TAKE' ? fatigue.onTake
    : input.outcome === 'CONCEDE' ? fatigue.onConcede
      : input.outcome === 'SACK' ? fatigue.onSack
        : 0;
  return addFatigue(
    ruleset,
    input.startFatigue ?? 0,
    Math.max(0, input.fights) * fatigue.perFight + Math.max(0, input.siegeHours) * fatigue.perSiegeHour + ending,
  );
}

/** Average output share over `hours` of peace, starting at `fatigue`. */
export function averageOutputShare(ruleset: Ruleset, fatigue: number, hours: number, scarred = false): number {
  if (hours <= 0) return fatigueOutputShare(ruleset, fatigue);
  const recovery = fatigueRecoveryHours(ruleset, fatigue, scarred);
  // Output climbs linearly while fatigue recovers, then holds at 100%.
  const climbing = Math.min(hours, recovery);
  const startShare = fatigueOutputShare(ruleset, fatigue);
  const endShare = fatigueOutputShare(ruleset, fatigueAfter(ruleset, fatigue, climbing, scarred));
  const climbArea = climbing * (startShare + endShare) / 2;
  return (climbArea + (hours - climbing)) / hours;
}

// ---------------------------------------------------------------------------
// Block wars and allies

/** Control a siege gains an hour. An ally at the full cap speeds it by `allySiegeSpeedup`. */
export function siegeControlPerHour(ruleset: Ruleset, alliedShare = 0): number {
  const wars = businessRules(ruleset)?.wars;
  if (!wars) return 0;
  const share = Math.min(1, Math.max(0, alliedShare));
  return (100 / wars.siegeHours) * (1 + wars.allySiegeSpeedup * share);
}

/** Hours for a siege to take Control from `fromControl` to 100. */
export function siegeHoursToWin(ruleset: Ruleset, alliedShare = 0, fromControl = 0): number {
  const rate = siegeControlPerHour(ruleset, alliedShare);
  return rate > 0 ? Math.max(0, 100 - fromControl) / rate : Number.POSITIVE_INFINITY;
}

/** Most thugs one ally can send, on either side: matched to what the declarer committed. */
export function allyThugCap(ruleset: Ruleset, declarerThugs: number): number {
  const allies = businessRules(ruleset)?.allies;
  if (!allies) return 0;
  return Math.max(0, Math.floor(declarerThugs * allies.maxShareOfDeclarer));
}

/** The cut a caller can promise: snapped down to the step, never above the cap. */
export function allyCutShare(ruleset: Ruleset, requested: number): number {
  const allies = businessRules(ruleset)?.allies;
  if (!allies || !Number.isFinite(requested) || requested <= 0) return 0;
  const capped = Math.min(allies.maxCutShare, requested);
  // Snap with a small epsilon so 0.3 stays 0.3 in floating point.
  return Math.floor(capped / allies.cutStep + 1e-9) * allies.cutStep;
}

/**
 * What the ally is paid from a side's winnings. Nothing when the side lost (there are no
 * winnings) or when the ally took the slot but never fought.
 */
export function allyCutCents(ruleset: Ruleset, winningsCents: number, requestedShare: number, allyFought: boolean): number {
  if (!allyFought || winningsCents <= 0) return 0;
  return Math.floor(winningsCents * allyCutShare(ruleset, requestedShare));
}

// ---------------------------------------------------------------------------
// The locals, torching and sacking

/** A dormant business's level after the locals have held its block for `hours`. */
export function dormantLevel(ruleset: Ruleset, level: number, hours: number): number {
  const locals = businessRules(ruleset)?.locals;
  if (!locals || level <= 0) return Math.max(0, level);
  const decaying = Math.max(0, hours - locals.graceHours);
  return Math.max(0, level - Math.floor(decaying / locals.levelLossEveryHours));
}

/** Hours after the locals take over until a business at `level` is gone. */
export function dormantHoursToEmpty(ruleset: Ruleset, level: number): number {
  const locals = businessRules(ruleset)?.locals;
  if (!locals || level <= 0) return 0;
  return locals.graceHours + level * locals.levelLossEveryHours;
}

/** A dormant block's tier: one down at once, a Foothold after `footholdAfterHours`. */
export function dormantTier(ruleset: Ruleset, tier: BusinessTier, hours: number): BusinessTier {
  const locals = businessRules(ruleset)?.locals;
  if (!locals) return tier;
  if (hours >= locals.footholdAfterHours) return 'FOOTHOLD';
  return tierDropped(tier, locals.takeoverTierDrop);
}

/**
 * Extra local thugs on a built-up block: the locals run its businesses now. Capped at a
 * share of the district's base, before the city multiplier.
 */
export function localsBusinessBonus(ruleset: Ruleset, district: DistrictKey, totalLevels: number): number {
  const rules = businessRules(ruleset);
  const base = ruleset.turf?.districts[district]?.localsThugs ?? 0;
  if (!rules || totalLevels <= 0) return 0;
  return Math.min(totalLevels * rules.locals.localsPerLevel, Math.floor(base * rules.locals.maxLocalsBonusShare));
}

/** What the locals hold a built-up block with at full strength. */
export function localsThugsWithBusinesses(ruleset: Ruleset, block: Block, totalLevels: number): number {
  const rules = ruleset.turf;
  if (!rules) return 0;
  const multiplier = rules.locals.byCity[block.citySlug] ?? 1;
  return Math.round((rules.districts[block.district].localsThugs + localsBusinessBonus(ruleset, block.district, totalLevels)) * multiplier);
}

/**
 * Staff who walk off a business over `hours`. They are still the crew's, so an unhappy
 * crew loses them the way it loses anyone: the ruleset's departure chance, with each hour
 * counted as `staffDepartureTurnsPerHour` turns and capped like one action per hour.
 */
export function businessStaffDepartures(ruleset: Ruleset, staff: number, happiness: number, hours: number, rng: Rng): number {
  const rules = businessRules(ruleset);
  if (!rules) return 0;
  return crewAwayDepartures(ruleset, staff, happiness, hours, rules.staffDepartureTurnsPerHour, rng);
}

/**
 * 1.1.0-B. Crew working away from the block (business staff, corner crews) are still the
 * crew: when it is unhappy they walk off like anyone else. Each settled hour counts as
 * `turnsPerHour` turns of the ruleset's departure chance, capped like one action.
 */
export function crewAwayDepartures(ruleset: Ruleset, count: number, happiness: number, hours: number, turnsPerHour: number, rng: Rng): number {
  const d = ruleset.departures;
  if (count <= 0 || hours <= 0 || turnsPerHour <= 0 || happiness >= d.happinessThreshold) return 0;
  const severity = (d.happinessThreshold - happiness) / d.happinessThreshold;
  const perTurn = Math.min(1, d.chancePerTurn * severity);
  const fraction = Math.min(1 - (1 - perTurn) ** turnsPerHour, d.maxFractionPerAction);
  let left = count;
  // A week is the most one settle ever has to look back over.
  for (let hour = 0; hour < Math.min(hours, 168) && left > 0; hour++) {
    left -= Math.min(left, roundStochastic(left * fraction, rng));
  }
  return count - left;
}

/** Share of full output a business makes with `staff` of the `required` it can take. */
export function staffingShare(staff: number, required: number): number {
  if (required <= 0 || staff <= 0) return 0;
  return Math.min(1, staff / required);
}

/** Torching a business: the level it falls to, and the salvage paid back now. */
export function torchResult(ruleset: Ruleset, business: BusinessKey, level: number): { level: number; salvageCents: number } {
  const torch = businessRules(ruleset)?.torch;
  if (!torch || level <= 0) return { level: Math.max(0, level), salvageCents: 0 };
  const after = Math.max(0, level - torch.levelsLost);
  let lostCost = 0;
  for (let at = after + 1; at <= level; at++) lostCost += businessLevelCostCents(ruleset, business, at);
  return { level: after, salvageCents: Math.floor(lostCost * torch.salvageShare) };
}

/** Torching closes for the round's final hours, so it cannot be an end-of-season cash-out. */
export function torchOpen(ruleset: Ruleset, hoursToRoundEnd: number): boolean {
  const torch = businessRules(ruleset)?.torch;
  return Boolean(torch && hoursToRoundEnd > torch.closedFinalHours);
}

export function sackedLevel(ruleset: Ruleset, level: number): number {
  const rules = businessRules(ruleset);
  return rules ? Math.max(0, level - rules.sackLevelsLost) : Math.max(0, level);
}

// ---------------------------------------------------------------------------

function strictlyRising(values: readonly number[]): boolean {
  return values.every((value, index) => index === 0 || value > values[index - 1]!);
}

function neverFalling(values: readonly number[]): boolean {
  return values.every((value, index) => index === 0 || value >= values[index - 1]!);
}

/**
 * What a ruleset's business block gets wrong, in the same spirit as `turfRulesetProblems`:
 * the numbers have to hold together, and the decisions in docs/ROADMAP-1.1.0.md have to
 * hold, before anything is built on them.
 */
export function businessRulesetProblems(ruleset: Ruleset): string[] {
  const rules = ruleset.business;
  if (!rules) return [];
  if (!ruleset.turf) return ['Businesses sit on turf blocks, and this ruleset has no turf.'];
  const problems: string[] = [];

  // The catalog and the lots.
  const placed = new Set<BusinessKey>();
  for (const district of DISTRICT_KEYS) {
    const lots = rules.lots[district];
    if (!lots || lots.length !== 3) { problems.push(`${district} must have exactly three lots.`); continue; }
    if (new Set(lots).size !== lots.length) problems.push(`${district} has the same business on two lots.`);
    for (const business of lots) {
      if (!rules.catalog[business]) problems.push(`${district} has a lot for ${business}, which is not in the catalog.`);
      placed.add(business);
    }
  }
  for (const business of BUSINESS_KEYS) {
    const type = rules.catalog[business];
    if (!type) { problems.push(`${business} is missing from the catalog.`); continue; }
    if (!placed.has(business)) problems.push(`${type.name} has no lot on any block.`);
    if (type.incomeCentsPerHour <= 0) problems.push(`${type.name} earns nothing.`);
    if (type.buildCostCents <= 0) problems.push(`${type.name} costs nothing to build.`);
    if (type.baseStaff < 1) problems.push(`${type.name} needs somebody working it.`);
    // Decided: girls staff the Strip Club only; thugs staff everything else.
    const girls = business === 'STRIP_CLUB';
    if (girls !== (type.staff === 'WHORES')) {
      problems.push(`${type.name} must be staffed by ${girls ? 'girls' : 'thugs'}.`);
    }
  }

  // Foot traffic follows the street: a richer district never earns less.
  for (const district of DISTRICT_KEYS) {
    const traffic = rules.districtIncome[district];
    if (traffic === undefined || traffic < 0.5 || traffic > 2) { problems.push(`${district} foot traffic ${traffic} is outside 0.5-2.`); continue; }
    for (const other of DISTRICT_KEYS) {
      const otherTraffic = rules.districtIncome[other];
      if (otherTraffic === undefined) continue;
      if (ruleset.districts[district].payMultiplier > ruleset.districts[other].payMultiplier && traffic < otherTraffic) {
        problems.push(`${district} pays more on the street than ${other} but has less foot traffic.`);
      }
    }
  }

  // City signatures: one per city, a modest edge.
  for (const slug of Object.keys(ruleset.cities ?? {})) {
    if (!rules.signatures[slug]) problems.push(`${slug} has no signature business.`);
  }
  for (const [slug, signature] of Object.entries(rules.signatures)) {
    if (ruleset.cities && !ruleset.cities[slug]) problems.push(`${slug} has a signature business but is not a city.`);
    if (!rules.catalog[signature.business]) problems.push(`${slug}'s signature ${signature.business} is not in the catalog.`);
    if (signature.multiplier < 1 || signature.multiplier > 1.5) problems.push(`${slug}'s signature multiplier ${signature.multiplier} is outside 1-1.5.`);
  }

  // Levels.
  const levels = rules.levels;
  if (levels.maxLevel < 1) problems.push('A business needs at least one level.');
  for (const [name, values] of [['income', levels.incomeMultiplier], ['staff', levels.staffMultiplier], ['cost', levels.costMultiplier]] as const) {
    if (values.length !== levels.maxLevel) problems.push(`The ${name} curve has ${values.length} levels, not ${levels.maxLevel}.`);
    if (values[0] !== 1) problems.push(`The ${name} curve must start at 1 for level 1.`);
  }
  if (!strictlyRising(levels.incomeMultiplier)) problems.push('Every upgrade must raise income.');
  if (!neverFalling(levels.staffMultiplier)) problems.push('An upgrade must never need fewer staff.');
  if (!neverFalling(levels.costMultiplier)) problems.push('An upgrade must never cost less than the one before it.');
  // Diminishing returns: each level adds less income than the one before, so level 5 is a
  // goal rather than the obvious first move.
  const steps = levels.incomeMultiplier.slice(1).map((value, index) => value - levels.incomeMultiplier[index]!);
  if (!steps.every((step, index) => index === 0 || step <= steps[index - 1]!)) problems.push('Each upgrade should add no more income than the one before it.');
  if (levels.fatiguedUpgradeMarkup < 0) problems.push('A fatigued block cannot make upgrades cheaper.');

  if (rules.supply.beerPerStaffPerHour < 0 || rules.supply.productPerStaffPerHour < 0) problems.push('Supply cannot be negative.');
  if (rules.supply.beerPerStaffPerHour + rules.supply.productPerStaffPerHour <= 0) problems.push('Staff must burn some supply, or businesses are free to run.');
  if (rules.register.capHours <= 0) problems.push('A register that holds nothing loses every hour of income.');
  if (rules.staffTurnCost <= 0) problems.push('Opening or closing a business must cost turns.');
  if (rules.staffDepartureTurnsPerHour <= 0) problems.push('Unhappy staff must be able to walk off.');
  // The anti-passive rule: about a day, so somebody has to come by.
  if (rules.register.capHours > 48) problems.push(`A ${rules.register.capHours}-hour register lets a business run unattended for days.`);
  if (rules.awayOutputShare <= 0 || rules.awayOutputShare > 1) problems.push('An away business must make something, and no more than at home.');

  // Tiers.
  const tiers = rules.tiers;
  if (tiers.lotsOpen.join(',') !== '1,2,3') problems.push('A Foothold, Established and Stronghold block must open 1, 2 and 3 lots.');
  if (tiers.establishedHours <= 0) problems.push('Established must take some holding.');
  if (tiers.strongholdHours <= tiers.establishedHours) problems.push('A Stronghold must take longer to reach than Established.');
  if (tiers.establishedLotOneLevel < 1 || tiers.establishedLotOneLevel > levels.maxLevel) problems.push('Established needs a reachable lot-1 level.');
  if (tiers.strongholdLevels > 2 * levels.maxLevel) problems.push('A Stronghold needs more levels than two lots can hold.');
  if (tiers.strongholdLevels <= tiers.establishedLotOneLevel) problems.push('A Stronghold must need more invested than Established.');
  if (tiers.takeTierDrop < 1) problems.push('A Take must cost the block a tier, or conquest hands over the whole operation.');

  // War fatigue.
  const fatigue = rules.fatigue;
  if (fatigue.max <= 0 || fatigue.max >= 100) problems.push('Fatigue must stay under 100, so a business always makes something.');
  for (const key of ['perFight', 'perSiegeHour', 'onTake', 'onConcede', 'onSack', 'onLocalsClaim', 'recoveryPerHour', 'scarredRecoveryPerHour'] as const) {
    if (fatigue[key] <= 0) problems.push(`Fatigue ${key} must be positive.`);
  }
  if (fatigue.onConcede >= fatigue.onTake) problems.push('Conceding must leave less fatigue than a finished Take, or nobody concedes.');
  if (fatigue.onSack <= fatigue.onTake) problems.push('A Sack must leave the block worse off than a Take.');
  if (fatigue.scarredRecoveryPerHour >= fatigue.recoveryPerHour) problems.push('A block that keeps changing hands must heal slower, not faster.');
  if (fatigue.scarredHandsChanged < 2) problems.push('One capture should not scar a block.');

  // Block wars.
  const wars = rules.wars;
  const push = ruleset.turf.push;
  if (wars.warningMinutes < push.warningMinutes) problems.push('A block war must give at least the warning a push does.');
  if (wars.siegeHours <= 0) problems.push('A siege must take time.');
  // A holder who sleeps eight hours wakes up to a siege that is not finished yet.
  const fastestSiege = siegeHoursToWin(ruleset, 1);
  if (fastestSiege < 8) problems.push(`A siege with full allied help ends in ${fastestSiege.toFixed(1)} hours, less than a night's sleep.`);
  if (wars.breakSiegeControlLoss <= 0 || wars.breakSiegeControlLoss > 100) problems.push('Breaking a siege must knock Control back, and no further than zero.');
  // Room for one full siege and a retry after it is broken.
  const retryRoom = wars.warningMinutes / 60 + wars.siegeHours + wars.resiegeCooldownHours + wars.siegeHours * (wars.breakSiegeControlLoss / 100);
  if (wars.maxWarHours < retryRoom) problems.push(`A ${wars.maxWarHours}-hour war leaves no room to retry a broken siege (${retryRoom.toFixed(1)} hours needed).`);
  if (wars.truceHours < push.shieldHours) problems.push('A war truce must last at least as long as a push shield.');
  if (wars.sackTruceHours < wars.truceHours) problems.push('A sacked block must get at least the ordinary truce to rebuild.');
  if (wars.loserCooldownHours < wars.truceHours) problems.push('Losing a war must cost the attacker at least a truce.');
  if (wars.maxDeclaredPerCrew < 1) problems.push('A crew must be able to declare a war.');
  if (wars.breakMusterMinutes <= 0) problems.push('A break attempt must give an ally time to answer.');

  // Allies: decided as one per side, matched to the declarer, a cut of at most half.
  const allies = rules.allies;
  if (allies.maxPerSide !== 1) problems.push('Each side gets exactly one ally.');
  if (allies.maxShareOfDeclarer <= 0 || allies.maxShareOfDeclarer > 1) problems.push('An ally can send at most what the declarer committed.');
  if (allies.maxWarsAsAlly < 1) problems.push('A crew must be able to answer one call.');
  if (allies.maxCutShare <= 0 || allies.maxCutShare > 0.5) problems.push('The ally cut must be capped at half, so a war cannot route its whole take to a friend.');
  if (allies.cutStep <= 0 || allies.cutStep > allies.maxCutShare) problems.push('The ally cut needs a usable step.');
  if (allies.siegeCallMinutes <= 0) problems.push('An ally call must stay open long enough to answer.');

  // The locals.
  const locals = rules.locals;
  if (locals.graceHours < 0) problems.push('The grace period cannot be negative.');
  if (locals.levelLossEveryHours <= 0) problems.push('Dormant businesses must decay over time.');
  if (locals.takeoverTierDrop < tiers.takeTierDrop) problems.push('Abandoning a block must never cost less tier than losing it in a war.');
  if (locals.footholdAfterHours <= 0) problems.push('A dormant block must fall back to a Foothold.');
  if (locals.localsPerLevel <= 0) problems.push('A built-up block must make the locals stronger.');
  if (locals.maxLocalsBonusShare <= 0 || locals.maxLocalsBonusShare > 1) problems.push('The locals bonus must be capped at no more than double the district.');

  // Torching and sacking.
  const torch = rules.torch;
  if (torch.levelsLost < 1) problems.push('Torching a business must cost it levels.');
  if (torch.salvageShare < 0 || torch.salvageShare >= 0.5) problems.push('Torch salvage must stay well under what the levels cost.');
  if (torch.minutes <= 0) problems.push('A torch must take time, or it can land at the last second.');
  const crackdown = ruleset.turf.crackdown;
  if (crackdown && torch.closedFinalHours < crackdown.hoursBeforeRoundEnd) {
    problems.push('Torching must close by the Fed sweep, so it cannot be an end-of-season cash-out.');
  }
  if (rules.sackLevelsLost < 1) problems.push('A Sack must cost every business a level.');

  return problems;
}
