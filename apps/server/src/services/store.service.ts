import type { PrismaClient } from '@prisma/client';
import { calculateStoreTrade, calculateWeaponUnlock, hasWeaponAccess, maxStoreBuy, StoreTradeError, WeaponUnlockError, weaponUnlockProgress, type Ruleset } from '@streets/rules-engine';
import type { GameActionResult, StoresDto, StoreTradeInput, StoreTradeResult, WeaponUnlockInput, WeaponUnlockResult } from '@streets/shared';
import { ActionService, type PlayerState } from './action.service.js';
import { AppError } from '../utils/errors.js';

export const StoreService = {
  catalog(ruleset: Ruleset, player: PlayerState): StoresDto {
    return {
      stores: Object.entries(ruleset.stores).map(([key, store]) => ({
        key, slug: store.slug, name: store.name, blurb: store.blurb,
        items: Object.entries(store.items).map(([itemKey, item]) => ({
          key: itemKey, ...item, owned: player[item.field],
          unlock: item.unlockKey ? weaponUnlockProgress(player, item.unlockKey, ruleset) : null,
          maxBuy: item.unlockKey && !hasWeaponAccess(player, item.unlockKey)
            ? 0 : maxStoreBuy(player.cashCents, player[item.field], item),
        })),
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
        const result: StoreTradeResult = {
          ...trade, direction: input.direction, quantity: input.quantity,
          totalCents: Number(trade.totalCents), cashChangeCents: Number(trade.cashChangeCents),
        };
        return {
          next: {
            ...current,
            cashCents: current.cashCents + trade.cashChangeCents,
            [trade.field]: current[trade.field] + trade.quantityChange,
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
