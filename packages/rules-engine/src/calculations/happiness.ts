import { classicOgV01, type Ruleset } from '@streets/rulesets';
import type { ThugHappinessInput, WhoreHappinessInput } from '../types.js';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function totalWeapons(player: ThugHappinessInput): number {
  return player.pistols + player.shotguns + player.tek9s + player.ak47s;
}

/**
 * Section 20. Frozen Classic formula - do not add terms to this.
 *
 *   thugHappiness = clamp(100 - missingBeer - missingWeapons, 0, 100)
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
      missingWeapons * h.thug.penaltyPerThugWithoutWeapon,
    h.min,
    h.max,
  );
}

/**
 * 0.4.0-C. Product on hand as whore happiness sees it: crack at face value, and
 * every other product at its happiness weight. Rounds without product effects
 * count crack alone, as they always have.
 */
export function happinessProductStock(player: WhoreHappinessInput, ruleset: Ruleset = classicOgV01): number {
  const catalog = ruleset.products as Record<string, { effects?: { hoes: { happinessWeight: number } } }> | undefined;
  const weight = (key: string) => catalog?.[key]?.effects?.hoes.happinessWeight;
  let stock = Math.max(0, player.crack) * (weight('CRACK') ?? 1);
  for (const [key, quantity] of Object.entries(player.products ?? {})) {
    if (key === 'CRACK') continue;
    stock += Math.max(0, quantity) * (weight(key) ?? 0);
  }
  return stock;
}

/**
 * Section 21. BALANCE_APPROXIMATION.
 *
 * Four levers, all of them pimp decisions and all of them things the player can
 * change on their next action:
 *   payout      - every point below the neutral cut stings
 *   condoms     - stock per whore, scaled by how short the shelf is
 *   product     - the same
 *   protection  - thugs available to cover the girls working
 *
 * Nothing here accumulates. The knobs live in the ruleset, and no service may
 * reimplement this.
 */
export function calculateWhoreHappiness(
  player: WhoreHappinessInput,
  ruleset: Ruleset = classicOgV01,
): number {
  const h = ruleset.happiness;
  const w = h.whore;

  if (player.whores <= 0) return h.max;

  const payoutPenalty =
    Math.max(0, w.neutralPayoutPercent - player.payoutPercent) *
    w.penaltyPerPayoutPercentBelowNeutral;

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

  const productPenalty = shortfallPenalty(happinessProductStock(player, ruleset), w.crackPerWhore, w.maxCrackPenalty);

  const protectedWhores = player.thugs * w.whoresPerThug;
  const unprotected = Math.max(0, player.whores - protectedWhores);
  const protectionPenalty = (unprotected / player.whores) * w.maxProtectionPenalty;

  return clamp(
    Math.round(
      h.max - payoutPenalty - condomPenalty - productPenalty - protectionPenalty,
    ),
    h.min,
    h.max,
  );
}

export interface HappinessTerm {
  /** Machine key, e.g. "condoms". */
  key: string;
  /** Player-facing name. */
  label: string;
  /** Points this is costing right now. */
  penalty: number;
  /** Worst this term can cost, so the UI can show it as a share. */
  max: number;
  /** A sentence naming what would fix it, when anything would. */
  fix: string | null;
}

export interface HappinessBreakdown {
  happiness: number;
  terms: HappinessTerm[];
  /** The single biggest drag, or null when nothing is wrong. */
  worst: HappinessTerm | null;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Why happiness is where it is.
 *
 * The formulas live above and are not repeated here - this walks the same
 * terms so a player can see which one is actually costing them, rather than
 * buying supplies that cannot possibly move the number.
 */
export function explainWhoreHappiness(
  player: WhoreHappinessInput,
  ruleset: Ruleset = classicOgV01,
): HappinessBreakdown {
  const w = ruleset.happiness.whore;
  const happiness = calculateWhoreHappiness(player, ruleset);

  const shortfall = (stock: number, perWhore: number, max: number): number => {
    const needed = player.whores * perWhore;
    if (needed <= 0) return 0;
    return (Math.max(0, needed - stock) / needed) * max;
  };

  const condomsWanted = player.whores * w.condomsPerWhore;
  const productWanted = player.whores * w.crackPerWhore;
  const productStock = happinessProductStock(player, ruleset);
  const weighted = Boolean(player.products && Object.keys(player.products).length && ruleset.products);
  const covered = player.thugs * w.whoresPerThug;

  const terms: HappinessTerm[] = player.whores <= 0
    ? []
    : [
        {
          key: 'condoms',
          label: 'Condoms',
          penalty: round1(shortfall(player.condoms, w.condomsPerWhore, w.maxCondomPenalty)),
          max: w.maxCondomPenalty,
          fix:
            player.condoms < condomsWanted
              ? `Stock ${Math.ceil(condomsWanted - player.condoms)} more.`
              : null,
        },
        {
          key: 'crack',
          label: 'Product',
          penalty: round1(shortfall(productStock, w.crackPerWhore, w.maxCrackPenalty)),
          max: w.maxCrackPenalty,
          fix:
            productStock < productWanted
              ? weighted
                ? `Stock about ${Math.ceil(productWanted - productStock)} more crack's worth. Some products calm them more than others.`
                : `Stock ${Math.ceil(productWanted - productStock)} more.`
              : null,
        },
        {
          key: 'protection',
          label: 'Protection',
          penalty: round1(
            (Math.max(0, player.whores - covered) / player.whores) * w.maxProtectionPenalty,
          ),
          max: w.maxProtectionPenalty,
          fix:
            covered < player.whores
              ? `One thug covers ${w.whoresPerThug}. You need ${Math.ceil((player.whores - covered) / w.whoresPerThug)} more.`
              : null,
        },
        {
          key: 'payout',
          label: 'Payout',
          penalty: round1(
            Math.max(0, w.neutralPayoutPercent - player.payoutPercent) *
              w.penaltyPerPayoutPercentBelowNeutral,
          ),
          max: w.neutralPayoutPercent - 1,
          fix:
            player.payoutPercent < w.neutralPayoutPercent
              ? `Raise their cut to ${w.neutralPayoutPercent}% to stop the grumbling.`
              : null,
        },
      ];

  const ranked = [...terms].sort((a, b) => b.penalty - a.penalty);

  return {
    happiness,
    terms,
    worst: ranked[0] && ranked[0].penalty > 0 ? ranked[0] : null,
  };
}

/** The same, for the frozen thug formula. Beer and guns, nothing else. */
export function explainThugHappiness(
  player: ThugHappinessInput,
  ruleset: Ruleset = classicOgV01,
): HappinessBreakdown {
  const h = ruleset.happiness;
  const happiness = calculateThugHappiness(player, ruleset);

  const missingBeer = Math.max(0, player.thugs - player.beer);
  const missingWeapons = Math.max(0, player.thugs - totalWeapons(player));

  const terms: HappinessTerm[] = player.thugs <= 0
    ? []
    : [
        {
          key: 'beer',
          label: 'Beer',
          penalty: round1(missingBeer * h.thug.penaltyPerThugWithoutBeer),
          max: player.thugs,
          fix: missingBeer > 0 ? `Buy ${missingBeer} more - one per thug.` : null,
        },
        {
          key: 'weapons',
          label: 'Guns',
          penalty: round1(missingWeapons * h.thug.penaltyPerThugWithoutWeapon),
          max: player.thugs,
          fix: missingWeapons > 0 ? `Arm ${missingWeapons} more - one per thug.` : null,
        },
      ];

  const ranked = [...terms].sort((a, b) => b.penalty - a.penalty);

  return {
    happiness,
    terms,
    worst: ranked[0] && ranked[0].penalty > 0 ? ranked[0] : null,
  };
}
