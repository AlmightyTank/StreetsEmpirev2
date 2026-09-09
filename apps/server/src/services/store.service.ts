import type { PrismaClient } from '@prisma/client';
import { calculateStoreTrade, calculateWeaponUnlock, hasWeaponAccess, maxStoreBuy, stockOnHand, StoreTradeError, WeaponUnlockError, weaponUnlockProgress, type Ruleset } from '@streets/rules-engine';
import type { GameActionResult, StoresDto, StoreTradeInput, StoreTradeResult, WeaponUnlockInput, WeaponUnlockResult } from '@streets/shared';
import { ActionService, type PlayerState } from './action.service.js';
import type { StockSettlementSet } from './stock.service.js';
import { AppError } from '../utils/errors.js';

export const StoreService = {
  /**
   * The shelves have to be settled before this runs, or the store shows a
   * count that is hours stale. Both callers go through PlayerStateService.
   */
  catalog(ruleset: Ruleset, player: PlayerState, stock: StockSettlementSet): StoresDto {
    return {
      stores: Object.entries(ruleset.stores).map(([key, store]) => ({
        key, slug: store.slug, name: store.name, keeper: store.keeper, blurb: store.blurb,
        items: Object.entries(store.items).map(([itemKey, item]) => {
          const onHand = stockOnHand(player, item);
          const settled = item.restock ? stock.byField[item.restock.stockField] ?? null : null;
          return {
            key: itemKey, ...item, owned: player[item.field],
            unlock: item.unlockKey ? weaponUnlockProgress(player, item.unlockKey, ruleset) : null,
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
    };
  },

  unlock(prisma: PrismaClient, roundPlayerId: string, input: WeaponUnlockInput): Promise<GameActionResult<WeaponUnlockResult>> {
    return ActionService.run<WeaponUnlockResult>(prisma, roundPlayerId, {
      action: 'WEAPON_UNLOCK', actionId: input.actionId,
      execute: ({ current, ruleset }) => {
        let favor;
        try {
          favor = calculateWeaponUnlock(current, input.weapon, ruleset);
        } catch (error) {
          if (error instanceof WeaponUnlockError) throw AppError.badRequest(error.code, error.message);
          throw error;
        }
        const { field, ...result } = favor;
        return {
          next: {
            ...current, [field]: true,
            cashCents: current.cashCents - BigInt(favor.cashSpentCents),
            crack: current.crack - favor.crackDelivered,
          },
          result,
          activity: {
            type: 'WEAPON_UNLOCK',
            payload: { weapon: favor.weaponName, favor: favor.favorTitle,
              cashSpentCents: favor.cashSpentCents, crackDelivered: favor.crackDelivered },
          },
        };
      },
    });
  },

  trade(prisma: PrismaClient, roundPlayerId: string, input: StoreTradeInput): Promise<GameActionResult<StoreTradeResult>> {
    return ActionService.run<StoreTradeResult>(prisma, roundPlayerId, {
      action: input.direction === 'buy' ? 'STORE_BUY' : 'STORE_SELL',
      actionId: input.actionId,
      execute: ({ current, ruleset }) => {
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
        const result: StoreTradeResult = {
          ...priced, direction: input.direction, quantity: input.quantity,
          totalCents: Number(trade.totalCents), cashChangeCents: Number(trade.cashChangeCents),
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
          activity: {
            type: input.direction === 'buy' ? 'STORE_BUY' : 'STORE_SELL',
            payload: { store: trade.storeName, item: trade.itemName,
              quantity: input.quantity, totalCents: result.totalCents },
          },
        };
      },
    });
  },
};
