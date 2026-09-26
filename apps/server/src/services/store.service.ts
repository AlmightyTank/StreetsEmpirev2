import type { PrismaClient, Round, RoundPlayer } from '@prisma/client';
import {
  calculateStoreTrade,
  creditDailyTrade,
  findStore,
  hasWeaponAccess,
  maxStoreBuy,
  restockIntervalFor,
  stockOnHand,
  StoreTradeError,
  restockSpeedup,
  tierFor,
  weaponUnlockProgress,
  type RestockSettlement,
  type Ruleset,
  type Standings,
} from '@streets/rules-engine';
import type { HideoutRoomKey, SingleUseFavorEffect, StoreKey, StoreRelationshipPerk, TraderKey } from '@streets/rulesets';
import type {
  GameActionResult,
  StoreCheckoutInput,
  StoreCheckoutLineInput,
  StoreCheckoutResult,
  StoreIntegrationDto,
  StoreMarketContextDto,
  StorePriceContextDto,
  StoreRelationshipDto,
  StoreSpecialOrderDto,
  StoreSpecialOrderInput,
  StoreSpecialOrderResult,
  StoreShipmentDto,
  StoreStockContextDto,
  StoresDto,
  StoreTradeInput,
  StoreTradeResult,
} from '@streets/shared';
import { ActionService, type PlayerState } from './action.service.js';
import type { StockSettlementSet } from './stock.service.js';
import { AppError } from '../utils/errors.js';
import { SingleUseFavorService } from './single-use-favor.service.js';
import type { ReputationChange } from './reputation.service.js';
import type { EconomyLedgerWrite } from './economy-ledger.service.js';
import { TurfService } from './turf.service.js';
import { ProductInventoryService, productKeys } from './product-inventory.service.js';
import { HighMarketService } from './high-market.service.js';
import { marketPrice } from './run-settle.service.js';

type CatalogPlayer = RoundPlayer & { city: { slug: string } };

function discountedBuyCents(buyCents: number, sellCents: number | null, discountPercent: number): number {
  const discounted = Math.floor(buyCents * (100 - Math.min(90, Math.max(0, discountPercent))) / 100);
  return sellCents === null ? Math.max(1, discounted) : Math.max(sellCents + 1, discounted);
}

export function boostedSellCents(sellCents: number | null, buyCents: number, bonusPercent: number): number | null {
  if (sellCents === null || bonusPercent <= 0) return sellCents;
  return Math.min(buyCents - 1, Math.floor(sellCents * (100 + Math.max(0, bonusPercent)) / 100));
}

export function priceContext(currentCents: number, baseCents: number, trend: StorePriceContextDto['trend'] = 'Stable'): StorePriceContextDto {
  const safeBase = Math.max(1, baseCents);
  const ratio = currentCents / safeBase;
  const label = ratio <= 0.8
    ? 'Cheap'
    : ratio < 0.95
      ? 'Below Normal'
      : ratio <= 1.05
        ? 'Normal'
        : ratio < 1.2
          ? 'Above Normal'
          : 'Expensive';
  return {
    label,
    trend,
    baseCents,
    currentCents,
    deltaPercent: Math.round((ratio - 1) * 100),
  };
}

export function stockContext(stock: number | null, cap: number | null): StoreStockContextDto {
  if (stock === null || cap === null) {
    return { label: 'Always Available', stock: null, cap: null, percent: null };
  }
  const safeCap = Math.max(1, cap);
  const percent = Math.max(0, Math.min(100, Math.round((stock / safeCap) * 100)));
  const label = stock <= 0
    ? 'Sold Out'
    : percent <= 10
      ? 'Scarce'
      : percent <= 33
        ? 'Low'
        : percent < 80
          ? 'Normal'
          : 'Plentiful';
  return { label, stock, cap, percent };
}

export function storeMarketContext(input: {
  buyCents: number;
  baseBuyCents?: number;
  sellCents: number | null;
  baseSellCents?: number | null;
  stock: number | null;
  cap: number | null;
  trend?: StorePriceContextDto['trend'];
}): StoreMarketContextDto {
  return {
    buy: priceContext(input.buyCents, input.baseBuyCents ?? input.buyCents, input.trend),
    sell: input.sellCents === null ? null : priceContext(input.sellCents, input.baseSellCents ?? input.sellCents, input.trend),
    stock: stockContext(input.stock, input.cap),
  };
}

function shipmentNews(keeper: string, itemName: string, shipment: Omit<StoreShipmentDto, 'news'>): string {
  const quantity = shipment.quantity.toLocaleString('en-US');
  if (shipment.status === 'DELAYED') return `${keeper}'s ${itemName} shipment is running ${shipment.delayMinutes} minutes late.`;
  if (shipment.status === 'PARTIAL') return `${keeper} only has a short ${itemName} shipment incoming: ${quantity}.`;
  if (shipment.status === 'LARGE') return `${keeper} has an oversized ${itemName} shipment incoming: ${quantity}.`;
  return `${keeper} has ${quantity} ${itemName} incoming.`;
}

function shipmentDto(input: {
  settlement: RestockSettlement;
  trader: string;
  keeper: string;
  itemName: string;
}): StoreShipmentDto | null {
  const shipment = input.settlement.shipment;
  if (!shipment) return null;
  const dto = {
    quantity: shipment.quantity,
    scheduledAt: shipment.scheduledAt.toISOString(),
    arrivesAt: shipment.arrivesAt.toISOString(),
    status: shipment.status,
    delayMinutes: shipment.delayMinutes,
    destinationTrader: input.trader,
    itemName: input.itemName,
  };
  return { ...dto, news: shipmentNews(input.keeper, input.itemName, dto) };
}

function standingTierIndex(points: number, ruleset: Ruleset): number {
  return Math.max(0, ruleset.reputation.tiers.filter((tier) => points >= tier.at).length - 1);
}

export function specialOrderQuote(input: {
  ruleset: Ruleset;
  points: number;
  itemBuyCents: number;
  settled: RestockSettlement;
  now: Date;
  turfBlocksHeld?: number;
}): StoreSpecialOrderDto | null {
  const rules = input.ruleset.storeEconomy?.specialOrders;
  if (!rules?.enabled || input.settled.stock > 0 || input.settled.nextAt === null) return null;
  const tier = standingTierIndex(input.points, input.ruleset);
  const markupPercent = Math.max(5, rules.markupPercent - tier * rules.standingMarkupDiscountPercentPerTier);
  const turfDiscountPercent = turfSpecialOrderDiscountPercent(input.ruleset, input.turfBlocksHeld ?? 0);
  const waitDiscount = Math.max(0, Math.min(0.75, (tier * rules.standingWaitDiscountPercentPerTier) / 100));
  const remainingMinutes = Math.max(1, Math.ceil((input.settled.nextAt.getTime() - input.now.getTime()) / 60_000));
  const waitMinutes = Math.max(
    rules.minWaitMinutes,
    Math.ceil(remainingMinutes * rules.waitMultiplier * (1 - waitDiscount)),
  );
  if (waitMinutes >= remainingMinutes) return null;
  const baseFeeCents = Math.max(1, Math.ceil((input.itemBuyCents * markupPercent) / 100));
  const feeCents = Math.max(1, Math.ceil((baseFeeCents * (100 - turfDiscountPercent)) / 100));
  return {
    feeCents,
    baseFeeCents,
    markupPercent,
    arrivesAt: new Date(input.now.getTime() + waitMinutes * 60_000).toISOString(),
    waitMinutes,
    quantity: Math.max(1, input.settled.perInterval),
    label: `Source ${Math.max(1, input.settled.perInterval).toLocaleString('en-US')} sooner`,
  };
}

function turfSpecialOrderDiscountPercent(ruleset: Ruleset, blocksHeld: number): number {
  const rule = ruleset.storeEconomy?.integrations;
  if (!rule?.enabled || blocksHeld <= 0) return 0;
  return Math.min(
    rule.maxTurfSpecialOrderDiscountPercent,
    blocksHeld * rule.turfSpecialOrderDiscountPercentPerBlock,
  );
}

const HIDEOUT_ROOMS: readonly HideoutRoomKey[] = ['SAFE_ROOM', 'LOOKOUTS', 'WORKSHOP', 'BACK_OFFICE', 'GARAGE'];

const HIDEOUT_FIELDS: Record<HideoutRoomKey, keyof Pick<PlayerState,
  'hideoutSafeRoomLevel' | 'hideoutLookoutsLevel' | 'hideoutWorkshopLevel' | 'hideoutBackOfficeLevel' | 'hideoutGarageLevel'
>> = {
  SAFE_ROOM: 'hideoutSafeRoomLevel',
  LOOKOUTS: 'hideoutLookoutsLevel',
  WORKSHOP: 'hideoutWorkshopLevel',
  BACK_OFFICE: 'hideoutBackOfficeLevel',
  GARAGE: 'hideoutGarageLevel',
};

function hideoutIntegration(ruleset: Ruleset, player: PlayerState): StoreIntegrationDto['hideout'] {
  const candidates = HIDEOUT_ROOMS.flatMap((room) => {
    const rule = ruleset.hideout?.rooms[room];
    if (!rule) return [];
    const level = player[HIDEOUT_FIELDS[room]];
    const cost = level >= rule.maxLevel ? null : rule.costsCents[level] ?? null;
    return cost && cost > 0 ? [{ name: rule.name, cost }] : [];
  }).sort((a, b) => a.cost - b.cost);
  const next = candidates[0];
  if (!next) return { nextUpgradeName: null, nextUpgradeCostCents: null, cashShortCents: 0, ready: false };
  const cashShortCents = Math.max(0, next.cost - Number(player.cashCents));
  return {
    nextUpgradeName: next.name,
    nextUpgradeCostCents: next.cost,
    cashShortCents,
    ready: cashShortCents === 0,
  };
}

async function travelIntegration(
  prisma: PrismaClient,
  roundPlayerId: string,
  ruleset: Ruleset,
  round: Round | undefined,
  player: CatalogPlayer | undefined,
  now: Date,
): Promise<StoreIntegrationDto['travel']> {
  const minProfit = ruleset.storeEconomy?.integrations?.travelOpportunityMinProfitPercent;
  if (!ruleset.travel?.market || !round || !player || minProfit === undefined) return null;
  const inventory = await ProductInventoryService.read(prisma, roundPlayerId, ruleset);
  const held = productKeys(ruleset).filter((key) => (inventory[key] ?? 0) > 0);
  if (held.length === 0) return null;
  let best: StoreIntegrationDto['travel'] = null;
  for (const city of Object.keys(ruleset.cities ?? {})) {
    if (city === player.city.slug) continue;
    const pushes = await HighMarketService.pushes(prisma, ruleset, round.id, city, now);
    for (const key of held) {
      const remote = marketPrice(ruleset, round.id, city, key, pushes.get(key) ?? 0, now);
      const localSellCents = key === 'CRACK'
        ? ruleset.stores.PIP.items.CRACK?.sellCents ?? 0
        : ruleset.products?.[key]?.economy?.pip?.sellCents ?? 0;
      if (!remote || localSellCents <= 0 || remote.sellCents <= localSellCents) continue;
      const deltaPercent = Math.round(((remote.sellCents / localSellCents) - 1) * 100);
      if (deltaPercent < minProfit || (best && deltaPercent <= best.deltaPercent)) continue;
      best = {
        product: key,
        productName: ruleset.products?.[key]?.name ?? (key === 'CRACK' ? 'Crack' : key),
        city,
        cityName: ruleset.cities?.[city]?.name ?? city,
        localSellCents,
        remoteSellCents: remote.sellCents,
        deltaPercent,
      };
    }
  }
  return best;
}

async function convoyIntegration(
  prisma: PrismaClient,
  roundPlayerId: string,
  incomingShipments: number,
): Promise<StoreIntegrationDto['convoy']> {
  const activeRuns = await prisma.run.count({ where: { roundPlayerId, status: 'ACTIVE' } });
  if (activeRuns === 0 && incomingShipments === 0) return null;
  return {
    activeRuns,
    incomingShipments,
    label: incomingShipments > 0
      ? 'Shipments are visible economy events; convoy hooks can consume them.'
      : 'Active runs can compare city counters and market prices while moving.',
  };
}

type StoreBuyDiscountEffect = Extract<SingleUseFavorEffect, { kind: 'STORE_BUY_DISCOUNT' }>;

type StoreDiscount = { id: string; key: string; effect: StoreBuyDiscountEffect };

function traderPerks(ruleset: Ruleset, trader: StoreKey): readonly StoreRelationshipPerk[] {
  return [...(ruleset.storeEconomy?.traderPerks?.[trader] ?? [])].sort((a, b) => a.at - b.at);
}

function perkDto(perk: StoreRelationshipPerk) {
  return {
    label: perk.label,
    description: perk.description,
    ...(perk.buyDiscountPercent ? { buyDiscountPercent: perk.buyDiscountPercent } : {}),
    ...(perk.sellBonusPercent ? { sellBonusPercent: perk.sellBonusPercent } : {}),
  };
}

export function relationshipState(points: number, ruleset: Ruleset, trader: StoreKey): StoreRelationshipDto | undefined {
  const perks = traderPerks(ruleset, trader);
  if (perks.length === 0) return undefined;
  const current = perks.filter((perk) => points >= perk.at).at(-1) ?? null;
  const next = perks.find((perk) => points < perk.at) ?? null;
  return {
    current: current ? perkDto(current) : null,
    next: next ? { ...perkDto(next), at: next.at, pointsRemaining: next.at - points } : null,
  };
}

export function relationshipPriceAdjustments(
  points: number,
  ruleset: Ruleset,
  trader: StoreKey,
): { buyDiscountPercent: number; sellBonusPercent: number } {
  const current = traderPerks(ruleset, trader).filter((perk) => points >= perk.at).at(-1);
  return {
    buyDiscountPercent: current?.buyDiscountPercent ?? 0,
    sellBonusPercent: current?.sellBonusPercent ?? 0,
  };
}

function storeTradeBadRequest(error: StoreTradeError, line?: number): AppError {
  const field = line === undefined ? error.field : 'lines';
  const message = line === undefined ? error.message : `Line ${line}: ${error.message}`;
  return AppError.badRequest(error.code, message, field ? { [field]: message } : undefined);
}

function normalizeStoreLine(
  ruleset: Ruleset,
  input: StoreCheckoutLineInput,
): {
  foundStore: ReturnType<typeof findStore>;
  normalized: StoreCheckoutLineInput;
} {
  const foundStore = findStore(ruleset, input.store);
  return {
    foundStore,
    normalized: {
      ...input,
      store: foundStore?.key ?? input.store.trim().toUpperCase(),
      item: input.item.trim().toUpperCase(),
    },
  };
}

function quoteForLine(
  ruleset: Ruleset,
  standings: Standings,
  discount: StoreDiscount | null,
  foundStore: ReturnType<typeof findStore>,
  input: StoreCheckoutLineInput,
): {
  buyUnitCents?: number;
  sellUnitCents?: number | null;
  favorApplies: boolean;
  relationshipBuyDiscountPercent: number;
  relationshipSellBonusPercent: number;
} {
  if (!foundStore) return { favorApplies: false, relationshipBuyDiscountPercent: 0, relationshipSellBonusPercent: 0 };
  const storeItem = Object.hasOwn(foundStore.store.items, input.item)
    ? foundStore.store.items[input.item]
    : undefined;
  if (!storeItem) return { favorApplies: false, relationshipBuyDiscountPercent: 0, relationshipSellBonusPercent: 0 };
  const trader = foundStore.key as TraderKey;
  const relationship = relationshipPriceAdjustments(standings[trader]?.points ?? 0, ruleset, foundStore.key);
  const sellUnitCents = boostedSellCents(storeItem.sellCents, storeItem.buyCents, relationship.sellBonusPercent);
  const favorApplies = Boolean(
    discount
    && input.direction === 'buy'
    && discount.effect.storeKey === foundStore.key
    && discount.effect.itemKeys.includes(input.item),
  );
  const buyDiscountPercent = relationship.buyDiscountPercent + (favorApplies ? discount!.effect.discountPercent : 0);
  const buyUnitCents = buyDiscountPercent > 0
    ? discountedBuyCents(storeItem.buyCents, sellUnitCents, buyDiscountPercent)
    : undefined;
  return {
    ...(buyUnitCents !== undefined ? { buyUnitCents } : {}),
    ...(sellUnitCents !== storeItem.sellCents ? { sellUnitCents } : {}),
    favorApplies,
    relationshipBuyDiscountPercent: relationship.buyDiscountPercent,
    relationshipSellBonusPercent: relationship.sellBonusPercent,
  };
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
    options: {
      now?: Date;
      round?: Round;
      playerRow?: CatalogPlayer;
      turfBlocksHeld?: number;
    } = {},
  ): Promise<StoresDto> {
    const now = options.now ?? new Date();
    const armed = await SingleUseFavorService.matching(prisma, roundPlayerId, ruleset, 'STORE_BUY_DISCOUNT');
    const discount = armed?.effect.kind === 'STORE_BUY_DISCOUNT' ? armed.effect : null;
    let incomingShipments = 0;
    const stores = Object.entries(ruleset.stores).map(([key, store]) => {
        const news: string[] = [];
        const items = Object.entries(store.items).map(([itemKey, item]) => {
          const onHand = stockOnHand(player, item);
          const settled = item.restock ? stock.byField[item.restock.stockField] ?? null : null;
          const shipment = settled ? shipmentDto({ settlement: settled, trader: key, keeper: store.keeper, itemName: item.name }) : null;
          if (shipment) incomingShipments += 1;
          const specialOrder = settled && item.restock && (!item.unlockKey || hasWeaponAccess(player, item.unlockKey))
            ? specialOrderQuote({
                ruleset,
                points: standings[key as TraderKey]?.points ?? 0,
                itemBuyCents: item.buyCents,
                settled,
                now,
                turfBlocksHeld: options.turfBlocksHeld,
              })
            : null;
          if (shipment && shipment.status !== 'ON_TIME') news.push(shipment.news);
          if (settled && settled.gained > 0) {
            news.push(`${store.keeper} just unloaded ${settled.gained.toLocaleString('en-US')} ${item.name}.`);
          }
          const relationship = relationshipPriceAdjustments(standings[key as TraderKey]?.points ?? 0, ruleset, key as StoreKey);
          const quotedSellCents = boostedSellCents(item.sellCents, item.buyCents, relationship.sellBonusPercent);
          const favorApplies = Boolean(
            discount
            && discount.storeKey === key
            && discount.itemKeys.includes(itemKey),
          );
          const buyDiscountPercent = relationship.buyDiscountPercent + (favorApplies ? discount!.discountPercent : 0);
          const quotedBuyCents = buyDiscountPercent > 0
            ? discountedBuyCents(item.buyCents, quotedSellCents, buyDiscountPercent)
            : item.buyCents;
          const quotedItem = quotedBuyCents === item.buyCents && quotedSellCents === item.sellCents
            ? item
            : { ...item, buyCents: quotedBuyCents, sellCents: quotedSellCents };
          const shelfStock = settled?.stock ?? null;
          const shelfCap = settled?.cap ?? null;
          return {
            key: itemKey, ...item,
            buyCents: quotedBuyCents,
            sellCents: quotedSellCents,
            ...(quotedBuyCents !== item.buyCents ? {
              baseBuyCents: item.buyCents,
            } : {}),
            ...(favorApplies ? {
              favorDiscountPercent: discount!.discountPercent,
            } : {}),
            ...(relationship.buyDiscountPercent > 0 ? { relationshipBuyDiscountPercent: relationship.buyDiscountPercent } : {}),
            ...(relationship.sellBonusPercent > 0 ? { relationshipSellBonusPercent: relationship.sellBonusPercent } : {}),
            owned: player[item.field],
            unlock: item.unlockKey
              ? weaponUnlockProgress(player, standings, item.unlockKey, ruleset)
              : null,
            maxBuy: item.unlockKey && !hasWeaponAccess(player, item.unlockKey)
              ? 0 : maxStoreBuy(player.cashCents, player[item.field], quotedItem, onHand),
            market: storeMarketContext({
              buyCents: quotedBuyCents,
              baseBuyCents: item.buyCents,
              sellCents: quotedSellCents,
              baseSellCents: item.sellCents,
              stock: shelfStock,
              cap: shelfCap,
            }),
            restock: item.restock && settled
              ? {
                  stock: settled.stock,
                  cap: settled.cap,
                  intervalMinutes: settled.intervalMinutes,
                  perInterval: settled.perInterval,
                  nextAt: settled.nextAt ? settled.nextAt.toISOString() : null,
                  shipment,
                  specialOrder,
                }
              : null,
          };
        });
        return {
          key, slug: store.slug, name: store.name, keeper: store.keeper, blurb: store.blurb,
          standing: tierFor(standings[key as TraderKey]?.points ?? 0, ruleset).name,
          reputation: standings[key as TraderKey]?.points ?? 0,
          restockSpeedup: Math.round(restockSpeedup(standings[key as TraderKey]?.points ?? 0, ruleset) * 100),
          relationship: relationshipState(standings[key as TraderKey]?.points ?? 0, ruleset, key as StoreKey),
          ...(news.length ? { news: news.slice(0, 3) } : {}),
          items,
        };
      });
    const integrationRule = ruleset.storeEconomy?.integrations;
    const integrations: StoreIntegrationDto | undefined = integrationRule?.enabled ? {
      hideout: hideoutIntegration(ruleset, player),
      turf: options.turfBlocksHeld !== undefined
        ? {
            blocksHeld: options.turfBlocksHeld,
            specialOrderDiscountPercent: turfSpecialOrderDiscountPercent(ruleset, options.turfBlocksHeld),
            label: options.turfBlocksHeld > 0 ? 'Held turf trims special-order sourcing fees.' : 'Hold local blocks to trim special-order sourcing fees.',
          }
        : null,
      travel: await travelIntegration(prisma, roundPlayerId, ruleset, options.round, options.playerRow, now),
      convoy: await convoyIntegration(prisma, roundPlayerId, incomingShipments),
    } : undefined;
    return {
      stores,
      bulkHelpers: [...ruleset.storeBulkHelpers],
      lowRiderThugCapacity: ruleset.lowRiderThugCapacity,
      productCounter: Boolean(ruleset.productEconomy),
      ...(integrations ? { integrations } : {}),
    };
  },

  trade(prisma: PrismaClient, roundPlayerId: string, input: StoreTradeInput): Promise<GameActionResult<StoreTradeResult>> {
    return ActionService.run<StoreTradeResult>(prisma, roundPlayerId, {
      action: input.direction === 'buy' ? 'STORE_BUY' : 'STORE_SELL',
      actionId: input.actionId,
      execute: async ({ tx, current, player, ruleset, standings, now }) => {
        const foundStore = findStore(ruleset, input.store);
        const normalizedItem = input.item.trim().toUpperCase();
        const normalizedInput = { ...input, store: foundStore?.key ?? input.store.trim().toUpperCase(), item: normalizedItem };
        const armed = input.direction === 'buy'
          ? await SingleUseFavorService.matching(tx, roundPlayerId, ruleset, 'STORE_BUY_DISCOUNT')
          : null;
        const discount: { id: string; key: string; effect: StoreBuyDiscountEffect } | null = armed?.effect.kind === 'STORE_BUY_DISCOUNT'
          && foundStore
          && armed.effect.storeKey === foundStore.key
          && armed.effect.itemKeys.includes(normalizedItem)
          ? { id: armed.id, key: armed.key, effect: armed.effect }
          : null;
        const storeItem = foundStore && Object.hasOwn(foundStore.store.items, normalizedItem)
          ? foundStore.store.items[normalizedItem]
          : undefined;
        const quote = quoteForLine(ruleset, standings, discount, foundStore, normalizedInput);

        let trade;
        try {
          trade = calculateStoreTrade(
            current,
            normalizedInput,
            ruleset,
            quote.buyUnitCents === undefined && quote.sellUnitCents === undefined
              ? undefined
              : { buyUnitCents: quote.buyUnitCents, sellUnitCents: quote.sellUnitCents },
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
        const trader = normalizedInput.store as TraderKey;
        const credit = creditDailyTrade(standings[trader], now, ruleset);

        if (discount && quote.favorApplies) await SingleUseFavorService.consume(tx, discount.id);

        const result: StoreTradeResult = {
          ...priced, direction: input.direction, quantity: input.quantity,
          totalCents: Number(trade.totalCents), cashChangeCents: Number(trade.cashChangeCents),
          reputationGained: credit.gained,
          ...(quote.favorApplies && discount ? {
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
              storeKey: normalizedInput.store,
              item: trade.itemName,
              itemKey: normalizedInput.item,
              city: player.city.slug,
              ...(normalizedInput.store === 'PIP' && ruleset.products?.[normalizedInput.item] ? { product: normalizedInput.item } : {}),
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

  specialOrder(prisma: PrismaClient, roundPlayerId: string, input: StoreSpecialOrderInput): Promise<GameActionResult<StoreSpecialOrderResult>> {
    return ActionService.run<StoreSpecialOrderResult>(prisma, roundPlayerId, {
      action: 'STORE_SPECIAL_ORDER',
      actionId: input.actionId,
      execute: async ({ tx, current, player, ruleset, standings, stock, now }) => {
        const foundStore = findStore(ruleset, input.store);
        const itemKey = input.item.trim().toUpperCase();
        if (!foundStore) throw AppError.badRequest('UNKNOWN_STORE', 'That store is not open.', { store: 'Pick a store.' });
        const item = Object.hasOwn(foundStore.store.items, itemKey)
          ? foundStore.store.items[itemKey]
          : undefined;
        if (!item) throw AppError.badRequest('UNKNOWN_ITEM', 'That item is not sold at this store.', { item: 'Pick an item.' });
        if (!item.restock) throw AppError.badRequest('SPECIAL_ORDER_UNAVAILABLE', 'That item does not need special sourcing.', { item: 'Pick a scarce item.' });
        if (item.unlockKey && !hasWeaponAccess(current, item.unlockKey)) {
          throw AppError.conflict('WEAPON_LOCKED', `Complete Tommy’s favor to unlock ${item.name} purchases.`);
        }
        const settled = stock.byField[item.restock.stockField];
        if (!settled) throw AppError.conflict('SPECIAL_ORDER_UNAVAILABLE', 'That shelf is not available right now.');
        if (settled.stock > 0) throw AppError.conflict('SPECIAL_ORDER_IN_STOCK', `${foundStore.store.keeper} has ${item.name} on the shelf right now.`);

        const trader = foundStore.key as TraderKey;
        const turf = await TurfService.summary(tx, roundPlayerId, ruleset, now);
        const quote = specialOrderQuote({
          ruleset,
          points: standings[trader]?.points ?? 0,
          itemBuyCents: item.buyCents,
          settled,
          now,
          turfBlocksHeld: turf?.blocksHeld ?? 0,
        });
        if (!quote) throw AppError.conflict('SPECIAL_ORDER_UNAVAILABLE', 'No special source can beat the incoming delivery right now.');
        if (BigInt(quote.feeCents) > current.cashCents) {
          throw AppError.badRequest('NOT_ENOUGH_CASH', `You need ${quote.feeCents.toLocaleString('en-US')} cents to source that order.`, { cashCents: 'Not enough cash.' });
        }

        const arrivesAt = new Date(quote.arrivesAt);
        const intervalMinutes = restockIntervalFor(item.restock.intervalMinutes, standings[trader]?.points ?? 0, ruleset);
        const sourcedStockAt = new Date(arrivesAt.getTime() - intervalMinutes * 60_000);
        stock.clocks[item.restock.stockAtField] = sourcedStockAt;

        const result: StoreSpecialOrderResult = {
          storeKey: foundStore.key,
          storeName: foundStore.store.name,
          itemKey,
          itemName: item.name,
          feeCents: quote.feeCents,
          cashChangeCents: -quote.feeCents,
          stockArrivesAt: quote.arrivesAt,
          waitMinutes: quote.waitMinutes,
        };
        // 0.9.0-G: "your special order arrived" fires from the alert collector when it lands.
        await tx.scheduledAlert.create({
          data: {
            roundPlayerId,
            kind: 'SPECIAL_ORDER',
            dueAt: arrivesAt,
            payload: { store: foundStore.store.name, storeKey: foundStore.key, item: item.name, itemKey },
          },
        });

        return {
          next: { ...current, cashCents: current.cashCents - BigInt(quote.feeCents) },
          result,
          ledger: [{
            source: 'STORE_SPECIAL_ORDER',
            label: `${foundStore.store.name} · source ${item.name}`,
            amountCents: -quote.feeCents,
          }],
          activity: {
            type: 'STORE_BUY',
            payload: {
              store: foundStore.store.name,
              storeKey: foundStore.key,
              item: item.name,
              itemKey,
              city: player.city.slug,
              specialOrder: true,
              feeCents: quote.feeCents,
              stockArrivesAt: quote.arrivesAt,
            },
          },
        };
      },
    });
  },

  checkout(prisma: PrismaClient, roundPlayerId: string, input: StoreCheckoutInput): Promise<GameActionResult<StoreCheckoutResult>> {
    return ActionService.run<StoreCheckoutResult>(prisma, roundPlayerId, {
      action: 'STORE_CHECKOUT',
      actionId: input.actionId,
      execute: async ({ tx, current, player, ruleset, standings, now }) => {
        const armed = await SingleUseFavorService.matching(tx, roundPlayerId, ruleset, 'STORE_BUY_DISCOUNT');
        const discount: StoreDiscount | null = armed?.effect.kind === 'STORE_BUY_DISCOUNT'
          ? { id: armed.id, key: armed.key, effect: armed.effect }
          : null;
        let discountApplied = false;

        const next: PlayerState = { ...current };
        const results: StoreTradeResult[] = [];
        const ledger: EconomyLedgerWrite[] = [];
        const reputation: ReputationChange[] = [];
        const creditedTraders = new Set<TraderKey>();

        for (const [index, line] of input.lines.entries()) {
          const { foundStore, normalized } = normalizeStoreLine(ruleset, line);
          const quote = quoteForLine(ruleset, standings, discount, foundStore, normalized);
          let trade;
          try {
            trade = calculateStoreTrade(
              next,
              normalized,
              ruleset,
              quote.buyUnitCents === undefined && quote.sellUnitCents === undefined
                ? undefined
                : { buyUnitCents: quote.buyUnitCents, sellUnitCents: quote.sellUnitCents },
            );
          } catch (error) {
            if (error instanceof StoreTradeError) {
              throw storeTradeBadRequest(error, index + 1);
            }
            throw error;
          }
          const { stockField, stockTaken, ...priced } = trade;
          const trader = normalized.store as TraderKey;
          const credit = creditedTraders.has(trader)
            ? { credited: false as const, gained: 0, points: 0, creditedOn: null }
            : creditDailyTrade(standings[trader], now, ruleset);
          creditedTraders.add(trader);

          const storeItem = foundStore && Object.hasOwn(foundStore.store.items, normalized.item)
            ? foundStore.store.items[normalized.item]
            : undefined;
          const result: StoreTradeResult = {
            ...priced,
            direction: normalized.direction,
            quantity: normalized.quantity,
            totalCents: Number(trade.totalCents),
            cashChangeCents: Number(trade.cashChangeCents),
            reputationGained: credit.gained,
            ...(quote.favorApplies && discount && storeItem ? {
              favorKey: discount.key,
              favorDiscountPercent: discount.effect.discountPercent,
              baseUnitCents: storeItem.buyCents,
            } : {}),
          };

          if (quote.favorApplies) discountApplied = true;
          results.push(result);
          ledger.push({
            source: normalized.direction === 'buy' ? 'STORE_BUY' : 'STORE_SELL',
            label: `${trade.storeName} · ${normalized.direction === 'buy' ? 'buy' : 'sell'} ${trade.itemName}`,
            amountCents: trade.cashChangeCents,
          });
          if (credit.credited) {
            reputation.push({ trader, points: credit.points, creditedOn: credit.creditedOn });
          }

          next.cashCents += trade.cashChangeCents;
          next[trade.field] += trade.quantityChange;
          if (stockField) next[stockField] -= stockTaken;
        }

        if (discount && discountApplied) await SingleUseFavorService.consume(tx, discount.id);

        const cashChangeCents = results.reduce((sum, line) => sum + line.cashChangeCents, 0);
        const totalCents = results.reduce((sum, line) => sum + line.totalCents, 0);
        const itemCount = results.reduce((sum, line) => sum + line.quantity, 0);
        const result: StoreCheckoutResult = {
          lines: results,
          totalCents,
          cashChangeCents,
          lineCount: results.length,
          itemCount,
          reputation: reputation.map((entry) => ({ trader: entry.trader, points: entry.points })),
        };

        return {
          next,
          result,
          ledger,
          reputation: reputation.length ? reputation : undefined,
          activity: {
            type: cashChangeCents < 0 ? 'STORE_BUY' : 'STORE_SELL',
            payload: {
              city: player.city.slug,
              lineCount: result.lineCount,
              itemCount: result.itemCount,
              totalCents: result.totalCents,
              cashChangeCents: result.cashChangeCents,
              lines: results.map((line) => ({
                store: line.storeName,
                storeKey: line.storeKey,
                item: line.itemName,
                direction: line.direction,
                quantity: line.quantity,
                totalCents: line.totalCents,
                ...(line.favorKey ? { favorKey: line.favorKey } : {}),
                ...(line.favorDiscountPercent ? { favorDiscountPercent: line.favorDiscountPercent } : {}),
              })),
            },
          },
        };
      },
    });
  },
};
