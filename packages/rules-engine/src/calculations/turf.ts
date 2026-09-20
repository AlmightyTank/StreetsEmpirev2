import type { DistrictKey, Ruleset, TurfDistrictRules, TurfRules } from '@streets/rulesets';

/**
 * 0.6.0-A. Turf: who holds a block, what holding it pays, and what it costs to stand
 * there. Everything here is pure and reads the ruleset; a round without `turf` gets the
 * 0.5.0 answers, which are that the street belongs to nobody.
 */

/** One district in one city. Forty of them with all eight cities enabled. */
export interface Block {
  readonly citySlug: string;
  readonly district: DistrictKey;
}

export const DISTRICT_KEYS: readonly DistrictKey[] = ['CASINO', 'NIGHTCLUB', 'LOW_RENT', 'URBAN_GHETTO', 'WINO_SLUMS'];

export function turfRules(ruleset: Ruleset): TurfRules | undefined {
  return ruleset.turf;
}

/** Every block in the round, in city then district order. Empty before 0.6.0-A. */
export function turfBlocks(ruleset: Ruleset): Block[] {
  if (!ruleset.turf) return [];
  const slugs = Object.keys(ruleset.cities ?? {});
  const cities = slugs.length ? slugs : [ruleset.round.startingCitySlug];
  return cities.flatMap((citySlug) => DISTRICT_KEYS.map((district) => ({ citySlug, district })));
}

export function turfDistrictRules(ruleset: Ruleset, district: DistrictKey): TurfDistrictRules | undefined {
  return ruleset.turf?.districts[district];
}

/** What the locals hold a block with at full strength. */
export function localsThugs(ruleset: Ruleset, block: Block): number {
  const rules = ruleset.turf;
  if (!rules) return 0;
  const multiplier = rules.locals.byCity[block.citySlug] ?? 1;
  return Math.round(rules.districts[block.district].localsThugs * multiplier);
}

/** Locals grow back onto a block they lost, up to their full strength. */
export function localsAfter(ruleset: Ruleset, block: Block, thugs: number, hours: number): number {
  const rules = ruleset.turf;
  if (!rules || hours <= 0) return thugs;
  return Math.min(localsThugs(ruleset, block), thugs + rules.locals.regrowPerHour * hours);
}

/** Multiplies the holder's own take on their own block. 1 for everyone else. */
export function turfHoldBonus(ruleset: Ruleset, district: DistrictKey, isHolder: boolean): number {
  if (!isHolder) return 1;
  return turfDistrictRules(ruleset, district)?.holdBonus ?? 1;
}

export interface TurfTax {
  /** Cents the worker loses. Burned, never paid to anyone. */
  readonly burnCents: number;
  /** Cents minted for the holder, after the daily cap on this payer. */
  readonly mintCents: number;
}

/**
 * The street tax on a trip worked on someone else's block. The worker's loss is burned and
 * the holder's share is minted from the house, so no money moves between two players: that
 * is the multi-account feeding route, and it stays closed.
 *
 * `mintedTodayCents` is what this payer has already minted for this holder today.
 */
export function turfTax(
  ruleset: Ruleset,
  district: DistrictKey,
  takeCents: number,
  mintedTodayCents = 0,
): TurfTax {
  const rules = ruleset.turf;
  const district_ = turfDistrictRules(ruleset, district);
  if (!rules || !district_ || takeCents <= 0) return { burnCents: 0, mintCents: 0 };
  const burnCents = Math.round(takeCents * district_.taxBurn);
  const room = Math.max(0, rules.caps.dailyTaxCapCentsPerPayer - mintedTodayCents);
  const mintCents = Math.min(room, Math.round(takeCents * district_.taxMint));
  return { burnCents, mintCents };
}

/** Presence fades: what is left of `turns` worked on a block after `hours`. */
export function presenceAfter(ruleset: Ruleset, turns: number, hours: number): number {
  const rules = ruleset.turf;
  if (!rules || hours <= 0) return turns;
  return turns * Math.pow(0.5, hours / rules.presence.halfLifeHours);
}

/** Can this crew post a corner here at all: enough presence, enough fit armed thugs. */
export function canClaim(
  ruleset: Ruleset,
  district: DistrictKey,
  presence: number,
  armedFitThugs: number,
): boolean {
  const rules = ruleset.turf;
  const district_ = turfDistrictRules(ruleset, district);
  if (!rules || !district_) return false;
  return presence >= rules.presence.turnsToClaim && armedFitThugs >= district_.cornerMinimum;
}

/** Beer and product a corner crew burns standing there for `hours`. */
export function cornerUpkeep(ruleset: Ruleset, thugs: number, hours: number): { beer: number; product: number } {
  const corner = ruleset.turf?.corner;
  if (!corner || thugs <= 0 || hours <= 0) return { beer: 0, product: 0 };
  return {
    beer: Math.ceil(thugs * corner.beerPerThugPerHour * hours),
    product: Math.ceil(thugs * corner.productPerThugPerHour * hours),
  };
}

/**
 * What a ruleset's turf block gets wrong. Run in the A simulation and in the tests, in the
 * same spirit as `cityRulesetProblems`: the numbers have to hold together before anything
 * is built on them.
 */
export function turfRulesetProblems(ruleset: Ruleset): string[] {
  const rules = ruleset.turf;
  if (!rules) return [];
  const problems: string[] = [];

  for (const district of DISTRICT_KEYS) {
    const row = rules.districts[district];
    const pay = ruleset.districts[district];
    if (!row) { problems.push(`${district} has no turf rules.`); continue; }
    if (row.holdBonus < 1) problems.push(`${district}: holding a block must never pay less than not holding it.`);
    // The house never pays out more than the street loses, or turf becomes a money printer.
    if (row.taxMint > row.taxBurn) problems.push(`${district}: the holder's share (${row.taxMint}) must not exceed what the worker loses (${row.taxBurn}).`);
    if (row.taxBurn >= 1 - ruleset.scouting.minHappinessMultiplier) problems.push(`${district}: a tax of ${row.taxBurn} takes more than a bad night on the block.`);
    if (row.cornerMinimum < 1) problems.push(`${district}: a corner needs somebody standing on it.`);
    if (row.localsThugs < row.cornerMinimum) problems.push(`${district}: the locals hold it with fewer thugs than the block needs to keep.`);
    // A richer block has to cost more muscle, the same trade the districts already make.
    for (const other of DISTRICT_KEYS) {
      const otherRow = rules.districts[other];
      const otherPay = ruleset.districts[other];
      if (!otherRow || pay.payMultiplier <= otherPay.payMultiplier) continue;
      if (row.cornerMinimum < otherRow.cornerMinimum) problems.push(`${district} pays more than ${other} but is cheaper to hold.`);
    }
  }

  for (const slug of Object.keys(ruleset.cities ?? {})) {
    if (rules.locals.byCity[slug] === undefined) problems.push(`${slug} has no locals holding its blocks.`);
  }
  for (const slug of Object.keys(rules.locals.byCity)) {
    if (ruleset.cities && !ruleset.cities[slug]) problems.push(`The locals hold blocks in ${slug}, which is not a city.`);
  }

  if (rules.presence.turnsToClaim <= 0) problems.push('A block can be claimed without ever working it.');
  if (rules.presence.halfLifeHours <= 0) problems.push('Presence must fade over hours, not instantly.');
  if (rules.caps.blocksPerCrewHome < 1) problems.push('Nobody can hold a block at home.');
  if (rules.caps.blocksPerAllianceInCity >= DISTRICT_KEYS.length) problems.push('One alliance can hold a whole city.');
  if (rules.caps.blocksPerCrewHome >= DISTRICT_KEYS.length) problems.push('One crew can hold a whole city.');
  if (rules.caps.dailyTaxCapCentsPerPayer <= 0) problems.push('The tax cap leaves the holder nothing.');

  const raid = ruleset.combat?.strength;
  const convoy = ruleset.travel?.convoys;
  const fight = rules.push.fight;
  if (raid && fight.defenseMultiplier > raid.defenseMultiplier) problems.push('A corner must be easier to hold than a home.');
  if (convoy && fight.variance > convoy.fight.variance) problems.push('A push must swing less than an ambush on the road.');
  if (raid && fight.variance < raid.variance) problems.push('A push must swing at least as much as a raid.');
  if (rules.push.warningMinutes <= 0) problems.push('A push must give its holder a window.');
  if (rules.push.shieldHours <= 0) problems.push('A block taken can be taken straight back.');
  if (rules.push.allies.chanceToShowUp > 1 || rules.push.allies.chanceToShowUp <= 0) problems.push('Allies show up sometimes, or the help is not help.');

  return problems;
}
