import type { PrismaClient } from '@prisma/client';
import {
  calculateStoreTrade,
  creditDailyTrade,
  hasWeaponAccess,
  maxStoreBuy,
  stockOnHand,
  StoreTradeError,
  restockSpeedup,
  tierFor,
  weaponUnlockProgress,
  type Ruleset,
  type Standings,
} from '@streets/rules-engine';
import type { TraderKey } from '@streets/rulesets';
import type { GameActionResult, StoresDto, StoreTradeInput, StoreTradeResult } from '@streets/shared';
import { ActionService, type PlayerState } from './action.service.js';
import type { StockSettlementSet } from './stock.service.js';
import { AppError } from '../utils/errors.js';

export const StoreService = {
  /**
   * The shelves have to be settled before this runs, or the store shows a
   * count that is hours stale. Both callers go through PlayerStateService.
   */
  catalog(
    ruleset: Ruleset,
    player: PlayerState,
    stock: StockSettlementSet,
    standings: Standings,
  ): StoresDto {
    return {
      stores: Object.entries(ruleset.stores).map(([key, store]) => ({
        key, slug: store.slug, name: store.name, keeper: store.keeper, blurb: store.blurb,
        standing: tierFor(standings[key as TraderKey]?.points ?? 0, ruleset).name,
        reputation: standings[key as TraderKey]?.points ?? 0,
        restockSpeedup: Math.round(restockSpeedup(standings[key as TraderKey]?.points ?? 0, ruleset) * 100),
        items: Object.entries(store.items).map(([itemKey, item]) => {
          const onHand = stockOnHand(player, item);
          const settled = item.restock ? stock.byField[item.restock.stockField] ?? null : null;
          return {
            key: itemKey, ...item, owned: player[item.field],
            unlock: item.unlockKey
              ? weaponUnlockProgress(player, standings, item.unlockKey, ruleset)
              : null,
            maxBuy: item.unlockKey && !hasWeaponAccess(player, item.unlockKey)
              ? 0 : maxStoreBuy(player.cashCents, player[item.field], item, onHand),
            restock: item.restock && settled
              ? {
                  stock: settled.stock,
                  cap: settled.cap,
                  intervalMinutes: settled.intervalMinutes,
                  perInterval: settled.perInterval,
                  nextAt: settled.nextAt ? settled.nextAt.toISOString() : null,
                }
              : null,
          };
        }),
      })),
      bulkHelpers: [...ruleset.storeBulkHelpers],
      lowRiderThugCapacity: ruleset.lowRiderThugCapacity,
      productCounter: Boolean(ruleset.productEconomy),
    };
  },

  trade(prisma: PrismaClient, roundPlayerId: string, input: StoreTradeInput): Promise<GameActionResult<StoreTradeResult>> {
    return ActionService.run<StoreTradeResult>(prisma, roundPlayerId, {
      action: input.direction === 'buy' ? 'STORE_BUY' : 'STORE_SELL',
      actionId: input.actionId,
      execute: ({ current, ruleset, standings, now }) => {
        let trade;
        try {
          trade = calculateStoreTrade(current, input, ruleset);
        } catch (error) {
          if (error instanceof StoreTradeError) {
            throw AppError.badRequest(error.code, error.message,
              error.field ? { [error.field]: error.message } : undefined);
          }
          throw error;
        }
        const { stockField, stockTaken, ...priced } = trade;

        // Being a regular. Paid once a day per trader however much you buy,
        // so standing tracks showing up rather than spending.
        const trader = input.store as TraderKey;
        const credit = creditDailyTrade(standings[trader], now, ruleset);

        const result: StoreTradeResult = {
          ...priced, direction: input.direction, quantity: input.quantity,
          totalCents: Number(trade.totalCents), cashChangeCents: Number(trade.cashChangeCents),
          reputationGained: credit.gained,
        };
        return {
          next: {
            ...current,
            cashCents: current.cashCents + trade.cashChangeCents,
            [trade.field]: current[trade.field] + trade.quantityChange,
            // Taking one off the shelf is what starts the wait for the next.
            ...(stockField ? { [stockField]: current[stockField] - stockTaken } : {}),
          },
          result,
          ledger: [{
            source: input.direction === 'buy' ? 'STORE_BUY' : 'STORE_SELL',
            label: `${trade.storeName} · ${input.direction === 'buy' ? 'buy' : 'sell'} ${trade.itemName}`,
            amountCents: trade.cashChangeCents,
          }],
          reputation: credit.credited
            ? [{ trader, points: credit.points, creditedOn: credit.creditedOn }]
            : undefined,
          activity: {
            type: input.direction === 'buy' ? 'STORE_BUY' : 'STORE_SELL',
            payload: {
              store: trade.storeName,
              storeKey: input.store,
              item: trade.itemName,
              itemKey: input.item,
              direction: input.direction,
              quantity: input.quantity,
              totalCents: result.totalCents,
            },
          },
        };
      },
    });
  },
};
