import type { District, DistrictKey, Ruleset } from '@streets/rulesets';
import {
  applyVariance,
  defaultRng,
  happinessMultiplier,
  roundStochastic,
  type Rng,
} from '../rng.js';
import { clientMultiplier } from './clients.js';
import {
  calculateDepartures,
  calculateInfections,
  calculateWorkConsumption,
  calculateWorkSupplyNeeds,
  type Consumption,
  type Departures,
  type Infections,
  type UpkeepInput,
} from './upkeep.js';

/** City modifiers, all 1.00 until Travel ships. Section 12. */
export interface CityModifiers {
  scoutModifier: number;
  incomeModifier: number;
  crackModifier: number;
}

const NO_CITY_MODIFIERS: CityModifiers = {
  scoutModifier: 1,
  incomeModifier: 1,
  crackModifier: 1,
};

export interface ActionContext {
  player: UpkeepInput;
  turns: number;
  ruleset: Ruleset;
  city?: CityModifiers;
  rng?: Rng;
}

// --- recruitment ------------------------------------------------------------

/**
 * Diminishing returns on recruitment.
 *
 *   softCap / (softCap + current)
 *
 * 1.0 for a nobody, 0.5 at the soft cap, and falling away after. Growth over
 * a round becomes roughly the square root of turns spent rather than linear,
 * which is what stops the biggest operation simply staying biggest by doing
 * the same thing forever.
 */
export function recruitmentMultiplier(current: number, softCap: number): number {
  if (softCap <= 0) return 1;
  return softCap / (softCap + Math.max(0, current));
}

/** What a player would recruit per turn in a district, at their current size. */
export function expectedRecruitsPerTurn(
  district: District,
  crew: { whores: number; thugs: number },
  ruleset: Ruleset,
  city: CityModifiers = NO_CITY_MODIFIERS,
): { whores: number; thugs: number } {
  const caps = ruleset.scouting.recruitment;

  return {
    whores:
      district.whoresPerTurn *
      recruitmentMultiplier(crew.whores, caps.whoreSoftCap) *
      city.scoutModifier,
    thugs:
      district.thugsPerTurn *
      recruitmentMultiplier(crew.thugs, caps.thugSoftCap) *
      city.scoutModifier,
  };
}

// --- scout ------------------------------------------------------------------

export interface ScoutOutcome extends StreetTake {
  turnsSpent: number;
  whoresRecruited: number;
  thugsRecruited: number;
  /** What the crew's current size did to the headline rates, 0..1. */
  recruitmentMultipliers: { whores: number; thugs: number };
}

/**
 * Manual 3.1. "Where to go to make money for yourself, and go out and pickup
 * some whores and thugs."
 *
 * One trip, both jobs: the girls work the block while you work the room. The
 * district decides how well they earn and how few new faces there are to find,
 * and those pull against each other, so no district is simply best.
 */
export function calculateScout(
  context: ActionContext & {
    district: DistrictKey;
    clientCapacity: number;
    payoutPercent: number;
  },
): ScoutOutcome {
  const { player, turns, ruleset, district } = context;
  const rng = context.rng ?? defaultRng;
  const city = context.city ?? NO_CITY_MODIFIERS;

  const rules = ruleset.scouting;
  const definition = rules.districts[district];

  const multipliers = {
    whores: recruitmentMultiplier(player.whores, rules.recruitment.whoreSoftCap),
    thugs: recruitmentMultiplier(player.thugs, rules.recruitment.thugSoftCap),
  };

  const recruit = (perTurn: number, multiplier: number): number =>
    Math.max(
      0,
      roundStochastic(
        applyVariance(
          perTurn * turns * multiplier * city.scoutModifier,
          rules.variance,
          rng,
        ),
        rng,
      ),
    );

  return {
    ...calculateStreetTake({ ...context, rng }),
    turnsSpent: turns,
    recruitmentMultipliers: multipliers,
    whoresRecruited: recruit(definition.whoresPerTurn, multipliers.whores),
    thugsRecruited: recruit(definition.thugsPerTurn, multipliers.thugs),
  };
}

// --- a night's earnings, shared by both actions ------------------------------

export interface Exposure {
  /** Girls this block's thugs can cover. */
  covered: number;
  /** Fraction of the crew standing on their own, 0..1. */
  exposed: number;
  /** What that cost the take, 0..1 of it kept. */
  takeMultiplier: number;
}

/**
 * How well the crew covers this particular block. A rich district watches its
 * corners, so a thug there minds four girls; nobody in the slums cares enough
 * to stop twenty.
 */
export function calculateExposure(
  crew: { whores: number; thugs: number },
  district: District,
  ruleset: Ruleset,
): Exposure {
  const rules = ruleset.scouting.exposure;

  const covered = crew.thugs * district.protectionWhoresPerThug;
  const exposed =
    crew.whores <= 0 ? 0 : Math.min(1, Math.max(0, 1 - covered / crew.whores));

  return {
    covered,
    exposed,
    takeMultiplier: 1 - exposed * rules.maxTakePenalty,
  };
}

/**
 * A night's earnings. Manual 3.1 and 3.2 both send the girls out, so both
 * actions run this - Produce just does it at a reduced rate.
 */
export interface StreetTake {
  exposure: Exposure;
  /** The block the girls actually worked, hidden or not. */
  district: DistrictKey;
  /** Clients on that block this hour, and what that did to the take. */
  clients: { capacity: number; takeMultiplier: number };
  /** Everything the girls brought in. */
  grossCents: bigint;
  /** The crew's share of the night. */
  crewTakeCents: bigint;
  /** Your share, which is what lands in cash. */
  pimpTakeCents: bigint;
  /** Product turned up on the block rather than bought. */
  crackFound: number;
  consumption: Consumption;
  shortages: { condoms: number; beer: number };
  departures: Departures;
  /** Who caught something working an under-supplied shift. */
  infections: Infections;
}

/**
 * What the girls bring in over `turns`.
 *
 * `district` null means they worked their usual spot rather than a block you
 * picked - that is Produce Crack, where nobody is out choosing corners for
 * them. `takeMultiplier` is how well the night went relative to a scouted one.
 */
export function calculateStreetTake(
  context: ActionContext & {
    district: DistrictKey;
    clientCapacity: number;
    payoutPercent: number;
    takeMultiplier?: number;
  },
): StreetTake {
  const { player, turns, ruleset, district, payoutPercent } = context;
  const rng = context.rng ?? defaultRng;
  const city = context.city ?? NO_CITY_MODIFIERS;
  const takeMultiplier = context.takeMultiplier ?? 1;

  const rules = ruleset.scouting;
  const definition = rules.districts[district];
  const exposure = calculateExposure(player, definition, ruleset);

  // A block only holds so many people willing to pay.
  const clients = {
    capacity: context.clientCapacity,
    takeMultiplier: clientMultiplier(context.clientCapacity, player.whores),
  };

  const earned = Math.floor(
    applyVariance(
      player.whores *
        rules.grossPerWhorePerTurnCents *
        turns *
        happinessMultiplier(player.whoreHappiness, rules.minHappinessMultiplier) *
        definition.payMultiplier *
        takeMultiplier *
        exposure.takeMultiplier *
        clients.takeMultiplier *
        city.incomeModifier,
      rules.takeVariance,
      rng,
    ),
  );

  const grossCents = BigInt(Math.max(0, earned));
  const crewTakeCents = BigInt(Math.floor(Number(grossCents) * (payoutPercent / 100)));
  const pimpTakeCents = grossCents - crewTakeCents;

  const needed = calculateWorkSupplyNeeds(player, turns, ruleset);
  const consumption = calculateWorkConsumption(player, turns, ruleset);
  const shortages = {
    condoms: needed.condoms - consumption.condoms,
    beer: needed.beer - consumption.beer,
  };



  // Every so often a night turns up product instead of cash.
  let crackFound = 0;
  for (let turn = 0; turn < turns; turn++) {
    if (rng() < rules.finds.chancePerTurn) {
      const span = rules.finds.crackMax - rules.finds.crackMin;
      crackFound += rules.finds.crackMin + Math.floor(rng() * (span + 1));
    }
  }

  return {
    exposure,
    district,
    clients,
    grossCents,
    crewTakeCents,
    pimpTakeCents,
    crackFound,
    consumption,
    shortages,
    departures: calculateDepartures(player, turns, ruleset, rng),
    // Any shift that puts the girls out can go wrong without condoms.
    infections: calculateInfections(
      player,
      turns,
      needed.condoms > 0 ? shortages.condoms / needed.condoms : 0,
      ruleset,
      rng,
    ),
  };
}

// --- produce crack ----------------------------------------------------------

export interface ProduceOutcome extends StreetTake {
  turnsSpent: number;
  crackProduced: number;
  /** What the ingredients cost. */
  ingredientCents: bigint;
  /** True when cash, not thugs, was the limit on the batch. */
  limitedByCash: boolean;
}

/**
 * Manual 3.2. "Producing crack sends your whores out, while your thugs produce
 * crack... But the whores produce less money because the thugs are busy and
 * not managing the hoes."
 *
 * So the girls still work and still burn the shelf - they just earn a fraction
 * of a scouted night, because the muscle that would be running them is inside
 * cooking. What that buys is the crack that keeps them from walking out.
 */
export function calculateProduce(
  context: ActionContext & {
    cashCents: bigint;
    payoutPercent: number;
    /** Capacity of `ruleset.scouting.produceDistrict` this hour. */
    clientCapacity: number;
  },
): ProduceOutcome {
  const { player, turns, ruleset, cashCents } = context;
  const rng = context.rng ?? defaultRng;
  const city = context.city ?? NO_CITY_MODIFIERS;

  const crack = ruleset.production.crack;

  const batch = Math.max(
    0,
    roundStochastic(
      applyVariance(
        player.thugs *
          crack.perThugPerTurn *
          turns *
          happinessMultiplier(player.thugHappiness, crack.minHappinessMultiplier) *
          city.crackModifier,
        crack.variance,
        rng,
      ),
      rng,
    ),
  );

  const affordable =
    crack.ingredientCentsPerRock > 0
      ? Number(cashCents / BigInt(crack.ingredientCentsPerRock))
      : batch;

  const crackProduced = Math.min(batch, Math.max(0, affordable));

  // The girls are still out - on their usual block, since nobody is choosing
  // one for them tonight. Which block that is stays hidden.
  const take = calculateStreetTake({
    ...context,
    rng,
    district: ruleset.scouting.produceDistrict,
    takeMultiplier: ruleset.production.unsupervisedTakeMultiplier,
  });

  return {
    ...take,
    turnsSpent: turns,
    crackProduced,
    ingredientCents: BigInt(crackProduced) * BigInt(crack.ingredientCentsPerRock),
    limitedByCash: crackProduced < batch,
  };
}
