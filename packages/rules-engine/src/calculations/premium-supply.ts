import type { Rng } from '../rng.js';

/**
 * Workshop goods that stretch a supply: premium condoms and House Brew.
 *
 * One of either covers three uses where a plain one covers one. The catch is a
 * small chance, per shift or trip, that the premium stock burned on it was a
 * bad batch. A bad condom batch leaves the uses it covered unprotected, and a
 * bad brew sends part of the crew home sick. Both stay inside the per-action
 * infection and departure limits the ruleset already sets.
 */

/** Uses one premium condom or one House Brew covers. */
export const PREMIUM_USES = 3;
/** Chance per shift or trip that premium stock used on it was a bad batch. */
export const BAD_BATCH_CHANCE = 0.05;
/** Share of the thugs a bad House Brew sends home, before the per-action departure limit. */
export const BAD_BREW_CREW_FRACTION = 0.15;

export interface StockDraw {
  /** Plain units burned. */
  regular: number;
  /** Premium units burned. */
  premium: number;
  /** Uses covered by both. Less than `need` when stock ran short. */
  covered: number;
  /** The part of `covered` that premium stock supplied. */
  premiumUses: number;
}

/**
 * Covers `need` uses from plain and premium stock. Premium goes first, a full
 * set of three uses at a time, then plain stock, then one more premium unit
 * for any uses still left. Plain-only stock behaves exactly as it always has.
 */
export function drawStock(need: number, regular: number, premium: number, premiumFirst = true): StockDraw {
  const want = Math.max(0, Math.floor(need));
  const plain = Math.max(0, Math.floor(regular));
  const extra = Math.max(0, Math.floor(premium));
  if (!premiumFirst) {
    const regularUsed = Math.min(plain, want);
    const left = want - regularUsed;
    const premiumUsed = left > 0 ? Math.min(extra, Math.ceil(left / PREMIUM_USES)) : 0;
    const premiumUses = Math.min(left, premiumUsed * PREMIUM_USES);
    return { regular: regularUsed, premium: premiumUsed, covered: regularUsed + premiumUses, premiumUses };
  }
  const sets = Math.min(extra, Math.floor(want / PREMIUM_USES));
  let left = want - sets * PREMIUM_USES;
  let premiumUsed = sets;
  let premiumUses = sets * PREMIUM_USES;
  const regularUsed = Math.min(plain, left);
  left -= regularUsed;
  if (left > 0 && extra > premiumUsed) {
    const topUp = Math.min(left, PREMIUM_USES);
    premiumUsed += 1;
    premiumUses += topUp;
    left -= topUp;
  }
  return { regular: regularUsed, premium: premiumUsed, covered: want - left, premiumUses };
}

/** Whether premium stock used on this action was a bad batch. Draws nothing from the rng when none is held. */
export function rollBadBatch(premiumHeld: number, rng: Rng): boolean {
  return premiumHeld > 0 && rng() < BAD_BATCH_CHANCE;
}
