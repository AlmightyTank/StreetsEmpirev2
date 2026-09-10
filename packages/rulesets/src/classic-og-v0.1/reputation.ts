/**
 * Reputation. BALANCE_APPROXIMATION - the whole system.
 *
 * Standing with each of the four traders, earned by doing them favours and by
 * being a regular. It replaces the old unlock ladder, which gated the AK-47 on
 * 150 `streetWorkTurns` - a counter named after an action that no longer
 * exists, kept alive only so the unlock stayed reachable.
 *
 * Two faucets, and the split between them is the design:
 *
 *   quests   50 each, one per trader   the spine
 *   regular   2 a day per trader        the habit, capped at 50
 *
 * Trading alone tops out at 200 against a 248 gate for the AK-47, so the
 * favours are not optional. That is deliberate: a system where you can idle
 * your way to the top gun is a timer, not a relationship.
 *
 * Nothing here is priced in cash. Shops buy back at 70%, so paying rep for
 * money spent would cost the 30% spread and no more - roughly 30 cents on the
 * dollar, bounded only by the shelves - and it would quietly make standing a
 * derivative of the one resource the rest of this ruleset works to contain.
 * The once-a-day credit is the fix: a fortune cannot compress a week of visits
 * into an hour.
 */

import type { ReputationRules } from '../types.js';

export const reputation = {
  perTraderMax: 100,

  /**
   * Standing with one trader, and what it is worth.
   *
   * The perk is speed, never shelf size. A cap is the anti-hoarding brake - it
   * is what stops someone who ignored a shop for a week clearing a round's
   * supply in one visit - so raising it for regulars would dissolve exactly
   * the property the shelves exist to defend. An interval is only pacing, so
   * serving a familiar face sooner is the same fiction with none of the risk.
   */
  tiers: [
    { at: 0, name: 'Stranger', restockSpeedup: 0 },
    { at: 25, name: 'Known', restockSpeedup: 0.1 },
    { at: 50, name: 'Regular', restockSpeedup: 0.2 },
    { at: 75, name: 'Family', restockSpeedup: 0.3 },
  ],

  trade: {
    /** Credited once per trader per day, however much you buy. */
    pointsPerDay: 2,
    /** 50 x 4 traders = 200, which is below every gate that matters. */
    maxPoints: 50,
  },

  questPoints: 50,
} as const satisfies ReputationRules;
