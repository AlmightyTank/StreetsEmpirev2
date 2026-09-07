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
  /** Fraction that can walk in one action, reached at zero happiness. */
  maxFractionPerAction: 0.1,
} as const satisfies DepartureRules;
