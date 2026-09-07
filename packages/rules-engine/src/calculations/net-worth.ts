import { classicOgV01, type Ruleset } from '@streets/rulesets';
import type { NetWorthInput } from '../types.js';

/**
 * Section 16. Integer cents only - money never touches a float.
 *
 * Beer and weapons contribute nothing, by design.
 */
export function calculateNetWorthCents(
  player: NetWorthInput,
  ruleset: Ruleset = classicOgV01,
): bigint {
  const v = ruleset.economy.netWorth;

  return (
    BigInt(player.cashCents) +
    BigInt(player.whores) * BigInt(v.perWhoreCents) +
    BigInt(player.thugs) * BigInt(v.perThugCents) +
    BigInt(player.lowRiders) * BigInt(v.perLowRiderCents) +
    BigInt(player.medicine) * BigInt(v.perMedicineCents) +
    BigInt(player.crack) * BigInt(v.perCrackCents) +
    BigInt(player.condoms) * BigInt(v.perCondomCents)
  );
}
