import type { PrismaClient } from '@prisma/client';
import { productEconomy, type Ruleset } from '@streets/rules-engine';
import { territoryCatalogForRuleset } from '@streets/rulesets';
import type { GameActionResult, TerritoryYieldCollection } from '@streets/shared';
import { AppError } from '../utils/errors.js';
import { ActionService } from './action.service.js';
import { ProductInventoryService } from './product-inventory.service.js';
import { territoryFeatureEnabled, territoryPerkCityControlFromRows } from './territory-perks.service.js';
import { cityTerritoryControlIntervals, districtTerritoryControlIntervals, settlePersistedTerritoryYield } from './territory-yield.service.js';
import { allocateTerritoryYield } from './territory-yield-budget.js';

export function territoryYieldUnitValueCents(ruleset: Ruleset, key: string): number {
  const product = productEconomy(ruleset, key);
  if (product?.netWorthCents && product.netWorthCents > 0) return Math.trunc(product.netWorthCents);
  const netWorth = ruleset.economy.netWorth;
  const values: Record<string, number> = {
    CRACK: netWorth.perCrackCents,
    MEDICINE: netWorth.perMedicineCents,
    CONDOMS: netWorth.perCondomCents,
    BEER: netWorth.perBeerCents,
    PISTOL: netWorth.perPistolCents,
    SHOTGUN: netWorth.perShotgunCents,
    TEK9: netWorth.perTek9Cents,
    AK47: netWorth.perAk47Cents,
  };
  return Math.max(1, Math.trunc(values[key] ?? 1));
}

/** Collect the current alliance's settled city cache while physically in that city. */
export function collectTerritoryCityYield(
  prisma: PrismaClient,
  roundPlayerId: string,
  input: { scope: 'city' | 'district'; citySlug: string; district?: string; actionId: string },
): Promise<GameActionResult<TerritoryYieldCollection>> {
  return ActionService.run<TerritoryYieldCollection>(prisma, roundPlayerId, {
    action: 'TERRITORY_YIELD_COLLECT',
    actionId: input.actionId,
    execute: async ({ tx, current, player, round, ruleset, now }) => {
      if (!territoryFeatureEnabled(round, ruleset)) {
        throw AppError.conflict('TERRITORY_REWARDS_DISABLED', 'Territory rewards are not enabled for this round.');
      }
      if (!player.allianceId) throw AppError.forbidden('Join the controlling alliance to collect this cache.');
      if (player.city.slug !== input.citySlug) throw AppError.conflict('NOT_IN_CACHE_CITY', 'You must be in the city whose cache you are collecting.');
      const catalog = territoryCatalogForRuleset(ruleset)!;
      if (input.scope === 'district' && !input.district) throw AppError.badRequest('DISTRICT_REQUIRED', 'Choose a district cache to collect.');
      const definition = input.scope === 'city' ? catalog.cities[input.citySlug] : catalog.districts[input.district!];
      const profile = definition ? catalog.yieldProfiles[definition.yieldProfileKey] : null;
      if (!profile) throw AppError.badRequest('NO_TERRITORY_YIELD', 'This territory has no yield cache.');

      let ownerAllianceId: string | null = null;
      let ownerName: string | null = null;
      if (input.scope === 'city') {
        const rows = await tx.turf.findMany({ where: { roundId: round.id, city: { slug: input.citySlug } }, select: { holder: { select: { allianceId: true, alliance: { select: { name: true, tag: true } } } } } });
        const control = territoryPerkCityControlFromRows(ruleset, rows);
        ownerAllianceId = control?.allianceId ?? null;
        ownerName = control?.alliance.name ?? null;
      } else {
        const turf = await tx.turf.findUnique({
          where: { roundId_cityId_district: { roundId: round.id, cityId: player.cityId, district: input.district! } },
          select: { holder: { select: { allianceId: true, alliance: { select: { name: true } } } } },
        });
        ownerAllianceId = turf?.holder?.allianceId ?? null;
        ownerName = turf?.holder?.alliance?.name ?? null;
      }
      if (ownerAllianceId !== player.allianceId) {
        throw AppError.forbidden(ownerName ? `Only ${ownerName} can collect this territory cache.` : 'Your alliance does not control this territory cache.');
      }

      const city = await tx.city.findUniqueOrThrow({ where: { slug: input.citySlug }, select: { id: true } });
      const locationKey = input.scope === 'city' ? input.citySlug : `${input.citySlug}:${input.district}`;
      const intervals = input.scope === 'city'
        ? await cityTerritoryControlIntervals({ tx, roundId: round.id, cityId: city.id, roundStartedAt: round.startsAt, now })
        : await districtTerritoryControlIntervals({ tx, roundId: round.id, cityId: city.id, district: input.district!, roundStartedAt: round.startsAt, now });
      const state = await settlePersistedTerritoryYield({
        tx,
        roundId: round.id,
        scope: input.scope,
        locationKey,
        profile,
        intervals,
        initialSettledAt: round.startsAt,
        currentAllianceId: ownerAllianceId,
        now,
        priorSameTierHoldings: 0,
      });
      const goods = Object.fromEntries(Object.entries(state.contents).filter(([, quantity]) => quantity > 0));
      const cashCents = Math.max(0, Math.trunc(state.cashCents));
      const cache = await tx.territoryYieldCache.findUniqueOrThrow({ where: { roundId_scope_locationKey: { roundId: round.id, scope: input.scope, locationKey } }, select: { contents: true } });
      const rawContents = cache.contents && typeof cache.contents === 'object' && !Array.isArray(cache.contents) ? cache.contents as Record<string, unknown> : {};
      const tollCents = Math.max(0, Math.trunc(Number(rawContents.tollCents) || 0));
      if (Object.keys(goods).length === 0 && cashCents === 0 && tollCents === 0) throw AppError.conflict('TERRITORY_CACHE_EMPTY', 'There is nothing to collect from this territory yet.');
      if (current.turns < 1) throw AppError.badRequest('NOT_ENOUGH_TURNS', 'Collecting a territory cache costs 1 turn.', { turns: 'You need 1 turn.' });

      const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      const dailyKey = { roundId: round.id, allianceId: player.allianceId, dayStart };
      await tx.territoryYieldDailyLedger.upsert({ where: { roundId_allianceId_dayStart: dailyKey }, create: { ...dailyKey, valueCents: 0n }, update: {} });
      await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "TerritoryYieldDailyLedger"
        WHERE "roundId" = ${round.id} AND "allianceId" = ${player.allianceId} AND "dayStart" = ${dayStart}
        FOR UPDATE
      `;
      const daily = await tx.territoryYieldDailyLedger.findUniqueOrThrow({ where: { roundId_allianceId_dayStart: dailyKey } });
      const playerDailyKey = { roundPlayerId, dayStart };
      await tx.territoryYieldPlayerDailyLedger.upsert({ where: { roundPlayerId_dayStart: playerDailyKey }, create: { roundId: round.id, ...playerDailyKey, valueCents: 0n }, update: {} });
      await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "TerritoryYieldPlayerDailyLedger"
        WHERE "roundPlayerId" = ${roundPlayerId} AND "dayStart" = ${dayStart}
        FOR UPDATE
      `;
      const playerDaily = await tx.territoryYieldPlayerDailyLedger.findUniqueOrThrow({ where: { roundPlayerId_dayStart: playerDailyKey } });
      const memberCount = await tx.roundPlayer.count({ where: { roundId: round.id, allianceId: player.allianceId } });
      const dailyCap = BigInt(ruleset.territoryPerks!.dailyYieldCapCentsPerMember) * BigInt(Math.max(1, memberCount));
      const memberCap = BigInt(ruleset.territoryPerks!.dailyYieldCapCentsPerMember);
      const allianceRemaining = Math.max(0, Number(dailyCap - daily.valueCents));
      const playerRemaining = Math.max(0, Number(memberCap - playerDaily.valueCents));
      const availableValueCents = Math.min(allianceRemaining, playerRemaining);
      const unitValues = Object.fromEntries(Object.keys(goods).map((key) => [key, territoryYieldUnitValueCents(ruleset, key)]));
      const collection = allocateTerritoryYield({ goods, cashCents, tollCents, unitValues, availableValueCents });
      if (collection.valueCents === 0) throw AppError.conflict('TERRITORY_DAILY_CAP', 'Your alliance has reached its territory yield cap for today.');

      if (Object.keys(collection.goods).length) await ProductInventoryService.adjust(tx, roundPlayerId, ruleset, collection.goods);
      const remainingGoods = { ...state.contents };
      for (const [key, quantity] of Object.entries(collection.goods)) remainingGoods[key] = Math.max(0, (remainingGoods[key] ?? 0) - quantity);
      await tx.territoryYieldCache.update({
        where: { roundId_scope_locationKey: { roundId: round.id, scope: input.scope, locationKey } },
        data: {
          contents: { goods: remainingGoods, cashCents: cashCents - collection.cashCents, tollCents: tollCents - collection.tollCents },
          fractionalRemainders: (state.fractionalRemainders ?? {}) as import('@prisma/client').Prisma.InputJsonValue,
          carryMillis: state.carryMillis,
        },
      });
      await tx.territoryYieldDailyLedger.update({ where: { id: daily.id }, data: { valueCents: daily.valueCents + BigInt(collection.valueCents) } });
      await tx.territoryYieldPlayerDailyLedger.update({ where: { id: playerDaily.id }, data: { valueCents: playerDaily.valueCents + BigInt(collection.valueCents) } });
      return {
        next: { ...current, cashCents: current.cashCents + BigInt(collection.cashCents + collection.tollCents), turns: current.turns - 1 },
        result: { scope: input.scope, citySlug: input.citySlug, district: input.district ?? null, goods: collection.goods, cashCents: collection.cashCents, tollCents: collection.tollCents, valueCents: collection.valueCents, turnsUsed: 1 },
      };
    },
  });
}
