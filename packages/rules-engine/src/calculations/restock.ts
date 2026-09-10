/**
 * Sections 34-36. What a shop can actually get hold of.
 *
 * Price stops being a limit once a player is rich, so the things that should
 * stay rare are limited by supply instead: a shelf that holds a few and
 * refills on a timer, with a longer timer the harder the thing is to source.
 *
 * The shape is deliberately identical to turn regeneration - only whole
 * intervals are settled and the clock advances by exactly those intervals, so
 * reading a store fifty times never throws away a part-served wait.
 *
 * Unlike turns there is no away bonus and no catch-up: the clock stops
 * advancing once the shelf is full, so a week away is still one full shelf,
 * not a week of stock. That is the entire point of the cap.
 */

import type { RestockRule, Ruleset, StockField, StoreItem } from '@streets/rulesets';

/** Anything carrying the shelf columns - a RoundPlayer row or player state. */
export type StockState = Record<string, unknown>;

export interface RestockSettlement {
  /** How many are waiting on the shelf right now. */
  stock: number;
  /** Advanced by whole intervals only; never to `now`. */
  stockAt: Date;
  /** Restocked since the last look. */
  gained: number;
  cap: number;
  intervalMinutes: number;
  /** How many land per delivery. */
  perInterval: number;
  /** Null when the shelf is full and the clock is therefore parked. */
  nextAt: Date | null;
  /** True when either column needs writing back. */
  changed: boolean;
}

/** Deliveries are one at a time unless the rule says otherwise. */
export function perInterval(rule: RestockRule): number {
  return rule.perInterval ?? 1;
}

function readStock(state: StockState, rule: RestockRule): { stock: number; stockAt: Date } {
  const stock = state[rule.stockField];
  const stockAt = state[rule.stockAtField];
  return {
    stock: typeof stock === 'number' ? stock : 0,
    stockAt: stockAt instanceof Date ? stockAt : new Date(0),
  };
}

/**
 * Brings one shelf up to date.
 *
 * A full shelf parks its clock at `now`, so the next wait is measured from
 * when the shelf filled - not from some point days earlier that would hand
 * out a second one the instant one is bought.
 */
export function settleStock(
  state: StockState,
  rule: RestockRule,
  now: Date = new Date(),
  /**
   * Minutes between deliveries for this player. Defaults to the rule's own,
   * and is shortened by standing with the shop - never the cap, which is the
   * anti-hoarding brake.
   */
  intervalMinutes: number = rule.intervalMinutes,
): RestockSettlement {
  const current = readStock(state, rule);
  const intervalMs = intervalMinutes * 60 * 1000;

  const held = Math.max(0, Math.min(rule.cap, current.stock));

  let stock = held;
  let stockAt = current.stockAt;

  if (held >= rule.cap) {
    // Full. Park the clock so the wait starts fresh after the next purchase.
    stockAt = now;
  } else {
    const elapsedMs = now.getTime() - current.stockAt.getTime();
    const intervals = elapsedMs > 0 ? Math.floor(elapsedMs / intervalMs) : 0;
    if (intervals > 0) {
      const gained = Math.min(intervals * perInterval(rule), rule.cap - held);
      stock = held + gained;
      stockAt =
        stock >= rule.cap ? now : new Date(current.stockAt.getTime() + intervals * intervalMs);
    }
  }

  return {
    stock,
    stockAt,
    gained: stock - held,
    cap: rule.cap,
    intervalMinutes,
    perInterval: perInterval(rule),
    nextAt: stock >= rule.cap ? null : new Date(stockAt.getTime() + intervalMs),
    changed: stock !== current.stock || stockAt.getTime() !== current.stockAt.getTime(),
  };
}

/**
 * Every restocked item a ruleset sells, keyed by the column it lives in.
 *
 * Driven off the stores rather than off the weapons: a shelf is a property of
 * something being sold, and Charlie's cars are not weapons.
 */
export function restockedItems(ruleset: Ruleset): Map<StockField, { item: StoreItem; rule: RestockRule }> {
  const found = new Map<StockField, { item: StoreItem; rule: RestockRule }>();
  for (const store of Object.values(ruleset.stores)) {
    for (const item of Object.values(store.items)) {
      if (item.restock) found.set(item.restock.stockField, { item, rule: item.restock });
    }
  }
  return found;
}

/** Every restocked item at its cap. */
export function fullShelves(ruleset: Ruleset): Partial<Record<StockField, number>> {
  const shelf: Partial<Record<StockField, number>> = {};
  for (const [field, { rule }] of restockedItems(ruleset)) shelf[field] = rule.cap;
  return shelf;
}

/**
 * A fresh player walks in to full shelves.
 *
 * Starting empty would mean a new account waits four hours for its first
 * shotgun for no reason anyone could explain, and the caps already stop a
 * full shelf from being worth much.
 */
export function startingStock(ruleset: Ruleset, now: Date = new Date()): Record<string, number | Date> {
  const seed: Record<string, number | Date> = {};
  for (const [field, { rule }] of restockedItems(ruleset)) {
    seed[field] = rule.cap;
    seed[rule.stockAtField] = now;
  }
  return seed;
}
