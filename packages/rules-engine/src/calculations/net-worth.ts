import { classicOgV01, type Ruleset } from '@streets/rulesets';
import type { NetWorthInput } from '../types.js';
import { productNetWorthCents } from './product-economy.js';
import { weightedDebtCents } from './loans.js';

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
  const casinoCash = (BigInt(player.casinoNetWorthCents ?? 0) * BigInt(v.cashWeightPercent)) / 100n;

  const assets = (
    cash +
    BigInt(player.whores) * BigInt(v.perWhoreCents) +
    BigInt(player.thugs) * BigInt(v.perThugCents) +
    BigInt(player.lowRiders) * BigInt(v.perLowRiderCents) +
    BigInt(player.sedans ?? 0) * BigInt(v.perLowRiderCents) +
    BigInt(player.vans ?? 0) * BigInt(v.perLowRiderCents) +
    // 1.5.0-C: a car waiting on the garage is still owned, at the same value.
    BigInt(vehiclesInService(player)) * BigInt(v.perLowRiderCents) +
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
    BigInt(player.outpostNetWorthCents ?? 0) +
    // 1.2.0-A: casino chips/bankroll are cash-equivalents, so cage transfers cannot mint ranking value.
    casinoCash
  );
  // 1.6.5-A: what is owed comes back off, so borrowing never buys rank. Never below zero.
  const debt = weightedDebtCents(player.loanDebtCents ?? 0, v.cashWeightPercent);
  if (debt === 0n) return assets;
  return assets > debt ? assets - debt : 0n;
}

/** 1.5.0-C. Every vehicle at home that the garage still has to repair or recover. */
export function vehiclesInService(player: Pick<NetWorthInput, 'damagedLowRiders' | 'damagedSedans' | 'damagedVans' | 'disabledLowRiders' | 'disabledSedans' | 'disabledVans'>): number {
  return (player.damagedLowRiders ?? 0) + (player.damagedSedans ?? 0) + (player.damagedVans ?? 0)
    + (player.disabledLowRiders ?? 0) + (player.disabledSedans ?? 0) + (player.disabledVans ?? 0);
}
