import type { PrismaClient } from '@prisma/client';
import {
  calculateProductTrade,
  creditDailyTrade,
  maxProductBuy,
  productEconomy,
  productRecipes,
  restockIntervalFor,
  settleProductShelf,
  StoreTradeError,
  type Ruleset,
  type Standings,
} from '@streets/rules-engine';
import { productTradeSchema, type GameActionResult, type ProductsDto, type ProductTradeResult } from '@streets/shared';
import type { Db } from '../utils/db.js';
import { AppError } from '../utils/errors.js';
import { ActionService } from './action.service.js';
import { PlayerStateService } from './player-state.service.js';
import { CRACK, ProductInventoryService, productKeys } from './product-inventory.service.js';

/** Pip's wait for a product shelf, shortened by standing with Pip exactly like his crack shelf. */
function shelfInterval(ruleset: Ruleset, standings: Standings, intervalMinutes: number): number {
  return restockIntervalFor(intervalMinutes, standings.PIP?.points ?? 0, ruleset);
}

async function shelfRow(db: Db | PrismaClient, roundPlayerId: string, productKey: string) {
  return db.productShelf.findUnique({ where: { roundPlayerId_productKey: { roundPlayerId, productKey } }, select: { stock: true, stockAt: true } });
}

/**
 * 0.4.0-D. Pip's counter for every product but crack, and the products page.
 *
 * Each product has its own shelf on the lazy restock clock, stored only once a
 * player has bought from it. Crack stays Pip's Product item at his store.
 */
export const ProductMarketService = {
  async page(prisma: PrismaClient, roundPlayerId: string): Promise<ProductsDto> {
    const settled = await PlayerStateService.settle(prisma, roundPlayerId, { markActive: false });
    const { ruleset, standings, player } = settled;
    if (!ruleset.products) return { enabled: false, products: [] };
    const now = new Date();
    const inventory = await ProductInventoryService.read(prisma, roundPlayerId, ruleset);
    const shelves = await prisma.productShelf.findMany({ where: { roundPlayerId }, select: { productKey: true, stock: true, stockAt: true } });
    const recipes = new Map(productRecipes(ruleset).map((recipe) => [recipe.product, recipe]));
    const economyOn = Boolean(ruleset.productEconomy);

    return {
      enabled: true,
      economy: economyOn,
      products: productKeys(ruleset).map((key) => {
        const definition = ruleset.products![key]!;
        const economy = productEconomy(ruleset, key);
        const quantity = inventory[key] ?? 0;
        const row = shelves.find((shelf) => shelf.productKey === key) ?? null;
        const shelf = economy?.pip ? settleProductShelf(row, economy, now, shelfInterval(ruleset, standings, economy.pip.restock.intervalMinutes)) : null;
        const recipe = economyOn ? recipes.get(key) : undefined;
        return {
          key,
          name: definition.name,
          blurb: definition.blurb,
          quantity,
          ...(economyOn ? {
            netWorthCents: key === CRACK ? ruleset.economy.netWorth.perCrackCents : economy?.netWorthCents ?? 0,
            pip: economy?.pip && shelf ? {
              buyCents: economy.pip.buyCents,
              sellCents: economy.pip.sellCents,
              stock: shelf.stock,
              cap: shelf.cap,
              perInterval: shelf.perInterval,
              intervalMinutes: shelf.intervalMinutes,
              nextAt: shelf.nextAt ? shelf.nextAt.toISOString() : null,
              maxBuy: maxProductBuy(player.cashCents, quantity, economy.pip.buyCents, shelf.stock),
            } : null,
            recipe: recipe ? { perThugPerTurn: recipe.perThugPerTurn, ingredientCentsPerUnit: recipe.ingredientCentsPerUnit, heatPerUnit: recipe.heatPerUnit } : null,
          } : {}),
        };
      }),
    };
  },

  trade(prisma: PrismaClient, roundPlayerId: string, rawInput: unknown): Promise<GameActionResult<ProductTradeResult>> {
    const input = productTradeSchema.parse(rawInput);
    return ActionService.run<ProductTradeResult>(prisma, roundPlayerId, {
      action: input.direction === 'buy' ? 'STORE_BUY' : 'STORE_SELL',
      actionId: input.actionId,
      execute: async ({ tx, current, ruleset, standings, now }) => {
        if (!ruleset.productEconomy) throw AppError.conflict('PRODUCT_ECONOMY_DISABLED', 'Pip only deals Product this round.');
        if (input.product === CRACK) throw AppError.badRequest('USE_PIP_PRODUCT', 'Buy and sell crack as Product at Pip’s.', { product: 'Crack is sold at Pip’s store.' });
        const economy = productEconomy(ruleset, input.product);
        if (!economy?.pip) throw AppError.badRequest('UNKNOWN_ITEM', 'Pip does not deal that product.', { product: 'Pick a product Pip deals.' });

        const inventory = await ProductInventoryService.read(tx, roundPlayerId, ruleset);
        const owned = inventory[input.product] ?? 0;
        const shelf = settleProductShelf(await shelfRow(tx, roundPlayerId, input.product), economy, now, shelfInterval(ruleset, standings, economy.pip.restock.intervalMinutes))!;

        let trade;
        try {
          trade = calculateProductTrade({ ruleset, product: input.product, direction: input.direction, quantity: input.quantity, owned, cashCents: current.cashCents, shelfStock: shelf.stock });
        } catch (error) {
          if (error instanceof StoreTradeError) throw AppError.badRequest(error.code, error.message, error.field ? { [error.field]: error.message } : undefined);
          throw error;
        }

        await ProductInventoryService.adjust(tx, roundPlayerId, ruleset, { [input.product]: trade.quantityChange });
        // A sale never touches the shelf, but settling it still has to be kept, or a parked clock is lost.
        const stockAfter = shelf.stock - trade.stockTaken;
        if (trade.stockTaken > 0 || shelf.changed) {
          await tx.productShelf.upsert({
            where: { roundPlayerId_productKey: { roundPlayerId, productKey: input.product } },
            create: { roundPlayerId, productKey: input.product, stock: stockAfter, stockAt: shelf.stockAt },
            update: { stock: stockAfter, stockAt: shelf.stockAt },
          });
        }

        // Being a regular at Pip's counts the same whichever product you trade.
        const credit = creditDailyTrade(standings.PIP, now, ruleset);
        const result: ProductTradeResult = {
          product: trade.product,
          productName: trade.productName,
          direction: trade.direction,
          quantity: trade.quantity,
          unitCents: trade.unitCents,
          totalCents: Number(trade.totalCents),
          cashChangeCents: Number(trade.cashChangeCents),
          quantityAfter: owned + trade.quantityChange,
          stockAfter: input.direction === 'buy' ? stockAfter : null,
          reputationGained: credit.gained,
        };
        return {
          next: { ...current, cashCents: current.cashCents + trade.cashChangeCents },
          result,
          reputation: credit.credited ? [{ trader: 'PIP', points: credit.points, creditedOn: credit.creditedOn }] : undefined,
          activity: {
            type: input.direction === 'buy' ? 'STORE_BUY' : 'STORE_SELL',
            payload: { store: ruleset.stores.PIP.name, item: trade.productName, quantity: trade.quantity, totalCents: result.totalCents },
          },
        };
      },
    });
  },
};
