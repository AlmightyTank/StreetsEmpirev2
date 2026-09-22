import type { PrismaClient } from '@prisma/client';
import {
  calculateStoreTrade,
  creditDailyTrade,
  findStore,
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
import { SingleUseFavorService } from './single-use-favor.service.js';

function discountedBuyCents(buyCents: number, sellCents: number | null, discountPercent: number): number {
  const discounted = Math.floor(buyCents * (100 - Math.min(90, Math.max(0, discountPercent))) / 100);
  return sellCents === null ? Math.max(1, discounted) : Math.max(sellCents + 1, discounted);
}

export const StoreService = {
  /**
   * The shelves have to be settled before this runs, or the store shows a
   * count that is hours stale. Both callers go through PlayerStateService.
   */
  async catalog(
    prisma: PrismaClient,
    roundPlayerId: string,
    ruleset: Ruleset,
    player: PlayerState,
    stock: StockSettlementSet,
    standings: Standings,
  ): Promise<StoresDto> {
    const armed = await SingleUseFavorService.matching(prisma, roundPlayerId, ruleset, 'STORE_BUY_DISCOUNT');
    const discount = armed?.effect.kind === 'STORE_BUY_DISCOUNT' ? armed.effect : null;
    return {
      stores: Object.entries(ruleset.stores).map(([key, store]) => ({
        key, slug: store.slug, name: store.name, keeper: store.keeper, blurb: store.blurb,
        standing: tierFor(standings[key as TraderKey]?.points ?? 0, ruleset).name,
        reputation: standings[key as TraderKey]?.points ?? 0,
        restockSpeedup: Math.round(restockSpeedup(standings[key as TraderKey]?.points ?? 0, ruleset) * 100),
        items: Object.entries(store.items).map(([itemKey, item]) => {
          const onHand = stockOnHand(player, item);
          const settled = item.restock ? stock.byField[item.restock.stockField] ?? null : null;
          const favorApplies = Boolean(
            discount
            && discount.storeKey === key
            && discount.itemKeys.includes(itemKey),
          );
          const quotedBuyCents = favorApplies
            ? discountedBuyCents(item.buyCents, item.sellCents, discount!.discountPercent)
            : item.buyCents;
          const quotedItem = quotedBuyCents === item.buyCents ? item : { ...item, buyCents: quotedBuyCents };
          return {
            key: itemKey, ...item,
            buyCents: quotedBuyCents,
            ...(favorApplies ? {
              baseBuyCents: item.buyCents,
              favorDiscountPercent: discount!.discountPercent,
            } : {}),
            owned: player[item.field],
            unlock: item.unlockKey
              ? weaponUnlockProgress(player, standings, item.unlockKey, ruleset)
              : null,
            maxBuy: item.unlockKey && !hasWeaponAccess(player, item.unlockKey)
              ? 0 : maxStoreBuy(player.cashCents, player[item.field], quotedItem, onHand),
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
      execute: async ({ tx, current, ruleset, standings, now }) => {
        const foundStore = findStore(ruleset, input.store);
        const armed = input.direction === 'buy'
          ? await SingleUseFavorService.matching(tx, roundPlayerId, ruleset, 'STORE_BUY_DISCOUNT')
          : null;
        const discount = armed?.effect.kind === 'STORE_BUY_DISCOUNT'
          && foundStore
          && armed.effect.storeKey === foundStore.key
          && armed.effect.itemKeys.includes(input.item)
          ? armed
          : null;
        const storeItem = foundStore && Object.hasOwn(foundStore.store.items, input.item)
          ? foundStore.store.items[input.item]
          : undefined;
        const buyUnitCents = discount && storeItem
          ? discountedBuyCents(storeItem.buyCents, storeItem.sellCents, discount.effect.discountPercent)
          : undefined;

        let trade;
        try {
          trade = calculateStoreTrade(
            current,
            input,
            ruleset,
            buyUnitCents === undefined ? undefined : { buyUnitCents },
          );
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

        if (discount) await SingleUseFavorService.consume(tx, discount.id);

        const result: StoreTradeResult = {
          ...priced, direction: input.direction, quantity: input.quantity,
          totalCents: Number(trade.totalCents), cashChangeCents: Number(trade.cashChangeCents),
          reputationGained: credit.gained,
          ...(discount ? {
            favorKey: discount.key,
            favorDiscountPercent: discount.effect.discountPercent,
            baseUnitCents: storeItem?.buyCents,
          } : {}),
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
              ...(result.favorKey ? { favorKey: result.favorKey } : {}),
              ...(result.favorDiscountPercent ? { favorDiscountPercent: result.favorDiscountPercent } : {}),
            },
          },
        };
      },
    });
  },
};
