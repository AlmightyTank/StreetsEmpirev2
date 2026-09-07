import { classicOgV01, type Ruleset } from '@streets/rulesets';
import type { ThugHappinessInput, WhoreHappinessInput } from '../types.js';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function totalWeapons(player: ThugHappinessInput): number {
  return player.pistols + player.shotguns + player.tek9s + player.ak47s;
}

/**
 * Section 20, plus wear.
 *
 * The Classic formula is frozen and still the base: a point off for every thug
 * without a beer and every thug without a gun. Fatigue from working and
 * cooking comes off on top of it.
 */
export function calculateThugHappiness(
  player: ThugHappinessInput,
  ruleset: Ruleset = classicOgV01,
): number {
  const h = ruleset.happiness;

  const missingBeer = Math.max(0, player.thugs - player.beer);
  const missingWeapons = Math.max(0, player.thugs - totalWeapons(player));

  return clamp(
    h.max -
      missingBeer * h.thug.penaltyPerThugWithoutBeer -
      missingWeapons * h.thug.penaltyPerThugWithoutWeapon -
      Math.max(0, player.thugFatigue),
    h.min,
    h.max,
  );
}

/**
 * Section 21. BALANCE_APPROXIMATION.
 *
 * What you keep stocked and who is watching them, minus the wear they are
 * carrying:
 *   condoms     - stock per whore, scaled by how short the shelf is
 *   crack       - the same
 *   protection  - thugs available to cover the girls working
 *   fatigue     - driven by working for a cut that does not justify it
 *
 * The payout percentage is deliberately absent. A cut is only generous
 * relative to what the block actually pays, so it acts through fatigue when
 * they work rather than as a flat penalty for existing.
 */
export function calculateWhoreHappiness(
  player: WhoreHappinessInput,
  ruleset: Ruleset = classicOgV01,
): number {
  const h = ruleset.happiness;
  const w = h.whore;

  if (player.whores <= 0) return h.max;

  const shortfallPenalty = (stock: number, perWhore: number, max: number): number => {
    const needed = player.whores * perWhore;
    if (needed <= 0) return 0;
    return (Math.max(0, needed - stock) / needed) * max;
  };

  const condomPenalty = shortfallPenalty(
    player.condoms,
    w.condomsPerWhore,
    w.maxCondomPenalty,
  );

  const crackPenalty = shortfallPenalty(player.crack, w.crackPerWhore, w.maxCrackPenalty);

  const protectedWhores = player.thugs * w.whoresPerThug;
  const unprotected = Math.max(0, player.whores - protectedWhores);
  const protectionPenalty = (unprotected / player.whores) * w.maxProtectionPenalty;

  return clamp(
    Math.round(
      h.max -
        condomPenalty -
        crackPenalty -
        protectionPenalty -
        Math.max(0, player.whoreFatigue),
    ),
    h.min,
    h.max,
  );
}
