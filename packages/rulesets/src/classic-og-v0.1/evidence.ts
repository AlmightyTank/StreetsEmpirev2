/**
 * Evidence / heat.
 *
 * Not player-facing in 0.1.0. It lives here so the knobs have a home before
 * the systems that read them (busts, cop attention, PvP fallout) arrive.
 */

import type { EvidenceRules } from '../types.js';

export const evidence = {
  enabled: false,

  /** Evidence added per action once the system is switched on. */
  perScout: 0,
  perProduce: 0,
  perStoreTransaction: 0,

  /** Decay per turn interval. */
  decayPerInterval: 0,

  /** Evidence at which the player is at risk. */
  bustThreshold: 100,
} as const satisfies EvidenceRules;
