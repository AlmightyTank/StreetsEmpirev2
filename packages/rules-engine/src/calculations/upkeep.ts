import type { Ruleset } from '@streets/rulesets';
import { roundStochastic, type Rng } from '../rng.js';

/**
 * What a night out costs and who gives up because of it.
 *
 * Both actions send the girls out - manual 3.1 and 3.2 - so both burn the same
 * shelf. Cooking simply earns less for it.
 */

export interface UpkeepInput {
  whores: number;
  thugs: number;
  condoms: number;
  crack: number;
  beer: number;
  medicine: number;
  whoreHappiness: number;
  thugHappiness: number;
}

export interface Consumption {
  condoms: number;
  crack: number;
  beer: number;
}

export interface Departures {
  whores: number;
  thugs: number;
}

/**
 * Supplies burned over `turns` of working. Capped at what is actually on the
 * shelf - running dry is not an error, it wrecks happiness instead.
 */
export function calculateWorkSupplyNeeds(
  player: Pick<UpkeepInput, 'whores' | 'thugs'>,
  turns: number,
  ruleset: Ruleset,
): Consumption {
  const c = ruleset.scouting.consumption;
  return {
    condoms: Math.ceil(player.whores * c.condomsPerWhorePerTurn * turns),
    crack: Math.floor(player.whores * c.crackPerWhorePerTurn * turns),
    beer: Math.ceil(player.thugs * c.beerPerThugPerTurn * turns),
  };
}

export function calculateWorkConsumption(
  player: UpkeepInput,
  turns: number,
  ruleset: Ruleset,
): Consumption {
  const needed = calculateWorkSupplyNeeds(player, turns, ruleset);

  return {
    condoms: Math.min(
      needed.condoms,
      player.condoms,
    ),
    crack: Math.min(
      needed.crack,
      player.crack,
    ),
    beer: Math.min(
      needed.beer,
      player.beer,
    ),
  };
}

/**
 * How many walk. Nobody leaves at or above the threshold; at zero happiness
 * the full per-action fraction goes.
 */
export function calculateDepartures(
  player: UpkeepInput,
  turns: number,
  ruleset: Ruleset,
  rng: Rng,
): Departures {
  const d = ruleset.departures;
  const worked = Math.max(0, turns);

  const leaving = (count: number, happiness: number): number => {
    if (count <= 0 || worked <= 0 || happiness >= d.happinessThreshold) return 0;

    const severity = (d.happinessThreshold - happiness) / d.happinessThreshold;
    // Each turn is its own chance, so the fraction compounds toward - but
    // never past - the whole crew.
    const perTurn = d.chancePerTurn * severity;
    const fraction = Math.min(1 - (1 - perTurn) ** worked, d.maxFractionPerAction);

    return Math.min(count, roundStochastic(count * fraction, rng));
  };

  return {
    whores: leaving(player.whores, player.whoreHappiness),
    thugs: leaving(player.thugs, player.thugHappiness),
  };
}

export interface Infections {
  /** Whores who caught something on this shift. */
  infected: number;
  /** Of those, how many the medicine on hand covered. */
  treated: number;
  /** Medicine spent treating them. */
  medicineUsed: number;
  /** Untreated, and therefore no longer working for you. */
  lost: number;
}

const NO_INFECTIONS: Infections = { infected: 0, treated: 0, medicineUsed: 0, lost: 0 };

/**
 * Who caught something working unprotected.
 *
 * Risk scales with how short the condom shelf was: fully stocked is never at
 * risk, an empty shelf runs the full per-turn chance. Medicine treats what it
 * can and the rest stop working for you, which is what makes an empty shelf
 * expensive rather than merely unpleasant.
 */
export function calculateInfections(
  player: Pick<UpkeepInput, 'whores' | 'medicine'>,
  turns: number,
  condomShortfallRatio: number,
  ruleset: Ruleset,
  rng: Rng,
): Infections {
  const rules = ruleset.health;

  const exposure = Math.min(1, Math.max(0, condomShortfallRatio));
  if (player.whores <= 0 || turns <= 0 || exposure <= 0) return NO_INFECTIONS;

  const chance = rules.infectionChancePerTurnUnprotected * exposure;

  let infected = 0;
  for (let turn = 0; turn < turns; turn++) {
    if (rng() < chance) infected++;
  }

  infected = Math.min(
    infected,
    player.whores,
    Math.max(1, Math.floor(player.whores * rules.maxInfectedFractionPerAction)),
  );

  if (infected <= 0) return NO_INFECTIONS;

  const treatable =
    rules.medicinePerTreatment > 0
      ? Math.floor(player.medicine / rules.medicinePerTreatment)
      : infected;

  const treated = Math.min(infected, Math.max(0, treatable));

  return {
    infected,
    treated,
    medicineUsed: treated * rules.medicinePerTreatment,
    lost: infected - treated,
  };
}
