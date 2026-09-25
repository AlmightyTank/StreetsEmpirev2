import type { PrismaClient } from '@prisma/client';
import {
  calculateProductTrade,
  creditDailyTrade,
  fillMarket,
  loadRulesetForRound,
  maxProductBuy,
  marketView,
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
import { PermanentUnlockService } from './permanent-unlock.service.js';
import { TimedFavorService } from './timed-favor.service.js';
import { boostedSellCents, relationshipPriceAdjustments, storeMarketContext } from './store.service.js';
import { HighMarketService } from './high-market.service.js';

function pressureQuote(
  buyCents: number,
  sellCents: number,
  pressure: number,
): { buyCents: number; sellCents: number } {
  const buy = Math.max(1, Math.round(buyCents * (1 + pressure)));
  const sell = Math.max(0, Math.round(sellCents * (1 + pressure)));
  return { buyCents: Math.max(sell + 1, buy), sellCents: sell };
}

function pressureFor(ruleset: Ruleset, push: number): number | null {
  const rule = ruleset.storeEconomy?.pipProductPressure;
  if (!rule?.enabled) return null;
  return Math.max(-rule.maxPricePressure, Math.min(rule.maxPricePressure, push));
}

function pressureTrend(pressure: number): 'Rising' | 'Stable' | 'Falling' {
  if (pressure > 0.0001) return 'Rising';
  if (pressure < -0.0001) return 'Falling';
  return 'Stable';
}

/** Pip's wait for a product shelf, shortened by standing with Pip exactly like his crack shelf. */
function shelfInterval(ruleset: Ruleset, standings: Standings, intervalMinutes: number): number {
  return restockIntervalFor(intervalMinutes, standings.PIP?.points ?? 0, ruleset);
}

async function shelfRow(db: Db | PrismaClient, roundPlayerId: string, productKey: string) {
  return db.productShelf.findUnique({ where: { roundPlayerId_productKey: { roundPlayerId, productKey } }, select: { stock: true, stockAt: true } });
}

function discountedPipBuyCents(buyCents: number, sellCents: number, discountPercent: number): number {
  if (discountPercent <= 0) return buyCents;
  const discounted = Math.floor(buyCents * (100 - Math.min(90, discountPercent)) / 100);
  return Math.max(sellCents + 1, discounted);
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
    const { ruleset, standings, player, round } = settled;
    if (!ruleset.products) return { enabled: false, products: [] };
    const now = new Date();
    const baseRuleset = loadRulesetForRound(round);
    const pushes = ruleset.storeEconomy?.pipProductPressure?.enabled
      ? await HighMarketService.pushes(prisma, baseRuleset, round.id, player.city.slug, now)
      : new Map<string, number>();
    const inventory = await ProductInventoryService.read(prisma, roundPlayerId, ruleset);
    const shelves = await prisma.productShelf.findMany({ where: { roundPlayerId }, select: { productKey: true, stock: true, stockAt: true } });
    const recipes = new Map(productRecipes(ruleset).map((recipe) => [recipe.product, recipe]));
    const economyOn = Boolean(ruleset.productEconomy);
    const unlockKeys = await PermanentUnlockService.keys(prisma, roundPlayerId);
    const favorBonuses = await TimedFavorService.bonuses(prisma, roundPlayerId, ruleset, now);
    const relationship = relationshipPriceAdjustments(standings.PIP?.points ?? 0, ruleset, 'PIP');

    return {
      enabled: true,
      economy: economyOn,
      products: productKeys(ruleset).map((key) => {
        const definition = ruleset.products![key]!;
        const economy = productEconomy(ruleset, key);
        const quantity = inventory[key] ?? 0;
        const row = shelves.find((shelf) => shelf.productKey === key) ?? null;
        const shelf = economy?.pip ? settleProductShelf(row, economy, now, shelfInterval(ruleset, standings, economy.pip.restock.intervalMinutes)) : null;
        const pressure = pressureFor(ruleset, pushes.get(key) ?? 0) ?? 0;
        const quote = economy?.pip ? pressureQuote(economy.pip.buyCents, economy.pip.sellCents, pressure) : null;
        const sellCents = quote
          ? boostedSellCents(quote.sellCents, quote.buyCents, relationship.sellBonusPercent) ?? quote.sellCents
          : 0;
        const recipe = economyOn ? recipes.get(key) : undefined;
        const requiredUnlock = PermanentUnlockService.productPurchaseUnlock(ruleset, key);
        const purchaseUnlocked = !requiredUnlock || unlockKeys.has(requiredUnlock.key);
        const effectiveBuyCents = quote
          ? discountedPipBuyCents(quote.buyCents, sellCents, relationship.buyDiscountPercent + favorBonuses.pipBuyDiscountPercent)
          : 0;
        return {
          key,
          name: definition.name,
          blurb: definition.blurb,
          quantity,
          ...(economyOn ? {
            netWorthCents: key === CRACK ? ruleset.economy.netWorth.perCrackCents : economy?.netWorthCents ?? 0,
            pip: economy?.pip && shelf && quote ? {
              buyCents: effectiveBuyCents,
              sellCents,
              market: storeMarketContext({
                buyCents: effectiveBuyCents,
                baseBuyCents: economy.pip.buyCents,
                sellCents,
                baseSellCents: economy.pip.sellCents,
                stock: shelf.stock,
                cap: shelf.cap,
                trend: pressureTrend(pressure),
              }),
              stock: shelf.stock,
              cap: shelf.cap,
              perInterval: shelf.perInterval,
              intervalMinutes: shelf.intervalMinutes,
              nextAt: shelf.nextAt ? shelf.nextAt.toISOString() : null,
              maxBuy: purchaseUnlocked ? maxProductBuy(player.cashCents, quantity, effectiveBuyCents, shelf.stock) : 0,
              purchaseUnlocked,
              ...(favorBonuses.pipBuyDiscountPercent > 0 ? { favorDiscountPercent: favorBonuses.pipBuyDiscountPercent } : {}),
              ...(relationship.buyDiscountPercent > 0 ? { relationshipBuyDiscountPercent: relationship.buyDiscountPercent } : {}),
              ...(relationship.sellBonusPercent > 0 ? { relationshipSellBonusPercent: relationship.sellBonusPercent } : {}),
              unlockName: requiredUnlock?.name ?? null,
              unlockDescription: requiredUnlock?.description ?? null,
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
      execute: async ({ tx, current, player, round, ruleset, standings, now }) => {
        if (!ruleset.productEconomy) throw AppError.conflict('PRODUCT_ECONOMY_DISABLED', 'Pip only deals Product this round.');
        if (input.product === CRACK) throw AppError.badRequest('USE_PIP_PRODUCT', 'Buy and sell crack as Product at Pip’s.', { product: 'Crack is sold at Pip’s store.' });
        const economy = productEconomy(ruleset, input.product);
        if (!economy?.pip) throw AppError.badRequest('UNKNOWN_ITEM', 'Pip does not deal that product.', { product: 'Pick a product Pip deals.' });

        if (input.direction === 'buy') {
          const requiredUnlock = PermanentUnlockService.productPurchaseUnlock(ruleset, input.product);
          if (requiredUnlock) {
            const unlockKeys = await PermanentUnlockService.keys(tx, roundPlayerId);
            if (!unlockKeys.has(requiredUnlock.key)) {
              throw AppError.conflict(
                'PRODUCT_PURCHASE_LOCKED',
                `Complete the required job to unlock ${requiredUnlock.name}.`,
              );
            }
          }
        }

        const inventory = await ProductInventoryService.read(tx, roundPlayerId, ruleset);
        const owned = inventory[input.product] ?? 0;
        const shelf = settleProductShelf(await shelfRow(tx, roundPlayerId, input.product), economy, now, shelfInterval(ruleset, standings, economy.pip.restock.intervalMinutes))!;

        const baseRuleset = loadRulesetForRound(round);
        const pressureEnabled = Boolean(ruleset.storeEconomy?.pipProductPressure?.enabled && baseRuleset.travel?.market);
        const market = pressureEnabled
          ? await HighMarketService.lock(tx, baseRuleset, round.id, player.city.slug, input.product, now)
          : null;
        const pressure = pressureFor(ruleset, market?.push ?? 0) ?? 0;
        const quote = pressureQuote(economy.pip.buyCents, economy.pip.sellCents, pressure);
        const favorBonuses = await TimedFavorService.bonuses(tx, roundPlayerId, ruleset, now);
        const relationship = relationshipPriceAdjustments(standings.PIP?.points ?? 0, ruleset, 'PIP');
        const sellUnitCents = boostedSellCents(quote.sellCents, quote.buyCents, relationship.sellBonusPercent) ?? quote.sellCents;
        const buyUnitCents = discountedPipBuyCents(
          quote.buyCents,
          sellUnitCents,
          relationship.buyDiscountPercent + favorBonuses.pipBuyDiscountPercent,
        );
        let trade;
        try {
          trade = calculateProductTrade({
            ruleset,
            product: input.product,
            direction: input.direction,
            quantity: input.quantity,
            owned,
            cashCents: current.cashCents,
            shelfStock: shelf.stock,
            ...(input.direction === 'buy' ? { buyUnitCents } : {}),
            sellUnitCents,
          });
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
        if (market && baseRuleset.travel?.market) {
          const view = marketView(baseRuleset, round.id, player.city.slug, input.product, market.push, now);
          if (view) {
            const fill = fillMarket(view, baseRuleset.travel.market, input.direction, input.quantity);
            await HighMarketService.write(tx, market.id, fill.pushAfter, now);
          }
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
          ...(input.direction === 'buy' && favorBonuses.pipBuyDiscountPercent > 0
            ? { favorDiscountPercent: favorBonuses.pipBuyDiscountPercent }
            : {}),
        };
        return {
          next: { ...current, cashCents: current.cashCents + trade.cashChangeCents },
          result,
          ledger: [{
            source: input.direction === 'buy' ? 'STORE_BUY' : 'STORE_SELL',
            label: `${ruleset.stores.PIP.name} · ${input.direction === 'buy' ? 'buy' : 'sell'} ${trade.productName}`,
            amountCents: trade.cashChangeCents,
          }],
          reputation: credit.credited ? [{ trader: 'PIP', points: credit.points, creditedOn: credit.creditedOn }] : undefined,
          activity: {
            type: input.direction === 'buy' ? 'STORE_BUY' : 'STORE_SELL',
            payload: {
              store: ruleset.stores.PIP.name,
              storeKey: 'PIP',
              item: trade.productName,
              itemKey: trade.product,
              product: trade.product,
              city: player.city.slug,
              direction: trade.direction,
              quantity: trade.quantity,
              totalCents: result.totalCents,
              ...(result.favorDiscountPercent ? { favorDiscountPercent: result.favorDiscountPercent } : {}),
            },
          },
        };
      },
    });
  },
};
