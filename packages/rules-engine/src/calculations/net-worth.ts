import { classicOgV01, type Ruleset } from '@streets/rulesets';
import type { NetWorthInput } from '../types.js';
import { productNetWorthCents } from './product-economy.js';

/**
 * Section 16. Integer cents only - money never touches a float.
 *
 * Everything the player owns counts, valued at what it would liquidate for.
 * See `economy.netWorth` for why, and for why every value sits below the
 * item's purchase price.
 */
export function calculateNetWorthCents(
  player: NetWorthInput,
  ruleset: Ruleset = classicOgV01,
): bigint {
  const v = ruleset.economy.netWorth;

  // Integer maths only: BigInt division truncates, so the weight has to be
  // applied as a ratio rather than a float multiply.
  const cash = (BigInt(player.cashCents) * BigInt(v.cashWeightPercent)) / 100n;

  return (
    cash +
    BigInt(player.whores) * BigInt(v.perWhoreCents) +
    BigInt(player.thugs) * BigInt(v.perThugCents) +
    BigInt(player.lowRiders) * BigInt(v.perLowRiderCents) +
    BigInt(player.medicine) * BigInt(v.perMedicineCents) +
    BigInt(player.crack) * BigInt(v.perCrackCents) +
    BigInt(player.condoms) * BigInt(v.perCondomCents) +
    BigInt(player.beer) * BigInt(v.perBeerCents) +
    BigInt(player.pistols) * BigInt(v.perPistolCents) +
    BigInt(player.shotguns) * BigInt(v.perShotgunCents) +
    BigInt(player.tek9s) * BigInt(v.perTek9Cents) +
    BigInt(player.ak47s) * BigInt(v.perAk47Cents) +
    // 0.4.0-D: every other product at its own value. Nothing on older rounds.
    productNetWorthCents(player.products, ruleset) +
    // 0.5.0-B: a run's cash, cars, escorts and cargo, revalued as it trades.
    BigInt(player.awayNetWorthCents ?? 0) +
    // 0.6.0-B: corner guns have left the home columns but are still owned.
    BigInt(player.postedNetWorthCents ?? 0) +
    // 0.6.0-D: an away outpost box is still the player's property.
    BigInt(player.outpostNetWorthCents ?? 0)
  );
}
