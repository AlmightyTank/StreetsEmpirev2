import {
  restockIntervalFor,
  restockedItems,
  settleStock,
  type RestockSettlement,
  type Ruleset,
  type Standings,
} from '@streets/rules-engine';
import type { StockAtField, StockField, TraderKey } from '@streets/rulesets';

export type StockCounts = Partial<Record<StockField, number>>;
export type StockClocks = Partial<Record<StockAtField, Date>>;

export interface StockSettlementSet {
  /** Settled shelf counts, ready to fold into player state. */
  counts: StockCounts;
  /** Settled clocks. These never belong to an action, only to the settlement. */
  clocks: StockClocks;
  /** Keyed by column, for the store to explain the wait with. */
  byField: Partial<Record<StockField, RestockSettlement>>;
  /** True when anything above needs writing back. */
  changed: boolean;
}

/**
 * Sections 34-36. The only place a shop shelf is allowed to refill.
 *
 * Deliberately shaped like TurnService: settle first, then let whatever comes
 * next spend from a settled balance. An item with no restock rule in the
 * ruleset never appears here, so nothing is written for it.
 */
export const StockService = {
  settle(
    player: Record<string, unknown>,
    now: Date,
    ruleset: Ruleset,
    /** Standing shortens a shop's wait. Omit for the stranger's rate. */
    standings?: Standings,
  ): StockSettlementSet {
    const counts: StockCounts = {};
    const clocks: StockClocks = {};
    const byField: Partial<Record<StockField, RestockSettlement>> = {};
    let changed = false;

    // Which shop sells each restocked item, so standing can be applied to the
    // right shelves and no others.
    const traderOf = new Map<StockField, TraderKey>();
    for (const [key, store] of Object.entries(ruleset.stores)) {
      for (const item of Object.values(store.items)) {
        if (item.restock) traderOf.set(item.restock.stockField, key as TraderKey);
      }
    }

    for (const [field, { rule }] of restockedItems(ruleset)) {
      const trader = traderOf.get(field);
      const points = standings && trader ? (standings[trader]?.points ?? 0) : 0;
      const settled = settleStock(
        player,
        rule,
        now,
        restockIntervalFor(rule.intervalMinutes, points, ruleset),
        ruleset.storeEconomy?.shipments?.enabled
          ? { rules: ruleset.storeEconomy.shipments, context: `${ruleset.meta.id}:${field}` }
          : undefined,
      );
      counts[field] = settled.stock;
      clocks[rule.stockAtField] = settled.stockAt;
      byField[field] = settled;
      if (settled.changed) changed = true;
    }

    return { counts, clocks, byField, changed };
  },
};
