import {
  calculateThugHappiness,
  calculateWhoreHappiness,
  type Ruleset,
  type ThugHappinessInput,
  type WhoreHappinessInput,
} from '@streets/rules-engine';

/**
 * Everything happiness reads: the shelves, the muscle and the wear. Fatigue is
 * stored on the player, so this is no longer a pure reading of inventory.
 */
export type HappinessInput = ThugHappinessInput & WhoreHappinessInput;

export interface Happiness {
  whoreHappiness: number;
  thugHappiness: number;
}

/**
 * Section 19. The only place in the server allowed to produce happiness.
 * Routes and other services call recalculate() after touching resources -
 * they never reimplement the formulas.
 */
export const HappinessService = {
  recalculate(player: HappinessInput, ruleset: Ruleset): Happiness {
    return {
      whoreHappiness: calculateWhoreHappiness(player, ruleset),
      thugHappiness: calculateThugHappiness(player, ruleset),
    };
  },
};
