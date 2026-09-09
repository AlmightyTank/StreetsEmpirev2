/**
 * Money and net worth. Section 16.
 *
 * All money is integer cents. $1.00 = 100, $0.10 = 10. Never floats.
 */

import type { EconomyRules } from '../types.js';

export const economy = {
  currency: {
    centsPerDollar: 100,
    symbol: '$',
    code: 'USD',
  },

  /**
   * Net worth contribution per unit owned, in cents.
   *
   * Everything you own counts, and everything is valued at what you could
   * liquidate it for. Anything a shop buys back is worth exactly its sell
   * price - so selling never changes your net worth, it only changes what
   * form your net worth is in. Consumables nobody buys back are worth a
   * nominal fraction of what they cost, because a used condom has no resale
   * market and a warehouse of them should not read as wealth.
   *
   * The liquidation rule is half the anti-exploit; `cashWeightPercent` is the
   * other half. No item may be worth more than 75% of its price, or buying it
   * would turn cash into net worth out of nothing - which matters most for
   * the pistol, the one thing on sale in unlimited quantity.
   *
   * A thug sits exactly on that line on purpose: $1,000 of cash is $750 of
   * net worth, and a thug is worth $750, so hiring converts cash into crew at
   * par rather than charging you for it.
   */
  netWorth: {
    /**
     * BALANCE_APPROXIMATION. Section 16 counts cash at face value.
     *
     * A dollar in your pocket is worth 75 cents of net worth. Cash is the one
     * asset with no ceiling - crew growth flattens at the recruitment soft
     * caps while income compounds - so counting it at par means a long enough
     * round is won by whoever sat on the most money, and the crew, districts
     * and supplies stop mattering to rank.
     *
     * Discounting it does two things. Hoarding is no longer free, and the gap
     * between what an item costs and what it is worth closes: at 75%, buying
     * a thug is par rather than a penalty.
     *
     * It must stay an integer percent - the formula divides BigInt cents by
     * 100, so a fractional weight would silently truncate.
     *
     * The weight is also a ceiling on every store spread. Buying an item
     * changes net worth by `sell - 0.75 x buy`, so anything a shop buys back
     * for more than 75% of its price would print net worth out of cash. That
     * is why Tommy's guns sell back at 70%.
     */
    cashWeightPercent: 75,

    perWhoreCents: 200_000, //   $2,000
    perThugCents: 75_000, //     $750
    perLowRiderCents: 300_000, //$3,000  = sells for $3,000
    perMedicineCents: 500, //    $5
    perCrackCents: 300, //       $3      = sells for $3
    perCondomCents: 10, //       $0.10

    // BALANCE_APPROXIMATION. Section 16 has these contributing nothing in
    // Classic, which made an armed crew read as poorer than an unarmed one:
    // buying a $3,500 AK-47 wiped $3,500 off your score the moment it landed.
    // Arming your thugs is required by the happiness formula, so the game was
    // charging you for something it also demanded.
    perBeerCents: 20, //         $0.20
    perPistolCents: 3_500, //    $35     = sells for $35
    perShotgunCents: 31_500, //  $315    = sells for $315
    perTek9Cents: 87_500, //     $875    = sells for $875
    perAk47Cents: 245_000, //    $2,450  = sells for $2,450
  },

  /** Whore payout split. Section 31. */
  payout: {
    min: 1,
    max: 99,
    default: 50,
  },

  /** Nothing is excluded any more; everything you own counts for something. */
  netWorthExcluded: [],
} as const satisfies EconomyRules;
