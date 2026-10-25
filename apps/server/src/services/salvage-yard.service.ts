import type { Prisma, PrismaClient } from '@prisma/client';
import { ammoNetWorthCentsPerRound, playerBoardPartBookCents, playerBoardTradeTopUpCents, type Ruleset } from '@streets/rules-engine';
import type { SalvageGoodDto, SalvageOfferDto, SalvagePriceDto, SalvageTradeResult, SalvageYardDto, ScavengeRarityDto } from '@streets/shared';
import { AppError } from '../utils/errors.js';
import { lockRoundPlayer } from '../utils/db.js';
import { EconomyLedgerService } from './economy-ledger.service.js';
import { recordHideoutEconomy } from './hideout-economy-telemetry.service.js';
import { COMPONENTS, componentDto, jsonObject } from './scavenging.service.js';

/**
 * The Salvage Yard: the shop counter for hideout building materials, so no build
 * waits on a lucky scouting drop. Everyday parts sell for cash. The yard will not
 * take money for the scarce ones; those are bartered for parts and store goods,
 * every one of which can itself be bought, so nothing is ever out of reach.
 *
 * On a round with the Board on, parts count toward rank at their books, so a barter that turns a
 * little book into a lot would mint rank. There each barter also asks for the cash that makes up
 * the difference at the cash weight (`playerBoardTradeTopUpCents`). Other rounds trade as before.
 */

type Barter = { components: Record<string, number>; goods: Partial<Record<SalvageGoodDto, number>> };
type BarterPrice = { kind: 'BARTER'; cashCents: number } & Barter;

const CASH_CENTS: Partial<Record<ScavengeRarityDto, number>> = { COMMON: 10_000, UNCOMMON: 30_000 };

const BARTERS: Record<string, Barter> = {
  MOTOR_ASSEMBLY: { components: { SCRAP_METAL: 4, TOOL_KIT: 1 }, goods: { beer: 20 } },
  REPAIR_SUPPLIES: { components: { TOOL_KIT: 2, CLOTH: 2 }, goods: { medicine: 5 } },
  SPECIALTY_CONTAINER: { components: { PACKAGING: 3, BOTTLES: 2 }, goods: { condoms: 25 } },
  PRECISION_PARTS: { components: { MOTOR_ASSEMBLY: 1, WIRING: 4 }, goods: { ammo: 40 } },
  ADVANCED_MEDICAL: { components: { BASIC_MEDICINE: 2, CLOTH: 3 }, goods: { medicine: 15 } },
  HIGH_CAPACITY_FUEL_CELL: { components: { FUEL_CAN: 4, PRECISION_PARTS: 1 }, goods: { beer: 50 } },
  SPECIALIST_CIRCUITRY: { components: { RADIO: 3, PRECISION_PARTS: 1, WIRING: 4 }, goods: {} },
};

const GOOD_NAMES: Record<SalvageGoodDto, string> = { condoms: 'Condoms', medicine: 'Medicine', beer: 'Beer', ammo: 'Ammo' };
const GOODS = Object.keys(GOOD_NAMES) as SalvageGoodDto[];

export const MAX_SALVAGE_TRADE = 25;

const componentName = (key: string) => COMPONENTS.find((row) => row.key === key)?.name ?? key;

/** What one store good takes off net worth when it is handed over: its value in `economy.netWorth`. */
function goodBookCents(good: SalvageGoodDto, ruleset: Ruleset): number {
  const values = ruleset.economy.netWorth;
  if (good === 'ammo') return ammoNetWorthCentsPerRound(ruleset);
  return { condoms: values.perCondomCents, medicine: values.perMedicineCents, beer: values.perBeerCents }[good];
}

/** The book a barter hands over: its parts at their books plus its goods at their net worth. */
export function barterInputBookCents(barter: Barter, ruleset: Ruleset): number {
  let total = 0;
  for (const [part, quantity] of Object.entries(barter.components)) total += (playerBoardPartBookCents(part, ruleset) ?? 0) * quantity;
  for (const [good, quantity] of Object.entries(barter.goods) as Array<[SalvageGoodDto, number]>) total += goodBookCents(good, ruleset) * quantity;
  return total;
}

/**
 * The yard's price for one unit of a component, or null when it does not deal in it. With a
 * Board ruleset, a barter carries the cash top-up that keeps it from raising rank.
 */
export function salvagePrice(key: string, ruleset?: Ruleset): { kind: 'CASH'; cents: number } | BarterPrice | null {
  const definition = COMPONENTS.find((row) => row.key === key);
  if (!definition) return null;
  const barter = BARTERS[key];
  if (barter) {
    const outputBook = ruleset ? playerBoardPartBookCents(key, ruleset) : null;
    const cashCents = ruleset && outputBook !== null ? playerBoardTradeTopUpCents(outputBook, barterInputBookCents(barter, ruleset), ruleset) : 0;
    return { kind: 'BARTER', cashCents, ...barter };
  }
  const cents = CASH_CENTS[definition.rarity];
  return cents ? { kind: 'CASH', cents } : null;
}

type YardPlayer = { cashCents: bigint; scavengedComponents: Prisma.JsonValue } & Record<SalvageGoodDto, number>;
const yardSelect = { cashCents: true, scavengedComponents: true, condoms: true, medicine: true, beer: true, ammo: true } as const;

function maxQuantity(price: NonNullable<ReturnType<typeof salvagePrice>>, player: YardPlayer, components: Record<string, number>): number {
  if (price.kind === 'CASH') return Math.min(MAX_SALVAGE_TRADE, Number(player.cashCents / BigInt(price.cents)));
  const limits = [
    ...Object.entries(price.components).map(([key, quantity]) => Math.floor((components[key] ?? 0) / quantity)),
    ...Object.entries(price.goods).map(([key, quantity]) => Math.floor(player[key as SalvageGoodDto] / quantity!)),
    ...(price.cashCents > 0 ? [Number(player.cashCents / BigInt(price.cashCents))] : []),
  ];
  return Math.min(MAX_SALVAGE_TRADE, ...limits);
}

function priceDto(price: NonNullable<ReturnType<typeof salvagePrice>>): SalvagePriceDto {
  if (price.kind === 'CASH') return price;
  return {
    kind: 'BARTER',
    ...(price.cashCents > 0 ? { cashCents: price.cashCents } : {}),
    components: Object.entries(price.components).map(([key, quantity]) => ({ key, name: componentName(key), quantity })),
    goods: Object.entries(price.goods).map(([key, quantity]) => ({ key: key as SalvageGoodDto, name: GOOD_NAMES[key as SalvageGoodDto], quantity: quantity! })),
  };
}

function yardDto(player: YardPlayer, ruleset?: Ruleset): SalvageYardDto {
  const components = jsonObject(player.scavengedComponents, {});
  const offers: SalvageOfferDto[] = [];
  for (const { key, name, rarity, purpose } of COMPONENTS) {
    const price = salvagePrice(key, ruleset);
    if (!price) continue;
    offers.push({ key, name, rarity, purpose, price: priceDto(price), owned: components[key] ?? 0, maxQuantity: maxQuantity(price, player, components) });
  }
  return {
    offers,
    goods: Object.fromEntries(GOODS.map((good) => [good, player[good]])) as Record<SalvageGoodDto, number>,
    maxPerTrade: MAX_SALVAGE_TRADE,
  };
}

function dollars(cents: number): string { return `$${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`; }

export const SalvageYardService = {
  /** `ruleset` is the round's pinned ruleset; it only changes prices when the Board is on. */
  async page(prisma: PrismaClient, roundPlayerId: string, ruleset?: Ruleset): Promise<SalvageYardDto> {
    const player = await prisma.roundPlayer.findUnique({ where: { id: roundPlayerId }, select: yardSelect });
    if (!player) throw AppError.notFound('PLAYER_NOT_FOUND', 'Player not found.');
    return yardDto(player, ruleset);
  },

  async trade(prisma: PrismaClient, roundPlayerId: string, key: string, quantity: number, now = new Date(), ruleset?: Ruleset): Promise<SalvageTradeResult> {
    const price = salvagePrice(key, ruleset);
    if (!price) throw AppError.badRequest('UNKNOWN_COMPONENT', 'The Salvage Yard does not deal in that.');
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_SALVAGE_TRADE) {
      throw AppError.badRequest('INVALID_QUANTITY', `Trade between 1 and ${MAX_SALVAGE_TRADE} at a time.`);
    }
    return prisma.$transaction(async (tx) => {
      await lockRoundPlayer(tx, roundPlayerId);
      const player = await tx.roundPlayer.findUnique({ where: { id: roundPlayerId }, select: yardSelect });
      if (!player) throw AppError.notFound('PLAYER_NOT_FOUND', 'Player not found.');
      const components = jsonObject(player.scavengedComponents, {});
      const data: Prisma.RoundPlayerUpdateInput = {};
      const gave: SalvageTradeResult['gave'] = [];
      let spentCents = 0;

      if (price.kind === 'CASH') {
        spentCents = price.cents * quantity;
        if (player.cashCents < BigInt(spentCents)) throw AppError.badRequest('NOT_ENOUGH_CASH', `You need ${dollars(spentCents)} for that order.`);
        data.cashCents = player.cashCents - BigInt(spentCents);
      } else {
        spentCents = price.cashCents * quantity;
        if (player.cashCents < BigInt(spentCents)) throw AppError.badRequest('NOT_ENOUGH_CASH', `The yard also wants ${dollars(spentCents)} for that.`);
        if (spentCents > 0) data.cashCents = player.cashCents - BigInt(spentCents);
        for (const [part, each] of Object.entries(price.components)) {
          const needed = each * quantity;
          if ((components[part] ?? 0) < needed) throw AppError.badRequest('NOT_ENOUGH_TO_TRADE', `The yard wants ${needed} ${componentName(part).toLowerCase()} for that.`);
        }
        for (const [good, each] of Object.entries(price.goods) as Array<[SalvageGoodDto, number]>) {
          const needed = each * quantity;
          if (player[good] < needed) throw AppError.badRequest('NOT_ENOUGH_TO_TRADE', `The yard wants ${needed} ${GOOD_NAMES[good].toLowerCase()} for that.`);
        }
        for (const [part, each] of Object.entries(price.components)) {
          components[part] = (components[part] ?? 0) - each * quantity;
          if (components[part]! <= 0) delete components[part];
          gave.push({ key: part, name: componentName(part), quantity: each * quantity });
        }
        for (const [good, each] of Object.entries(price.goods) as Array<[SalvageGoodDto, number]>) {
          data[good] = player[good] - each * quantity;
          gave.push({ key: good, name: GOOD_NAMES[good], quantity: each * quantity });
        }
      }

      if (!components[key]) {
        // Same rule as scouting: a part you do not already stack needs a free stash cell.
        // Parts traded away completely this turn free their cell first.
        const { StashService } = await import('./stash.service.js');
        const stash = await StashService.page(tx, roundPlayerId);
        const freed = gave.filter((item) => !components[item.key] && stash.items.some((cell) => cell.key === item.key)).length;
        if (stash.usedCells - freed >= stash.totalCells) {
          throw AppError.conflict('STASH_FULL', 'There is no room in the stash for a new part. Upgrade Storage or clear a slot.');
        }
      }
      components[key] = (components[key] ?? 0) + quantity;
      data.scavengedComponents = components as Prisma.InputJsonValue;

      const updated = await tx.roundPlayer.update({ where: { id: roundPlayerId }, data, select: yardSelect });
      if (spentCents > 0) {
        await EconomyLedgerService.record(tx, roundPlayerId, [{ source: 'SALVAGE_YARD', label: 'Salvage Yard', amountCents: -spentCents, metadata: { itemKey: key, quantity } }], now);
      }
      await recordHideoutEconomy(tx, roundPlayerId, 'COMPONENT_BOUGHT', { itemKey: key, quantity, payload: { spentCents, gave } });
      return { yard: yardDto(updated, ruleset), received: componentDto(key, quantity), spentCents, gave };
    });
  },
};
