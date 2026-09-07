/**
 * Rankings. Sections 17, 18, 38.
 */

import type { RankingRules } from '../types.js';

export const rankings = {
  /** Rows shown on each leaderboard tab. */
  topCount: 100,

  /**
   * When the player sits outside the top list, also show this many rows either
   * side of them. Radius 4 around #42 gives #38 through #46.
   */
  neighborhoodRadius: 4,

  /** Hour (UTC) at which dailyStarting*Rank is snapshotted for rank movement. */
  dailyResetHourUtc: 0,
} as const satisfies RankingRules;
