import type { ProductEffects, Ruleset } from '@streets/rulesets';

/**
 * 0.4.0-B. Work supply: which products a job burns, in what order, and what
 * running short part-way through costs.
 *
 * A job is a district worked on a Scout trip, PRODUCE for the shift the girls
 * work while the thugs cook, or (0.4.0-C) COOK for the thugs doing the cooking.
 * The player sets a policy per job; the trip is then split into slices by
 * product, so a trip that runs out part-way is charged and paid for each slice
 * rather than all-or-nothing.
 */

export const PRODUCE_JOB = 'PRODUCE';
/** 0.4.0-C. The production thugs' own supply. */
export const COOK_JOB = 'COOK';
/** 0.4.0-E. The squad a player sends: raids, drive-bys and special raids. */
export const RAID_JOB = 'RAID';
/** 0.4.0-E. The crew holding the player's block when someone hits it. */
export const DEFENSE_JOB = 'DEFENSE';
/** 0.5.0-E. A run's escorts when it is hit on the road, burned from its own trunk. */
export const CONVOY_JOB = 'CONVOY';
/** 0.6.0-B. Thugs posted on a held corner. */
export const CORNER_JOB = 'CORNER';

/** Who burns the product: the girls working, the thugs cooking, or (0.4.0-E) thugs in a fight. */
export type WorkSupplyRole = 'hoes' | 'thugs' | 'fighters';

export interface WorkSupplyPolicy {
  primary: string;
  fallback: string | null;
  emergency: string | null;
  /** Only the primary is ever burned; fallback and emergency are ignored. */
  strict: boolean;
}

export type WorkSupplyState = 'supplied' | 'substituted' | 'dry';

export interface WorkSupplySlice {
  /** Null for the dry slice. */
  product: string | null;
  state: WorkSupplyState;
  /** Product units this slice burns. The dry slice is the units that were missing. */
  units: number;
  /** Share of the trip this slice covers, 0..1. Slices sum to 1. */
  share: number;
  /** The same share in turns, for display. Not rounded. */
  turns: number;
  /** What this slice does to the take, or to production output for thugs. */
  takeMultiplier: number;
  /** 0.4.0-C. Whore recruitment on a Scout trip. */
  recruitmentMultiplier: number;
  /** 0.4.0-C. Departure chance for the role. */
  departureMultiplier: number;
  /** 0.4.0-C. Thug happiness points while cooking. */
  morale: number;
  /** 0.4.0-C. Heat this slice adds. Not rounded. */
  heat: number;
  /** 0.4.0-E. Share of a fighting squad wounded. 1 for every other role. */
  woundMultiplier: number;
}

export interface WorkSupplyPlan {
  job: string;
  role: WorkSupplyRole;
  policy: WorkSupplyPolicy;
  /** Product units the whole trip wants. */
  need: number;
  /** Units the trip would use per turn, for "turns of supply left". */
  perTurn: number;
  slices: WorkSupplySlice[];
  /** Units taken from each product. */
  consumed: Record<string, number>;
  /** Share-weighted take multiplier for the whole trip (production output for thugs). */
  takeMultiplier: number;
  /** 0.4.0-C. Share-weighted, like the take. */
  recruitmentMultiplier: number;
  departureMultiplier: number;
  morale: number;
  /** 0.4.0-E. Share-weighted, for fighters. */
  woundMultiplier: number;
  /** 0.4.0-C. Heat the whole trip adds. Not rounded; `tripHeat` rounds. */
  heat: number;
  /** Turn at which supply first switches away from the primary, or null if it never does. */
  switchesAtTurn: number | null;
}

/** The policy a job uses before the player has set one: crack, nothing else, as every older round works. */
export function defaultWorkSupplyPolicy(): WorkSupplyPolicy {
  return { primary: 'CRACK', fallback: null, emergency: null, strict: false };
}

/** Products the policy may burn, in order, without repeats. */
export function workSupplyOrder(policy: WorkSupplyPolicy): string[] {
  const order = policy.strict ? [policy.primary] : [policy.primary, policy.fallback, policy.emergency];
  return order.filter((key, index): key is string => Boolean(key) && order.indexOf(key) === index);
}

type SliceEffects = Pick<WorkSupplySlice, 'takeMultiplier' | 'recruitmentMultiplier' | 'departureMultiplier' | 'morale' | 'woundMultiplier'> & { heatPerTurn: number };

const NEUTRAL: SliceEffects = { takeMultiplier: 1, recruitmentMultiplier: 1, departureMultiplier: 1, morale: 0, woundMultiplier: 1, heatPerTurn: 0 };

function effectsOf(ruleset: Ruleset, key: string): ProductEffects | undefined {
  return (ruleset.products?.[key] as { effects?: ProductEffects } | undefined)?.effects;
}

/** What one product does for a role on a job, or crack-era defaults where the ruleset gives it nothing. */
export function productSliceEffects(ruleset: Ruleset, key: string, role: WorkSupplyRole, job: string): SliceEffects {
  const effects = effectsOf(ruleset, key);
  if (!effects) {
    const take = role === 'hoes' ? ruleset.products?.[key]?.work?.takeMultiplier ?? 1 : 1;
    return { ...NEUTRAL, takeMultiplier: take };
  }
  if (role === 'fighters') {
    // A fight's strength is the product's attack for a squad sent out, its defense at home and on the road.
    const combat = effects.combat;
    if (!combat) return { ...NEUTRAL, heatPerTurn: effects.thugs.heatPerTurn };
    const defending = job === DEFENSE_JOB || job === CONVOY_JOB;
    return { ...NEUTRAL, takeMultiplier: defending ? combat.defense : combat.attack, woundMultiplier: combat.wounds, heatPerTurn: effects.thugs.heatPerTurn };
  }
  if (role === 'thugs') {
    const thugs = effects.thugs;
    return { ...NEUTRAL, takeMultiplier: thugs.output, departureMultiplier: thugs.departures, morale: thugs.morale, heatPerTurn: thugs.heatPerTurn };
  }
  const hoes = effects.hoes;
  return {
    ...NEUTRAL,
    takeMultiplier: hoes.take * (hoes.jobTake?.[job] ?? 1),
    recruitmentMultiplier: hoes.recruitment,
    departureMultiplier: hoes.departures,
    heatPerTurn: hoes.heatPerTurn,
  };
}

/** Heat grows with the square root of crew size, so a big crew runs hotter without being locked out. */
export function heatCrewFactor(ruleset: Ruleset, role: WorkSupplyRole, workers: number): number {
  const scale = role === 'hoes' ? ruleset.heat?.crewScale.whores : ruleset.heat?.crewScale.thugs;
  if (!scale || workers <= 0) return 0;
  return Math.sqrt(workers / scale);
}

/**
 * Split a trip across the products its policy allows.
 *
 * `need` is computed the way crack always has been, floor(workers x rate x turns),
 * so a crack-only policy burns exactly what older rounds burn. Rounds with
 * `roundNeedUp` round up instead, so a small crew on a short trip cannot take a
 * product's effects without burning any. Each product then covers as much of
 * the need as its stock allows; whatever is left is dry. A slice's share is its
 * units over the need, so one unit of a great product never supplies a hundred
 * workers.
 */
export function planWorkSupply(input: {
  job: string;
  /** Defaults to hoes. */
  role?: WorkSupplyRole;
  /** Whores for hoes, fit thugs for thugs, the committed squad for fighters. */
  workers: number;
  /** Fighters: 1, a single fight. */
  turns: number;
  policy: WorkSupplyPolicy;
  inventory: Record<string, number>;
  ruleset: Ruleset;
}): WorkSupplyPlan {
  const { job, workers, turns, policy, inventory, ruleset } = input;
  const role = input.role ?? 'hoes';
  const supplyRules = ruleset.workSupply;
  const rate = role === 'fighters'
    ? ruleset.combatSupply?.productPerThugPerFight ?? 0
    : role === 'thugs'
      ? supplyRules?.productPerThugPerTurn ?? 0
      : supplyRules?.productPerWhorePerTurn ?? ruleset.scouting.consumption.crackPerWhorePerTurn;
  const crew = heatCrewFactor(ruleset, role, workers);
  // Thugs cooking or fighting without product work as they always have; girls working dry earn less.
  const dry: SliceEffects = role === 'hoes'
    ? { ...NEUTRAL, takeMultiplier: supplyRules?.dryTakeMultiplier ?? 1, departureMultiplier: supplyRules?.dryDepartureMultiplier ?? 1 }
    : NEUTRAL;

  const perTurn = Math.max(0, workers) * rate;
  const raw = perTurn * Math.max(0, turns);
  const need = supplyRules?.roundNeedUp || role === 'fighters' ? Math.ceil(raw - 1e-9) : Math.floor(raw);
  const order = workSupplyOrder(policy);

  const slices: WorkSupplySlice[] = [];
  const consumed: Record<string, number> = {};
  const slice = (product: string | null, state: WorkSupplyState, units: number, share: number, effects: SliceEffects): WorkSupplySlice => {
    const { heatPerTurn, ...rest } = effects;
    return { product, state, units, share, turns: share * turns, ...rest, heat: share * turns * heatPerTurn * crew };
  };
  let remaining = need;

  if (need === 0) {
    // Nobody to supply: the trip counts as fully supplied by the primary, and burns nothing.
    slices.push(slice(policy.primary, 'supplied', 0, 1, productSliceEffects(ruleset, policy.primary, role, job)));
  } else {
    order.forEach((product, index) => {
      if (remaining <= 0) return;
      const units = Math.min(Math.max(0, inventory[product] ?? 0), remaining);
      if (units <= 0) return;
      remaining -= units;
      consumed[product] = units;
      slices.push(slice(product, index === 0 ? 'supplied' : 'substituted', units, units / need, productSliceEffects(ruleset, product, role, job)));
    });
    if (remaining > 0) {
      // Everything before the dry slice ran out on this trip. The worst crash among them lands on the dry part.
      const crash = Math.max(1, ...slices.map((ranOut) => effectsOf(ruleset, ranOut.product!)?.hoes.crashDepartures ?? 1));
      const effects = role === 'hoes' ? { ...dry, departureMultiplier: dry.departureMultiplier * crash } : dry;
      slices.push(slice(null, 'dry', remaining, remaining / need, effects));
    }
  }

  const weighted = (pick: (row: WorkSupplySlice) => number) => slices.reduce((sum, row) => sum + row.share * pick(row), 0);
  const primary = slices[0];
  const switchesAtTurn = primary && primary.product === policy.primary && primary.share < 1 ? primary.turns : primary?.product === policy.primary ? null : 0;

  return {
    job,
    role,
    policy,
    need,
    perTurn,
    slices,
    consumed,
    takeMultiplier: weighted((row) => row.takeMultiplier),
    recruitmentMultiplier: weighted((row) => row.recruitmentMultiplier),
    departureMultiplier: weighted((row) => row.departureMultiplier),
    morale: weighted((row) => row.morale),
    woundMultiplier: weighted((row) => row.woundMultiplier),
    heat: slices.reduce((sum, row) => sum + row.heat, 0),
    switchesAtTurn,
  };
}

/** 0.4.0-E. What a supply screen warns about, beyond the plan itself. */
export interface WorkSupplyStatus {
  /** Turns the policy's allowed stock would last at this crew size, or null when nothing is burned. */
  turnsOfSupply: number | null;
  /** Workers the trip leaves without product, rounded up. */
  shortWorkers: number;
}

export function workSupplyStatus(plan: WorkSupplyPlan, inventory: Record<string, number>, workers: number): WorkSupplyStatus {
  const allowed = workSupplyOrder(plan.policy).reduce((sum, key) => sum + Math.max(0, inventory[key] ?? 0), 0);
  const dry = plan.slices.find((slice) => slice.state === 'dry');
  return {
    turnsOfSupply: plan.perTurn > 0 ? allowed / plan.perTurn : null,
    shortWorkers: dry ? Math.ceil(dry.share * workers - 1e-9) : 0,
  };
}
