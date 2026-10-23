import type { PrismaClient } from '@prisma/client';
import { territoryCatalogForRuleset } from '@streets/rulesets';
import type { GameActionResult, TerritoryAccessUseResult } from '@streets/shared';
import { AppError } from '../utils/errors.js';
import { ActionService } from './action.service.js';
import { territoryFeatureEnabled, territoryPerkCityControlFromRows } from './territory-perks.service.js';
import { cityTerritoryControlIntervals, districtTerritoryControlIntervals, settlePersistedTerritoryYield } from './territory-yield.service.js';
import type { Ruleset } from '@streets/rules-engine';

const UTC_DAY_MS = 86_400_000;

/** Server authorization boundary for city/district places. Paid entries debit once and credit the holder cache atomically. */
export function useTerritoryAccess(
  prisma: PrismaClient,
  roundPlayerId: string,
  input: { scope: 'city' | 'district'; citySlug: string; district?: string; accessKey: string; paymentKind?: 'CASH' | 'AMMO' | 'VEHICLE_PARTS'; actionId: string },
): Promise<GameActionResult<TerritoryAccessUseResult>> {
  return ActionService.run<TerritoryAccessUseResult>(prisma, roundPlayerId, {
    action: 'TERRITORY_ACCESS_USE',
    actionId: input.actionId,
    execute: async ({ tx, current, player, round, ruleset, now, skills }) => {
      if (!territoryFeatureEnabled(round, ruleset)) throw AppError.conflict('TERRITORY_REWARDS_DISABLED', 'Territory rewards are not enabled for this round.');
      if (player.city.slug !== input.citySlug) throw AppError.conflict('NOT_IN_ACCESS_CITY', 'Travel to this city before using its territory access.');
      if (input.scope === 'district' && !input.district) throw AppError.badRequest('DISTRICT_REQUIRED', 'Choose a district access point.');
      const catalog = territoryCatalogForRuleset(ruleset)!;
      const location = input.scope === 'city' ? catalog.cities[input.citySlug] : catalog.districts[input.district!];
      const access = location?.access;
      if (!access || access.key !== input.accessKey) throw AppError.notFound('TERRITORY_ACCESS_NOT_FOUND', 'That access point is not available in this round.');

      const locationKey = input.scope === 'city' ? input.citySlug : `${input.citySlug}:${input.district}`;
      let holderAllianceId: string | null = null;
      let holderName: string | null = null;
      let cityId = player.cityId;
      if (input.scope === 'city') {
        const city = await tx.city.findUniqueOrThrow({ where: { slug: input.citySlug }, select: { id: true } });
        cityId = city.id;
        const rows = await tx.turf.findMany({ where: { roundId: round.id, cityId }, select: { holder: { select: { allianceId: true, alliance: { select: { name: true, tag: true } } } } } });
        const control = territoryPerkCityControlFromRows(ruleset, rows);
        holderAllianceId = control?.allianceId ?? null;
        holderName = control?.alliance.name ?? null;
      } else {
        const turf = await tx.turf.findUnique({
          where: { roundId_cityId_district: { roundId: round.id, cityId, district: input.district! } },
          select: { holder: { select: { allianceId: true, alliance: { select: { name: true } } } } },
        });
        holderAllianceId = turf?.holder?.allianceId ?? null;
        holderName = turf?.holder?.alliance?.name ?? null;
      }
      if (!holderAllianceId) throw AppError.conflict('TERRITORY_ACCESS_UNOWNED', 'This access point has no controlling alliance right now.');

      const paymentKind = input.paymentKind ?? 'CASH';
      const listedFee = Math.max(0, Math.trunc(paymentKind === 'CASH' ? access.tollCentsPerUse ?? 0
        : paymentKind === 'AMMO' ? access.tollAmmoPerUse ?? 0 : access.tollVehiclePartsPerUse ?? 0));
      const fee = Math.max(0, Math.floor(skills.scale('TOLLS', listedFee)));
      const dailyCap = Math.max(0, Math.trunc(paymentKind === 'CASH' ? access.dailyTollCapCents ?? 0
        : paymentKind === 'AMMO' ? access.dailyTollCapAmmo ?? 0 : access.dailyTollCapVehicleParts ?? 0));
      let dailyPaid = 0;
      if (fee > 0 && player.allianceId !== holderAllianceId) {
        const dayStart = new Date(Math.floor(now.getTime() / UTC_DAY_MS) * UTC_DAY_MS);
        const aggregate = await tx.territoryTollPayment.aggregate({
          where: { roundPlayerId, accessKey: access.key, usedAt: { gte: dayStart } },
          _sum: { chargedCents: true, chargedAmmo: true, chargedVehicleParts: true },
        });
        dailyPaid = paymentKind === 'CASH' ? Number(aggregate._sum.chargedCents ?? 0n)
          : paymentKind === 'AMMO' ? aggregate._sum.chargedAmmo ?? 0 : aggregate._sum.chargedVehicleParts ?? 0;
      }
      const remaining = Math.max(0, dailyCap - dailyPaid);
      const owns = player.allianceId === holderAllianceId;
      const allowed = owns || (access.accessType === 'toll' && listedFee > 0 && remaining >= fee);
      if (!allowed) {
        if (access.accessType === 'toll' && fee > 0 && remaining < fee) throw AppError.conflict('TERRITORY_TOLL_DAILY_CAP', `You have reached today's ${access.key.replaceAll('-', ' ')} toll limit.`);
        const toll = paymentKind === 'CASH' && fee > 0 ? ` The toll is $${(fee / 100).toFixed(2)}.` : '';
        throw AppError.forbidden(holderName ? `${holderName} controls this access point.${toll}` : 'Your alliance does not have access to this place.');
      }
      const chargedCents = paymentKind === 'CASH' && !owns ? fee : 0;
      const chargedAmmo = paymentKind === 'AMMO' && !owns ? fee : 0;
      const chargedVehicleParts = paymentKind === 'VEHICLE_PARTS' && !owns ? fee : 0;
      if (paymentKind === 'CASH' && current.cashCents < BigInt(chargedCents)) throw AppError.badRequest('NOT_ENOUGH_CASH', `This access point costs ${chargedCents} cents to enter.`);
      if (chargedAmmo > (current.ammo ?? 0)) throw AppError.badRequest('NOT_ENOUGH_AMMO', `This access point costs ${chargedAmmo} rounds to enter.`);
      if (chargedVehicleParts > (current.vehicleParts ?? 0)) throw AppError.badRequest('NOT_ENOUGH_PARTS', `This access point costs ${chargedVehicleParts} parts to enter.`);

      if (chargedCents > 0 || chargedAmmo > 0 || chargedVehicleParts > 0) {
        const profile = catalog.yieldProfiles[location!.yieldProfileKey]!;
        const intervals = input.scope === 'city'
          ? await cityTerritoryControlIntervals({ tx, roundId: round.id, cityId, roundStartedAt: round.startsAt, now })
          : await districtTerritoryControlIntervals({ tx, roundId: round.id, cityId, district: input.district!, roundStartedAt: round.startsAt, now });
        await settlePersistedTerritoryYield({ tx, roundId: round.id, scope: input.scope, locationKey, profile, intervals, initialSettledAt: round.startsAt, currentAllianceId: holderAllianceId, now, priorSameTierHoldings: 0 });
        const cache = await tx.territoryYieldCache.findUniqueOrThrow({ where: { roundId_scope_locationKey: { roundId: round.id, scope: input.scope, locationKey } } });
        const raw = cache.contents && typeof cache.contents === 'object' && !Array.isArray(cache.contents) ? cache.contents as Record<string, unknown> : {};
        const tollCents = Math.max(0, Math.trunc(Number(raw.tollCents) || 0)) + chargedCents;
        if (!Number.isSafeInteger(tollCents)) throw AppError.conflict('TERRITORY_TOLL_OVERFLOW', 'This location cannot hold more toll receipts right now.');
        const rawGoods = raw.goods && typeof raw.goods === 'object' && !Array.isArray(raw.goods) ? raw.goods as Record<string, unknown> : {};
        const goods = { ...rawGoods,
          ...(chargedAmmo ? { AMMO: Math.max(0, Math.trunc(Number(rawGoods.AMMO) || 0)) + chargedAmmo } : {}),
          ...(chargedVehicleParts ? { VEHICLE_PARTS: Math.max(0, Math.trunc(Number(rawGoods.VEHICLE_PARTS) || 0)) + chargedVehicleParts } : {}),
        };
        await tx.territoryYieldCache.update({ where: { id: cache.id }, data: { contents: { ...raw, goods, tollCents } as import('@prisma/client').Prisma.InputJsonValue } });
      }
      const grant = await tx.territoryTollPayment.create({ data: { roundId: round.id, roundPlayerId, holderAllianceId, accessKey: access.key, locationKey, chargedCents: BigInt(chargedCents), chargedAmmo, chargedVehicleParts, actionId: input.actionId, usedAt: now } });
      return {
        next: { ...current, cashCents: current.cashCents - BigInt(chargedCents), ammo: (current.ammo ?? 0) - chargedAmmo, vehicleParts: (current.vehicleParts ?? 0) - chargedVehicleParts },
        result: { accessKey: access.key, locationKey, allowed: true, chargedCents, chargedAmmo, chargedVehicleParts, ownerAllianceId: holderAllianceId, grantId: grant.id },
      };
    },
  });
}

/** Consume the one-use receipt from the access action at the protected place. */
export async function consumeTerritoryAccessGrant(input: {
  tx: import('../utils/db.js').Db;
  roundId: string;
  territoryPerksEnabled?: boolean;
  territoryPerksCatalogVersion?: string | null;
  roundPlayerId: string;
  cityId: string;
  citySlug: string;
  allianceId: string | null;
  ruleset: Ruleset;
  accessKey: string;
  grantId: string | undefined;
  actionId: string;
  now: Date;
}): Promise<void> {
  if (!territoryFeatureEnabled(input, input.ruleset)) return;
  const catalog = territoryCatalogForRuleset(input.ruleset);
  const access = catalog?.cities[input.citySlug]?.access;
  if (!access || access.key !== input.accessKey) return;
  if (!input.grantId) throw AppError.forbidden('Use this territory access point before taking this action.');
  const rows = await input.tx.turf.findMany({ where: { roundId: input.roundId, cityId: input.cityId }, select: { holder: { select: { allianceId: true, alliance: { select: { name: true, tag: true } } } } } });
  const owner = territoryPerkCityControlFromRows(input.ruleset, rows)?.allianceId ?? null;
  if (!owner) throw AppError.conflict('TERRITORY_ACCESS_UNOWNED', 'This place has no controlling alliance right now.');
  const payment = await input.tx.territoryTollPayment.findFirst({ where: { id: input.grantId, roundId: input.roundId, roundPlayerId: input.roundPlayerId, accessKey: access.key, locationKey: input.citySlug, consumedAt: null } });
  if (!payment || payment.holderAllianceId !== owner || input.now.getTime() - payment.usedAt.getTime() > 10 * 60_000) throw AppError.forbidden('That territory access receipt is missing, expired by a control change, or already used.');
  if (payment.chargedCents === 0n && payment.chargedAmmo === 0 && payment.chargedVehicleParts === 0 && input.allianceId !== owner) throw AppError.forbidden('Only the controlling alliance may use this place without paying its toll.');
  const consumed = await input.tx.territoryTollPayment.updateMany({ where: { id: payment.id, consumedAt: null }, data: { consumedAt: input.now, consumedByActionId: input.actionId } });
  if (consumed.count !== 1) throw AppError.conflict('TERRITORY_ACCESS_ALREADY_USED', 'That territory access receipt has already been used.');
}
