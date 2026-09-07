import type { District, DistrictKey, Ruleset } from '@streets/rulesets';
import {
  applyVariance,
  defaultRng,
  happinessMultiplier,
  roundStochastic,
  type Rng,
} from '../rng.js';
import {
  calculateCookConsumption,
  calculateDepartures,
  calculateWorkConsumption,
  calculateWorkSupplyNeeds,
  type Consumption,
  type Departures,
  type UpkeepInput,
} from './upkeep.js';
import {
  calculateGrindFatigue,
  calculateWorkFatigue,
  type WorkFatigue,
} from './fatigue.js';

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

export interface ScoutOutcome {
  district: DistrictKey;
  turnsSpent: number;
  whoresRecruited: number;
  thugsRecruited: number;
  /** What the crew's current size did to the headline rates, 0..1. */
  recruitmentMultipliers: { whores: number; thugs: number };
}

/**
 * Section 26. Turns spent looking for people, and nothing else.
 *
 * Nobody is working: nothing is earned, nothing is consumed, nobody is worn
 * out. What you get is faces, and fewer of them the bigger you already are.
 */
export function calculateScout(
  context: ActionContext & { district: DistrictKey },
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
    district,
    turnsSpent: turns,
    recruitmentMultipliers: multipliers,
    whoresRecruited: recruit(definition.whoresPerTurn, multipliers.whores),
    thugsRecruited: recruit(definition.thugsPerTurn, multipliers.thugs),
  };
}

// --- work the streets -------------------------------------------------------

export interface Exposure {
  /** Girls this block's thugs can cover. */
  covered: number;
  /** Fraction of the crew standing on their own, 0..1. */
  exposed: number;
  /** What that cost the take, 0..1 of it kept. */
  takeMultiplier: number;
  /** What that did to the wear, 1.0 is untouched. */
  fatigueMultiplier: number;
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
  const rules = ruleset.work.exposure;

  const covered = crew.thugs * district.protectionWhoresPerThug;
  const exposed =
    crew.whores <= 0 ? 0 : Math.min(1, Math.max(0, 1 - covered / crew.whores));

  return {
    covered,
    exposed,
    takeMultiplier: 1 - exposed * rules.maxTakePenalty,
    fatigueMultiplier: 1 + exposed * rules.maxExtraFatigue,
  };
}

export interface WorkOutcome {
  district: DistrictKey;
  turnsSpent: number;
  exposure: Exposure;
  /** Everything the girls brought in. */
  grossCents: bigint;
  /** The crew's share, which is what pays their fatigue back. */
  crewTakeCents: bigint;
  /** Your share, which is what lands in cash. */
  pimpTakeCents: bigint;
  /** Product turned up on the block rather than bought. */
  crackFound: number;
  consumption: Consumption;
  shortages: { condoms: number; beer: number };
  departures: Departures;
  fatigue: { whore: WorkFatigue; thug: WorkFatigue };
}

/**
 * Work the Streets. The only action that makes money.
 *
 * The girls earn, the district decides how well, and the whole crew comes home
 * more tired than they left. How much of that tiredness sticks depends on
 * whether their cut of the night was worth the night - and a block you do not
 * have the muscle to cover pays worse and hurts more.
 */
export function calculateWork(
  context: ActionContext & { district: DistrictKey; payoutPercent: number },
): WorkOutcome {
  const { player, turns, ruleset, district, payoutPercent } = context;
  const rng = context.rng ?? defaultRng;
  const city = context.city ?? NO_CITY_MODIFIERS;

  const rules = ruleset.work;
  const definition = rules.districts[district];

  const exposure = calculateExposure(player, definition, ruleset);

  const earned = Math.floor(
    applyVariance(
      player.whores *
        rules.grossPerWhorePerTurnCents *
        turns *
        happinessMultiplier(player.whoreHappiness, rules.minHappinessMultiplier) *
        definition.payMultiplier *
        exposure.takeMultiplier *
        city.incomeModifier,
      rules.variance,
      rng,
    ),
  );

  const grossCents = BigInt(Math.max(0, earned));
  const crewTakeCents = BigInt(Math.floor(Number(grossCents) * (payoutPercent / 100)));
  const pimpTakeCents = grossCents - crewTakeCents;

  const crewSize = player.whores + player.thugs;
  const needed = calculateWorkSupplyNeeds(player, turns, ruleset);
  const consumption = calculateWorkConsumption(player, turns, ruleset);
  const shortages = {
    condoms: needed.condoms - consumption.condoms,
    beer: needed.beer - consumption.beer,
  };

  const fatigue = {
    whore: calculateWorkFatigue(
      {
        turns,
        crewSize,
        crewTakeCents,
        wearPerTurn: rules.fatigue.whorePerTurn * exposure.fatigueMultiplier,
      },
      ruleset,
    ),
    thug: calculateWorkFatigue(
      {
        turns,
        crewSize,
        crewTakeCents,
        wearPerTurn: rules.fatigue.thugPerTurn * exposure.fatigueMultiplier,
      },
      ruleset,
    ),
  };

  // Keep shortage wear in the persisted fatigue balance. A good payout can
  // cover ordinary work wear, but cannot erase an unsupplied shift. Round up
  // so a partial shortage survives the integer fatigue persistence.
  const applyShortage = (wear: WorkFatigue, missing: number, required: number, rate: number) => {
    if (missing <= 0 || required <= 0) return;
    wear.relief = Math.min(wear.relief, wear.wear);
    wear.wear += Math.ceil(turns * (missing / required) * rate);
    wear.change = wear.wear - wear.relief;
    wear.reliefRatio = wear.wear > 0 ? wear.relief / wear.wear : 1;
  };
  applyShortage(fatigue.whore, shortages.condoms, needed.condoms, rules.shortages.whorePerTurnWithoutCondoms);
  applyShortage(fatigue.thug, shortages.beer, needed.beer, rules.shortages.thugPerTurnWithoutBeer);

  // Every so often a night turns up product instead of cash.
  let crackFound = 0;
  for (let turn = 0; turn < turns; turn++) {
    if (rng() < rules.finds.chancePerTurn) {
      const span = rules.finds.crackMax - rules.finds.crackMin;
      crackFound += rules.finds.crackMin + Math.floor(rng() * (span + 1));
    }
  }

  return {
    district,
    turnsSpent: turns,
    exposure,
    grossCents,
    crewTakeCents,
    pimpTakeCents,
    crackFound,
    consumption,
    shortages,
    departures: calculateDepartures(player, ruleset, rng),
    fatigue,
  };
}

// --- produce crack ----------------------------------------------------------

export interface ProduceOutcome {
  turnsSpent: number;
  crackProduced: number;
  /** What the ingredients cost. */
  ingredientCents: bigint;
  consumption: Consumption;
  departures: Departures;
  thugFatigue: number;
  /** True when cash, not thugs, was the limit on the batch. */
  limitedByCash: boolean;
}

/**
 * Section 29. Turns and money in, crack out.
 *
 * Nobody earns anything cooking and there is no take to pay the crew back
 * with, so every point of wear sticks. A batch you cannot afford the
 * ingredients for simply comes out smaller.
 */
export function calculateProduce(
  context: ActionContext & { cashCents: bigint },
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

  return {
    turnsSpent: turns,
    crackProduced,
    ingredientCents: BigInt(crackProduced) * BigInt(crack.ingredientCentsPerRock),
    consumption: calculateCookConsumption(player, turns, ruleset),
    departures: calculateDepartures(player, ruleset, rng),
    thugFatigue: calculateGrindFatigue(turns, ruleset.production.fatigue.thugPerTurn),
    limitedByCash: crackProduced < batch,
  };
}
