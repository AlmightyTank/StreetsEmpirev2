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

import type { RestockRule, Ruleset, StockField, StoreItem, StoreShipmentRules } from '@streets/rulesets';

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
  /** 0.8.0-E. The next incoming physical shipment, when shipment rules are enabled. */
  shipment?: IncomingShipment | null;
  /** True when either column needs writing back. */
  changed: boolean;
}

export type IncomingShipmentStatus = 'ON_TIME' | 'DELAYED' | 'PARTIAL' | 'LARGE';

export interface IncomingShipment {
  quantity: number;
  scheduledAt: Date;
  arrivesAt: Date;
  status: IncomingShipmentStatus;
  delayMinutes: number;
}

export interface ShipmentSettlementOptions {
  rules: StoreShipmentRules;
  context: string;
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

function shipmentHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function shipmentRoll(options: ShipmentSettlementOptions, scheduledAt: Date): number {
  return shipmentHash(`${options.rules.seed}:${options.context}:${scheduledAt.toISOString()}`) % 100;
}

function plannedShipment(
  rule: RestockRule,
  stockAt: Date,
  intervalMs: number,
  options: ShipmentSettlementOptions,
): IncomingShipment {
  const scheduledAt = new Date(stockAt.getTime() + intervalMs);
  const roll = shipmentRoll(options, scheduledAt);
  const rules = options.rules;
  const baseQuantity = perInterval(rule);
  const delayedLimit = rules.delayChancePercent;
  const partialLimit = delayedLimit + rules.partialChancePercent;
  const largeLimit = partialLimit + rules.largeChancePercent;

  if (roll < delayedLimit) {
    return {
      quantity: baseQuantity,
      scheduledAt,
      arrivesAt: new Date(scheduledAt.getTime() + rules.delayMinutes * 60 * 1000),
      status: 'DELAYED',
      delayMinutes: rules.delayMinutes,
    };
  }
  if (roll < partialLimit) {
    return {
      quantity: Math.max(1, Math.floor(baseQuantity * rules.partialMultiplier)),
      scheduledAt,
      arrivesAt: scheduledAt,
      status: 'PARTIAL',
      delayMinutes: 0,
    };
  }
  if (roll < largeLimit) {
    return {
      quantity: Math.max(1, Math.floor(baseQuantity * rules.largeMultiplier)),
      scheduledAt,
      arrivesAt: scheduledAt,
      status: 'LARGE',
      delayMinutes: 0,
    };
  }
  return { quantity: baseQuantity, scheduledAt, arrivesAt: scheduledAt, status: 'ON_TIME', delayMinutes: 0 };
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
  shipmentOptions?: ShipmentSettlementOptions,
): RestockSettlement {
  const current = readStock(state, rule);
  const intervalMs = intervalMinutes * 60 * 1000;

  const held = Math.max(0, Math.min(rule.cap, current.stock));

  let stock = held;
  let stockAt = current.stockAt;
  let gained = 0;
  let shipment: IncomingShipment | null = null;

  if (held >= rule.cap) {
    // Full. Park the clock so the wait starts fresh after the next purchase.
    stockAt = now;
  } else if (shipmentOptions?.rules.enabled) {
    while (stock < rule.cap) {
      const incoming = plannedShipment(rule, stockAt, intervalMs, shipmentOptions);
      shipment = incoming;
      if (incoming.arrivesAt.getTime() > now.getTime()) break;
      const delivered = Math.min(incoming.quantity, rule.cap - stock);
      stock += delivered;
      gained += delivered;
      stockAt = stock >= rule.cap ? now : incoming.arrivesAt;
    }
  } else {
    const elapsedMs = now.getTime() - current.stockAt.getTime();
    const intervals = elapsedMs > 0 ? Math.floor(elapsedMs / intervalMs) : 0;
    if (intervals > 0) {
      gained = Math.min(intervals * perInterval(rule), rule.cap - held);
      stock = held + gained;
      stockAt =
        stock >= rule.cap ? now : new Date(current.stockAt.getTime() + intervals * intervalMs);
    }
  }

  if (shipmentOptions?.rules.enabled) {
    shipment = stock >= rule.cap ? null : plannedShipment(rule, stockAt, intervalMs, shipmentOptions);
  }

  return {
    stock,
    stockAt,
    gained,
    cap: rule.cap,
    intervalMinutes,
    perInterval: perInterval(rule),
    nextAt: shipment?.arrivesAt ?? (stock >= rule.cap ? null : new Date(stockAt.getTime() + intervalMs)),
    shipment,
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
