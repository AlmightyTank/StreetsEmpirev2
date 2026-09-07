import type { Ruleset } from '@streets/rulesets';
import { roundStochastic, type Rng } from '../rng.js';

/**
 * What a night out costs and who gives up because of it.
 *
 * Only Work the Streets burns the full shelf - that is the action where the
 * crew is actually working. Cooking drinks beer and nothing else, and scouting
 * costs nothing but turns.
 */

export interface UpkeepInput {
  whores: number;
  thugs: number;
  condoms: number;
  crack: number;
  beer: number;
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
export function calculateWorkConsumption(
  player: UpkeepInput,
  turns: number,
  ruleset: Ruleset,
): Consumption {
  const c = ruleset.work.consumption;

  return {
    condoms: Math.min(
      Math.floor(player.whores * c.condomsPerWhorePerTurn * turns),
      player.condoms,
    ),
    crack: Math.min(
      Math.floor(player.whores * c.crackPerWhorePerTurn * turns),
      player.crack,
    ),
    beer: Math.min(
      Math.floor(player.thugs * c.beerPerThugPerTurn * turns),
      player.beer,
    ),
  };
}

/** Thugs on a cooking shift still drink. Nothing else is touched. */
export function calculateCookConsumption(
  player: UpkeepInput,
  turns: number,
  ruleset: Ruleset,
): Consumption {
  return {
    condoms: 0,
    crack: 0,
    beer: Math.min(
      Math.floor(player.thugs * ruleset.production.consumption.beerPerThugPerTurn * turns),
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
  ruleset: Ruleset,
  rng: Rng,
): Departures {
  const d = ruleset.departures;

  const leaving = (count: number, happiness: number): number => {
    if (count <= 0 || happiness >= d.happinessThreshold) return 0;

    const severity = (d.happinessThreshold - happiness) / d.happinessThreshold;
    return Math.min(count, roundStochastic(count * d.maxFractionPerAction * severity, rng));
  };

  return {
    whores: leaving(player.whores, player.whoreHappiness),
    thugs: leaving(player.thugs, player.thugHappiness),
  };
}
