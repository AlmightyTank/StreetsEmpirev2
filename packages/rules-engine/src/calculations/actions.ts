import type { District, DistrictKey, Ruleset } from '@streets/rulesets';
import type { WorkSupplyPlan } from './work-supply.js';
import {
  applyVariance,
  defaultRng,
  happinessMultiplier,
  roundStochastic,
  type Rng,
} from '../rng.js';
import { clientMultiplier } from './clients.js';
import { heatTakeMultiplier } from './heat.js';
import type { ProductRecipe } from './product-economy.js';
import {
  calculateDepartures,
  calculateInfections,
  type Consumption,
  type Departures,
  type Infections,
  type UpkeepInput,
} from './upkeep.js';

/** City modifiers. Section 12. From 0.5.0-A they come from the ruleset's `cities` (see `cityModifiers`), and 1.00 before it. */
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

function emptyConsumption(): Consumption {
  return { condoms: 0, crack: 0, beer: 0 };
}

function emptyDepartures(): Departures {
  return { whores: 0, thugs: 0 };
}

function emptyInfections(): Infections {
  return { infected: 0, treated: 0, medicineUsed: 0, lost: 0 };
}

function addConsumption(target: Consumption, next: Consumption): void {
  target.condoms += next.condoms;
  target.crack += next.crack;
  target.beer += next.beer;
}

function addDepartures(target: Departures, next: Departures): void {
  target.whores += next.whores;
  target.thugs += next.thugs;
}

function addInfections(target: Infections, next: Infections): void {
  target.infected += next.infected;
  target.treated += next.treated;
  target.medicineUsed += next.medicineUsed;
  target.lost += next.lost;
}

type TurnSupplyEffects = Pick<WorkSupplyPlan, 'takeMultiplier' | 'recruitmentMultiplier' | 'departureMultiplier' | 'morale'>;

function supplyEffectsForTurn(plan: WorkSupplyPlan | undefined, turn: number): TurnSupplyEffects {
  if (!plan || plan.slices.length === 0) {
    return {
      takeMultiplier: plan?.takeMultiplier ?? 1,
      recruitmentMultiplier: plan?.recruitmentMultiplier ?? 1,
      departureMultiplier: plan?.departureMultiplier ?? 1,
      morale: plan?.morale ?? 0,
    };
  }

  const midpoint = turn + 0.5;
  let elapsed = 0;
  for (const slice of plan.slices) {
    elapsed += slice.turns;
    if (midpoint <= elapsed + 1e-9) {
      return {
        takeMultiplier: slice.takeMultiplier,
        recruitmentMultiplier: slice.recruitmentMultiplier,
        departureMultiplier: slice.departureMultiplier,
        morale: slice.morale,
      };
    }
  }

  const last = plan.slices[plan.slices.length - 1]!;
  return {
    takeMultiplier: last.takeMultiplier,
    recruitmentMultiplier: last.recruitmentMultiplier,
    departureMultiplier: last.departureMultiplier,
    morale: last.morale,
  };
}

function spendCrew(state: UpkeepInput, departures: Departures, infections: Infections): void {
  state.whores = Math.max(0, state.whores - departures.whores - infections.lost);
  state.thugs = Math.max(0, state.thugs - departures.thugs);
  state.medicine = Math.max(0, state.medicine - infections.medicineUsed);
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
    /** 0.4.0-B. Passed through to the street take. */
    supply?: WorkSupplyPlan;
    /** 0.4.0-C. Passed through to the street take. */
    heat?: number;
  },
): ScoutOutcome {
  const { player, turns, ruleset, district } = context;
  const rng = context.rng ?? defaultRng;
  const city = context.city ?? NO_CITY_MODIFIERS;

  const rules = ruleset.scouting;
  const definition = rules.districts[district];
  const state: UpkeepInput = { ...player };
  const initialMultipliers = {
    whores: recruitmentMultiplier(player.whores, rules.recruitment.whoreSoftCap),
    thugs: recruitmentMultiplier(player.thugs, rules.recruitment.thugSoftCap),
  };
  const whoreVariance = 1 + (rng() * 2 - 1) * rules.variance;
  const thugVariance = 1 + (rng() * 2 - 1) * rules.variance;
  let whoreCarry = 0;
  let thugCarry = 0;
  let whoresRecruited = 0;
  let thugsRecruited = 0;

  const take = calculateStreetTake({
    ...context,
    player: state,
    rng,
    afterTurn: (turnState, turn) => {
      const supply = supplyEffectsForTurn(context.supply, turn);
      whoreCarry +=
        definition.whoresPerTurn *
        recruitmentMultiplier(turnState.whores, rules.recruitment.whoreSoftCap) *
        supply.recruitmentMultiplier *
        city.scoutModifier *
        whoreVariance;
      thugCarry +=
        definition.thugsPerTurn *
        recruitmentMultiplier(turnState.thugs, rules.recruitment.thugSoftCap) *
        city.scoutModifier *
        thugVariance;

      const joinedWhores = Math.floor(whoreCarry);
      const joinedThugs = Math.floor(thugCarry);
      if (joinedWhores > 0) {
        turnState.whores += joinedWhores;
        whoresRecruited += joinedWhores;
        whoreCarry -= joinedWhores;
      }
      if (joinedThugs > 0) {
        turnState.thugs += joinedThugs;
        thugsRecruited += joinedThugs;
        thugCarry -= joinedThugs;
      }
    },
  });

  if (roundStochastic(whoreCarry, rng) > 0) whoresRecruited++;
  if (roundStochastic(thugCarry, rng) > 0) thugsRecruited++;

  return {
    ...take,
    turnsSpent: turns,
    recruitmentMultipliers: initialMultipliers,
    whoresRecruited,
    thugsRecruited,
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
function weaponCount(crew: { pistols?: number; shotguns?: number; tek9s?: number; ak47s?: number }): number {
  return (crew.pistols ?? 0) + (crew.shotguns ?? 0) + (crew.tek9s ?? 0) + (crew.ak47s ?? 0);
}

export function armedThugsForStreet(crew: { thugs: number; pistols?: number; shotguns?: number; tek9s?: number; ak47s?: number }, ruleset: Ruleset): number {
  return ruleset.scouting.requiresArmedThugs ? Math.min(crew.thugs, weaponCount(crew)) : crew.thugs;
}

export function unarmedThugsForStreet(crew: { thugs: number; pistols?: number; shotguns?: number; tek9s?: number; ak47s?: number }, ruleset: Ruleset): number {
  return Math.max(0, crew.thugs - armedThugsForStreet(crew, ruleset));
}

export function calculateExposure(
  crew: { whores: number; thugs: number; pistols?: number; shotguns?: number; tek9s?: number; ak47s?: number },
  district: District,
  ruleset: Ruleset,
): Exposure {
  const rules = ruleset.scouting.exposure;

  const effectiveThugs = armedThugsForStreet(crew, ruleset);
  const covered = effectiveThugs * district.protectionWhoresPerThug;
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
  /** Products that turned up on the block rather than being bought. */
  productsFound: Record<string, number>;
  /** Legacy convenience field for old clients and single-product rounds. */
  crackFound: number;
  consumption: Consumption;
  shortages: { condoms: number; beer: number };
  departures: Departures;
  /** Who caught something working an under-supplied shift. */
  infections: Infections;
}

function streetFind(ruleset: Ruleset, district: DistrictKey, roll: number): { product: string; quantity: number } {
  const finds = ruleset.scouting.finds;
  const choices = finds.productsByDistrict?.[district];
  if (!choices?.length) {
    const span = finds.crackMax - finds.crackMin;
    return { product: 'CRACK', quantity: finds.crackMin + Math.floor(roll * (span + 1)) };
  }

  const valid = choices.filter((choice) =>
    choice.weight > 0 &&
    Number.isSafeInteger(choice.min) &&
    Number.isSafeInteger(choice.max) &&
    choice.min >= 0 &&
    choice.max >= choice.min &&
    Boolean(ruleset.products?.[choice.product]),
  );
  if (!valid.length) {
    const span = finds.crackMax - finds.crackMin;
    return { product: 'CRACK', quantity: finds.crackMin + Math.floor(roll * (span + 1)) };
  }

  const total = valid.reduce((sum, choice) => sum + choice.weight, 0);
  const point = roll * total;
  let floor = 0;
  for (const choice of valid) {
    const ceiling = floor + choice.weight;
    if (point < ceiling) {
      const within = choice.weight <= 0 ? 0 : (point - floor) / choice.weight;
      const span = choice.max - choice.min;
      return { product: choice.product, quantity: choice.min + Math.min(span, Math.floor(within * (span + 1))) };
    }
    floor = ceiling;
  }

  const last = valid[valid.length - 1]!;
  return { product: last.product, quantity: last.max };
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
    /**
     * 0.4.0-B. The trip's supply plan, on rounds with work supply. It decides
     * how much crack is burned and weights the take by each slice.
     */
    supply?: WorkSupplyPlan;
    /** 0.4.0-C. Heat as the trip starts, on rounds with Heat. High Heat drags the take. */
    heat?: number;
    /** 0.4.0-C. Thug departures, when thugs are cooking on their own supply. */
    thugDepartureMultiplier?: number;
    thugDepartureMultiplierForTurn?: (turn: number) => number | undefined;
    /** Runs after the turn's work is done, before end-of-turn losses. */
    onTurnWorked?: (state: UpkeepInput, turn: number) => void;
    /** Runs after one turn's losses are applied, so callers can add same-trip changes. */
    afterTurn?: (state: UpkeepInput, turn: number) => void;
  },
): StreetTake {
  const { player, turns, ruleset, district, payoutPercent } = context;
  const rng = context.rng ?? defaultRng;
  const city = context.city ?? NO_CITY_MODIFIERS;
  const takeMultiplier = context.takeMultiplier ?? 1;

  const rules = ruleset.scouting;
  const definition = rules.districts[district];
  const state: UpkeepInput = { ...player };
  let exposure = calculateExposure(state, definition, ruleset);
  let clients = {
    capacity: context.clientCapacity,
    takeMultiplier: clientMultiplier(context.clientCapacity, state.whores),
  };
  const consumption = emptyConsumption();
  const departures = emptyDepartures();
  const infections = emptyInfections();
  // Loss rails are per action, not per simulated turn. calculateDepartures /
  // calculateInfections still apply their own one-call ceilings, but this loop
  // calls them once per turn so we also keep the remaining action-wide budget.
  const departureCaps = {
    whores: Math.ceil(Math.max(0, player.whores) * ruleset.departures.maxFractionPerAction),
    thugs: Math.ceil(Math.max(0, player.thugs) * ruleset.departures.maxFractionPerAction),
  };
  const infectionCap = player.whores <= 0
    ? 0
    : Math.max(1, Math.floor(player.whores * ruleset.health.maxInfectedFractionPerAction));
  const shortages = { condoms: 0, beer: 0 };
  const needCarry = { condoms: 0, crack: 0, beer: 0 };
  let gross = 0;
  const productsFound: Record<string, number> = {};
  const workedTurns = Math.max(0, turns);

  for (let turn = 0; turn < workedTurns; turn++) {
    const supply = supplyEffectsForTurn(context.supply, turn);
    exposure = calculateExposure(state, definition, ruleset);
    clients = {
      capacity: context.clientCapacity,
      takeMultiplier: clientMultiplier(context.clientCapacity, state.whores),
    };

    gross += Math.floor(
      applyVariance(
        state.whores *
          rules.grossPerWhorePerTurnCents *
          happinessMultiplier(state.whoreHappiness, rules.minHappinessMultiplier) *
          definition.payMultiplier *
          takeMultiplier *
          exposure.takeMultiplier *
          clients.takeMultiplier *
          supply.takeMultiplier *
          heatTakeMultiplier(context.heat ?? 0, ruleset) *
          city.incomeModifier,
        rules.takeVariance,
        rng,
      ),
    );

    const rates = rules.consumption;
    needCarry.condoms += state.whores * rates.condomsPerWhorePerTurn;
    needCarry.crack += state.whores * rates.crackPerWhorePerTurn;
    needCarry.beer += state.thugs * rates.beerPerThugPerTurn;
    const turnNeeded = {
      condoms: Math.floor(needCarry.condoms),
      crack: Math.floor(needCarry.crack),
      beer: Math.floor(needCarry.beer),
    };
    needCarry.condoms -= turnNeeded.condoms;
    needCarry.crack -= turnNeeded.crack;
    needCarry.beer -= turnNeeded.beer;
    if (turn === workedTurns - 1) {
      const finalCondoms = Math.ceil(needCarry.condoms - 1e-9);
      const finalBeer = Math.ceil(needCarry.beer - 1e-9);
      turnNeeded.condoms += finalCondoms;
      turnNeeded.beer += finalBeer;
      needCarry.condoms = 0;
      needCarry.beer = 0;
    }
    const turnConsumption = {
      condoms: Math.min(turnNeeded.condoms, state.condoms),
      crack: Math.min(turnNeeded.crack, state.crack),
      beer: Math.min(turnNeeded.beer, state.beer),
    };
    if (context.supply) turnConsumption.crack = 0;
    addConsumption(consumption, turnConsumption);
    state.condoms = Math.max(0, state.condoms - turnConsumption.condoms);
    state.crack = Math.max(0, state.crack - turnConsumption.crack);
    state.beer = Math.max(0, state.beer - turnConsumption.beer);
    shortages.condoms += turnNeeded.condoms - turnConsumption.condoms;
    shortages.beer += turnNeeded.beer - turnConsumption.beer;

    if (rng() < rules.finds.chancePerTurn) {
      const found = streetFind(ruleset, district, rng());
      if (found.quantity > 0) productsFound[found.product] = (productsFound[found.product] ?? 0) + found.quantity;
    }

    context.onTurnWorked?.(state, turn);

    const rawDepartures = calculateDepartures(state, 1, ruleset, rng, {
      whores: supply.departureMultiplier,
      thugs: context.thugDepartureMultiplierForTurn?.(turn) ?? context.thugDepartureMultiplier,
    });
    const turnDepartures = {
      whores: Math.min(rawDepartures.whores, Math.max(0, departureCaps.whores - departures.whores)),
      thugs: Math.min(rawDepartures.thugs, Math.max(0, departureCaps.thugs - departures.thugs)),
    };

    const infectionRoom = Math.max(0, infectionCap - infections.infected);
    const rawInfections = infectionRoom > 0
      ? calculateInfections(
          state,
          1,
          turnNeeded.condoms > 0 ? (turnNeeded.condoms - turnConsumption.condoms) / turnNeeded.condoms : 0,
          ruleset,
          rng,
        )
      : emptyInfections();
    const infected = Math.min(rawInfections.infected, infectionRoom);
    const treated = Math.min(infected, rawInfections.treated);
    const turnInfections = {
      infected,
      treated,
      medicineUsed: treated * ruleset.health.medicinePerTreatment,
      lost: infected - treated,
    };

    addDepartures(departures, turnDepartures);
    addInfections(infections, turnInfections);
    spendCrew(state, turnDepartures, turnInfections);
    context.afterTurn?.(state, turn);
  }

  if (context.supply) consumption.crack = context.supply.consumed.CRACK ?? 0;

  const grossCents = BigInt(Math.max(0, gross));
  const crewTakeCents = BigInt(Math.floor(Number(grossCents) * (payoutPercent / 100)));
  const pimpTakeCents = grossCents - crewTakeCents;

  return {
    exposure,
    district,
    clients,
    grossCents,
    crewTakeCents,
    pimpTakeCents,
    productsFound,
    crackFound: productsFound.CRACK ?? 0,
    consumption,
    shortages,
    departures,
    infections,
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
    /** 0.4.0-B. Passed through to the street take. */
    supply?: WorkSupplyPlan;
    /** 0.4.0-C. Passed through to the street take. */
    heat?: number;
    /** 0.4.0-C. What the cooking thugs burn: output, morale and departures. */
    cook?: WorkSupplyPlan;
    /** 0.4.0-D. What is being cooked. Defaults to crack from `production.crack`. */
    recipe?: ProductRecipe;
  },
): ProduceOutcome {
  const { ruleset, turns, cashCents } = context;
  const rng = context.rng ?? defaultRng;
  const city = context.city ?? NO_CITY_MODIFIERS;

  const legacy = ruleset.production.crack;
  const crack = context.recipe
    ? { perThugPerTurn: context.recipe.perThugPerTurn, minHappinessMultiplier: context.recipe.minHappinessMultiplier, variance: context.recipe.variance, ingredientCentsPerRock: context.recipe.ingredientCentsPerUnit }
    : legacy;
  const productionVariance = 1 + (rng() * 2 - 1) * crack.variance;
  const affordable =
    crack.ingredientCentsPerRock > 0
      ? Number(cashCents / BigInt(crack.ingredientCentsPerRock))
      : Number.POSITIVE_INFINITY;
  let productCarry = 0;
  let crackProduced = 0;
  let limitedByCash = false;
  const addProduct = (units: number): void => {
    const allowed = Math.max(0, affordable - crackProduced);
    const made = Math.min(units, allowed);
    if (made < units) limitedByCash = true;
    crackProduced += made;
  };

  // The girls are still out - on their usual block, since nobody is choosing
  // one for them tonight. Which block that is stays hidden.
  const take = calculateStreetTake({
    ...context,
    player: context.player,
    thugDepartureMultiplierForTurn: (turn) => supplyEffectsForTurn(context.cook, turn).departureMultiplier,
    onTurnWorked: (state, turn) => {
      const cook = supplyEffectsForTurn(context.cook, turn);
      const thugHappiness = Math.min(ruleset.happiness.max ?? 100, state.thugHappiness + cook.morale);
      productCarry +=
        state.thugs *
        crack.perThugPerTurn *
        happinessMultiplier(thugHappiness, crack.minHappinessMultiplier) *
        cook.takeMultiplier *
        city.crackModifier *
        productionVariance;
      const whole = Math.floor(productCarry);
      if (whole > 0) {
        addProduct(whole);
        productCarry -= whole;
      }
    },
    rng,
    district: ruleset.scouting.produceDistrict,
    takeMultiplier: ruleset.production.unsupervisedTakeMultiplier,
  });
  const roundedRemainder = roundStochastic(productCarry, rng);
  if (roundedRemainder > 0) addProduct(roundedRemainder);

  return {
    ...take,
    turnsSpent: turns,
    crackProduced,
    ingredientCents: BigInt(crackProduced) * BigInt(crack.ingredientCentsPerRock),
    limitedByCash,
  };
}
