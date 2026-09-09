/**
 * When people give up and walk. Sections 27 and 30.
 *
 * Shared by every action, because the reason somebody leaves is how they have
 * been treated overall - not which particular thing you asked them to do last.
 */

import type { DepartureRules } from '../types.js';

export const departures = {
  /** Nobody leaves at or above this happiness. */
  happinessThreshold: 40,

  /**
   * Chance per turn worked that a given person gives up, at zero happiness.
   * Scaled down by how far above zero happiness actually sits.
   *
   * Per turn, not per action. Somebody walking out is a reaction to a shift
   * they were made to work, so a long trip on an unhappy crew has to cost
   * more than a short one - otherwise the cheapest way to play is one
   * enormous trip a day, and the risk of neglect disappears into batching.
   *
   * Compounding rather than linear: each turn is its own chance, so the loss
   * approaches the whole crew without ever exceeding it, and no arbitrary
   * ceiling is needed to keep the arithmetic sane.
   *
   * 0.008 is calibrated so a 13-turn trip - the manual's recommended spend -
   * loses what the old per-action rule lost, 9.9% against 10%. Nothing about
   * a normal trip changes; only longer ones now carry the risk they should.
   */
  chancePerTurn: 0.008,

  /**
   * Safety rail, not a balance knob: no single action may take more than
   * half the crew, however long or however miserable.
   */
  maxFractionPerAction: 0.5,
} as const satisfies DepartureRules;
