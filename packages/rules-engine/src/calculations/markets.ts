import type { HighMarketRules, PriceEventKind, RestockRule, Ruleset, SupplyLevel } from '@streets/rulesets';
import { hashRoll } from '../rng.js';
import { SUPPLY_LEVELS, cityCounter, cityRules, pipBase, type CityCounter } from './cities.js';
import { settleStock, type RestockSettlement } from './restock.js';

/**
 * 0.5.0-C. Markets that move.
 *
 * Pip's supply in every city moves on a schedule, and gluts and droughts land on
 * top of it. The schedule is a pure function of the round's seed and the time, so
 * nothing runs in the background, every reader sees the same thing, and an admin can
 * replay a round. The high market is one shared price per round, city and product:
 * trades push it, and the push wears off back to a baseline that follows the
 * schedule.
 *
 * Everything here is pure. The server locks, loads and writes.
 */

const MINUTE = 60_000;

// --- the schedule ---------------------------------------------------------------

/** Each city's slots start at its own offset, so the whole map never turns over at once. */
function slotClock(seed: string, what: string, city: string, slotMinutes: number): { slotMs: number; offsetMs: number } {
  const slotMs = slotMinutes * MINUTE;
  return { slotMs, offsetMs: Math.floor(hashRoll(seed, what, 'offset', city) * slotMs) };
}

function slotOf(t: number, clock: { slotMs: number; offsetMs: number }): number {
  return Math.floor((t - clock.offsetMs) / clock.slotMs);
}

function slotStart(slot: number, clock: { slotMs: number; offsetMs: number }): number {
  return slot * clock.slotMs + clock.offsetMs;
}

/** Pip's supply from the swing alone in one slot: his usual level, or a step or two away from it. */
function swingLevel(ruleset: Ruleset, seed: string, city: string, product: string, slot: number): SupplyLevel | null {
  const rules = cityRules(ruleset, city);
  const usual = rules?.products[product]?.supply ?? null;
  const swings = ruleset.travel?.swings;
  if (!rules || usual === null) return null;
  if (!swings || rules.supplySwing <= 0) return usual;
  const swing = rules.supplySwing;
  if (hashRoll(seed, 'swing', city, product, slot) >= swings.moveChance * swing) return usual;
  const steps = hashRoll(seed, 'swing-size', city, product, slot) < swings.bigMoveShare * swing ? 2 : 1;
  const down = hashRoll(seed, 'swing-way', city, product, slot) < 0.5;
  const from = SUPPLY_LEVELS.indexOf(usual);
  const lowest = Math.max(from, SUPPLY_LEVELS.indexOf(rules.supplyFloor));
  return SUPPLY_LEVELS[Math.min(lowest, Math.max(0, from + (down ? steps : -steps)))]!;
}

export interface PriceEvent {
  city: string;
  product: string;
  kind: PriceEventKind;
  startsAt: Date;
  endsAt: Date;
}

/** The event a city rolled in one event slot, if any. An event never outlasts its slot. */
function eventInSlot(ruleset: Ruleset, seed: string, city: string, slot: number): PriceEvent | null {
  const events = ruleset.travel?.events;
  const rules = cityRules(ruleset, city);
  if (!events || !rules || rules.supplySwing <= 0) return null;
  if (hashRoll(seed, 'event', city, slot) >= events.chance * rules.supplySwing) return null;

  const kinds = Object.entries(events.kinds) as Array<[PriceEventKind, (typeof events.kinds)[PriceEventKind]]>;
  const total = kinds.reduce((sum, [, kind]) => sum + kind.weight, 0);
  let pick = hashRoll(seed, 'event-kind', city, slot) * total;
  let chosen = kinds[kinds.length - 1]!;
  for (const entry of kinds) {
    if (pick < entry[1].weight) { chosen = entry; break; }
    pick -= entry[1].weight;
  }
  const [kind, kindRules] = chosen;
  // A glut is a shipment for Pip, so it only lands where he deals; a drought can hit anything.
  const products = Object.keys(ruleset.products ?? { CRACK: true })
    .filter((key) => rules.products[key] && (kind !== 'GLUT' || rules.products[key]!.supply !== null));
  if (!products.length) return null;
  const product = products[Math.floor(hashRoll(seed, 'event-product', city, slot) * products.length)]!;

  const clock = slotClock(seed, 'event', city, events.slotMinutes);
  const durationMs = Math.min(kindRules.durationMinutes * MINUTE, clock.slotMs);
  const startsAt = slotStart(slot, clock) + Math.floor(hashRoll(seed, 'event-start', city, slot) * (clock.slotMs - durationMs));
  return { city, product, kind, startsAt: new Date(startsAt), endsAt: new Date(startsAt + durationMs) };
}

/** The event running in a city at a moment, for any product. */
export function cityEventAt(ruleset: Ruleset, seed: string, city: string, at: Date): PriceEvent | null {
  const events = ruleset.travel?.events;
  if (!events) return null;
  const clock = slotClock(seed, 'event', city, events.slotMinutes);
  const event = eventInSlot(ruleset, seed, city, slotOf(at.getTime(), clock));
  return event && event.startsAt.getTime() <= at.getTime() && at.getTime() < event.endsAt.getTime() ? event : null;
}

/** The event running for one product in a city at a moment. */
export function eventAt(ruleset: Ruleset, seed: string, city: string, product: string, at: Date): PriceEvent | null {
  const event = cityEventAt(ruleset, seed, city, at);
  return event?.product === product ? event : null;
}

/** Pip's supply for a product in a city at a moment: the swing, with any event on top. Null where he does not deal it. */
export function supplyAt(ruleset: Ruleset, seed: string, city: string, product: string, at: Date): SupplyLevel | null {
  const swings = ruleset.travel?.swings;
  const level = swings
    ? swingLevel(ruleset, seed, city, product, slotOf(at.getTime(), slotClock(seed, 'swing', city, swings.slotMinutes)))
    : cityRules(ruleset, city)?.products[product]?.supply ?? null;
  if (level === null) return null;
  const event = eventAt(ruleset, seed, city, product, at);
  return event ? ruleset.travel!.events!.kinds[event.kind].supply : level;
}

/** How far a high market's baseline has drifted in the slot a moment falls in, as a share: symmetric, so it averages out. */
export function marketDriftAt(ruleset: Ruleset, seed: string, city: string, product: string, at: Date): number {
  const swings = ruleset.travel?.swings;
  const swing = cityRules(ruleset, city)?.supplySwing ?? 0;
  if (!swings || !swings.marketDrift || swing <= 0) return 0;
  const slot = slotOf(at.getTime(), slotClock(seed, 'swing', city, swings.slotMinutes));
  return (hashRoll(seed, 'drift', city, product, slot) * 2 - 1) * swings.marketDrift * swing;
}

/** Pip's counter for a product in a city at a moment, at the supply the schedule gives it. */
export function liveCounter(ruleset: Ruleset, seed: string, city: string, product: string, at: Date): CityCounter | null {
  const level = supplyAt(ruleset, seed, city, product, at);
  return level === null ? null : cityCounter(ruleset, city, product, level);
}

/** Every moment Pip's supply for a product in a city may change between two times, in order. */
function supplyBoundaries(ruleset: Ruleset, seed: string, city: string, from: number, to: number): number[] {
  const points = new Set<number>();
  const swings = ruleset.travel?.swings;
  if (swings) {
    const clock = slotClock(seed, 'swing', city, swings.slotMinutes);
    for (let slot = slotOf(from, clock) + 1; slotStart(slot, clock) < to; slot++) points.add(slotStart(slot, clock));
  }
  const events = ruleset.travel?.events;
  if (events) {
    const clock = slotClock(seed, 'event', city, events.slotMinutes);
    for (let slot = slotOf(from, clock); slotStart(slot, clock) < to; slot++) {
      const event = eventInSlot(ruleset, seed, city, slot);
      for (const at of event ? [event.startsAt.getTime(), event.endsAt.getTime()] : []) if (at > from && at < to) points.add(at);
    }
  }
  return [...points].sort((a, b) => a - b);
}

/**
 * Settle a player's shelf for a product in a city up to `now`, through every supply
 * change since it was last touched. A drop in supply shrinks the shelf to the new size
 * (out empties it); a rise restocks toward the bigger shelf at the faster rate. No
 * stored shelf is a full one at today's size.
 */
export function settleLiveShelf(
  shelf: { stock: number; stockAt: Date } | null,
  ruleset: Ruleset,
  seed: string,
  city: string,
  product: string,
  now: Date,
): RestockSettlement & { counter: CityCounter | null } {
  const counter = liveCounter(ruleset, seed, city, product, now);
  const empty = (changed: boolean): RestockSettlement => ({ stock: 0, stockAt: now, gained: 0, cap: 0, intervalMinutes: counter?.intervalMinutes ?? 0, perInterval: 0, nextAt: null, changed });
  if (!shelf) {
    if (!counter || counter.shelfCap <= 0) return { ...empty(true), counter };
    return { stock: counter.shelfCap, stockAt: now, gained: 0, cap: counter.shelfCap, intervalMinutes: counter.intervalMinutes, perInterval: counter.perInterval, nextAt: null, changed: true, counter };
  }

  let stock = shelf.stock;
  let stockAt = shelf.stockAt;
  let settled: RestockSettlement | null = null;
  const edges = [...supplyBoundaries(ruleset, seed, city, shelf.stockAt.getTime(), now.getTime()), now.getTime()];
  let segmentStart = shelf.stockAt.getTime();
  for (const edge of edges) {
    const segmentCounter = liveCounter(ruleset, seed, city, product, new Date(segmentStart));
    const end = new Date(edge);
    if (!segmentCounter || segmentCounter.shelfCap <= 0) {
      stock = 0;
      stockAt = end;
      settled = null;
    } else {
      const rule = { cap: segmentCounter.shelfCap, perInterval: Math.max(1, segmentCounter.perInterval), intervalMinutes: segmentCounter.intervalMinutes, stockField: 'stock', stockAtField: 'stockAt' } as unknown as RestockRule;
      settled = settleStock({ stock, stockAt }, rule, end, segmentCounter.intervalMinutes);
      stock = settled.stock;
      stockAt = settled.stockAt;
    }
    segmentStart = edge;
  }
  const changed = stock !== shelf.stock || stockAt.getTime() !== shelf.stockAt.getTime();
  if (!settled || !counter || counter.shelfCap <= 0) return { ...empty(changed), stock, stockAt, counter };
  return { ...settled, stock, stockAt, changed, counter };
}

// --- the high market ---------------------------------------------------------

/** How far a market is pushed off its baseline once the push has worn off to `now`. */
export function settlePush(state: { push: number; pushAt: Date } | null, rules: HighMarketRules, now: Date): number {
  if (!state || state.push === 0) return 0;
  const elapsed = Math.max(0, now.getTime() - state.pushAt.getTime()) / MINUTE;
  const push = state.push * 0.5 ** (elapsed / rules.recoveryHalfLifeMinutes);
  return Math.abs(push) < 1e-6 ? 0 : push;
}

export interface MarketView {
  city: string;
  product: string;
  /** Pip's supply here right now; the market leans with it. */
  supply: SupplyLevel | null;
  event: PriceEvent | null;
  /** Mid price with nothing pushing it: Pip's base buy x demand, leaned by how far supply is from usual, x any event, x the drift. */
  baselineCents: number;
  /** The least a buyer's unit is priced at before the spread: Pip's price here, leaned by supply and any glut. */
  floorCents: number;
  push: number;
  /** Units that move the price 1%. */
  depth: number;
  spread: number;
  /** What the next unit bought costs and the next unit sold pays. */
  buyCents: number;
  sellCents: number;
}

function clampPush(push: number, rules: HighMarketRules): number {
  return Math.min(rules.maxPushUp, Math.max(-rules.maxPushDown, push));
}

/** A buyer pays at least Pip's floor, and the push moves what they pay either way. */
function unitBuyCents(view: Pick<MarketView, 'baselineCents' | 'floorCents' | 'spread'>, push: number): number {
  return Math.ceil(Math.max(view.floorCents, view.baselineCents) * (1 + push) * (1 + view.spread));
}

function unitSellCents(view: Pick<MarketView, 'baselineCents' | 'spread'>, push: number): number {
  return Math.max(0, Math.floor(view.baselineCents * (1 + push) * (1 - view.spread)));
}

/** A city's high market for a product at a moment, pushed by `push`. Null without a live market or a price. */
export function marketView(ruleset: Ruleset, seed: string, city: string, product: string, push: number, at: Date): MarketView | null {
  const rules = ruleset.travel?.market;
  const cityRow = cityRules(ruleset, city);
  const row = cityRow?.products[product];
  const base = pipBase(ruleset, product);
  const travel = ruleset.travel;
  if (!rules || !cityRow || !row || !base || !travel) return null;
  const supply = supplyAt(ruleset, seed, city, product, at);
  const event = eventAt(ruleset, seed, city, product, at);
  // Demand is the market at Pip's usual supply; the lean is how far today's supply is from it.
  const usual = row.supply;
  const lean = (field: 'market' | 'price') => {
    if (!supply || !usual) return 1;
    const read = (level: SupplyLevel) => (field === 'market' ? travel.supplyLevels[level].market ?? 1 : travel.supplyLevels[level].price);
    return read(supply) / read(usual);
  };
  const multiplier = event ? travel.events!.kinds[event.kind].marketMultiplier : 1;
  const leaned = base.buyCents * row.demand * lean('market') * multiplier;
  // The drift moves the market either way, but never up past Pip's own price while he
  // deals it: a drift is a price move, not a same-city loop.
  const pip = supply && supply !== 'OUT' ? cityCounter(ruleset, city, product, supply) : null;
  const drifted = leaned * (1 + marketDriftAt(ruleset, seed, city, product, at));
  const baselineCents = pip ? Math.min(drifted, Math.max(leaned, pip.buyCents)) : drifted;
  // A buyer pays at least Pip's price here, leaned the same way: never a way round his
  // counter at a discount, but a glut is cheap everywhere in town.
  const floorCents = base.buyCents * row.price * lean('price') * Math.min(1, multiplier);
  const step = 1 / (cityRow.marketDepth * 100);
  const view = { baselineCents, floorCents, spread: travel.highMarketSpread };
  return {
    city,
    product,
    supply,
    event,
    baselineCents: Math.round(baselineCents),
    floorCents: Math.round(floorCents),
    push,
    depth: cityRow.marketDepth,
    spread: travel.highMarketSpread,
    buyCents: unitBuyCents(view, clampPush(push + step, rules)),
    sellCents: unitSellCents(view, clampPush(push - step, rules)),
  };
}

export interface MarketFill {
  direction: 'buy' | 'sell';
  quantity: number;
  totalCents: bigint;
  firstUnitCents: number;
  lastUnitCents: number;
  /** The push once the trade has landed. */
  pushAfter: number;
}

/**
 * Fill an order against the high market. Every unit moves the price 1% per `depth`
 * units and is priced after its own move, so the trader always takes the worse side:
 * buying and selling the same units back always loses, however the order is split.
 */
export function fillMarket(view: MarketView, rules: HighMarketRules, direction: 'buy' | 'sell', quantity: number): MarketFill {
  const step = 1 / (view.depth * 100);
  const way = direction === 'buy' ? 1 : -1;
  const raw = { baselineCents: view.baselineCents, floorCents: view.floorCents, spread: view.spread };
  let total = 0n;
  let first = 0;
  let last = 0;
  let push = view.push;
  for (let unit = 1; unit <= quantity; unit++) {
    push = clampPush(view.push + way * unit * step, rules);
    last = direction === 'buy' ? unitBuyCents(raw, push) : unitSellCents(raw, push);
    if (unit === 1) first = last;
    total += BigInt(last);
  }
  return { direction, quantity, totalCents: total, firstUnitCents: first, lastUnitCents: last, pushAfter: quantity > 0 ? push : view.push };
}

/** True when the market has moved against the trader by more than the tolerance since they were quoted. */
export function quoteMoved(rules: HighMarketRules, direction: 'buy' | 'sell', quotedCents: number, firstUnitCents: number): boolean {
  return direction === 'buy'
    ? firstUnitCents > Math.ceil(quotedCents * (1 + rules.quoteTolerance))
    : firstUnitCents < Math.floor(quotedCents * (1 - rules.quoteTolerance));
}

// --- the street wire -------------------------------------------------------------

export interface WireItem {
  at: Date;
  city: string;
  product: string;
  kind: PriceEventKind | 'SUPPLY';
  /** For a supply item, what Pip's supply went to. */
  supply?: SupplyLevel;
  /** When an event ends. */
  endsAt?: Date;
}

/**
 * What the street hears between two times: every price event as it starts, and some
 * of Pip's supply changes to or from out or plentiful. Never anything after `to`, so
 * the schedule ahead stays unknown.
 */
export function streetWire(ruleset: Ruleset, seed: string, from: Date, to: Date): WireItem[] {
  const items: WireItem[] = [];
  const events = ruleset.travel?.events;
  const swings = ruleset.travel?.swings;
  const products = Object.keys(ruleset.products ?? { CRACK: true });
  for (const city of Object.keys(ruleset.cities ?? {})) {
    if (events) {
      const clock = slotClock(seed, 'event', city, events.slotMinutes);
      for (let slot = slotOf(from.getTime(), clock) - 1; slotStart(slot, clock) <= to.getTime(); slot++) {
        const event = eventInSlot(ruleset, seed, city, slot);
        if (event && event.startsAt.getTime() >= from.getTime() && event.startsAt.getTime() <= to.getTime()) {
          items.push({ at: event.startsAt, city, product: event.product, kind: event.kind, endsAt: event.endsAt });
        }
      }
    }
    if (swings) {
      const clock = slotClock(seed, 'swing', city, swings.slotMinutes);
      for (let slot = slotOf(from.getTime(), clock) + 1; slotStart(slot, clock) <= to.getTime(); slot++) {
        const at = slotStart(slot, clock);
        if (at < from.getTime()) continue;
        for (const product of products) {
          const before = swingLevel(ruleset, seed, city, product, slot - 1);
          const after = swingLevel(ruleset, seed, city, product, slot);
          if (!before || !after || before === after) continue;
          const loud = after === 'OUT' || after === 'PLENTIFUL' || before === 'OUT' || before === 'PLENTIFUL';
          if (loud && hashRoll(seed, 'wire', city, product, slot) < swings.wireShare) items.push({ at: new Date(at), city, product, kind: 'SUPPLY', supply: after });
        }
      }
    }
  }
  return items.sort((a, b) => b.at.getTime() - a.at.getTime());
}
