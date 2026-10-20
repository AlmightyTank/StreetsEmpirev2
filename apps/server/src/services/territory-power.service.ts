import type { PrismaClient } from '@prisma/client';
import { loadRulesetForRound } from '@streets/rules-engine';
import { territoryCatalogForRuleset, TERRITORY_PERKS_CATALOG_VERSION } from '@streets/rulesets';
import { AppError } from '../utils/errors.js';
import { territoryFeatureEnabled, territoryPerkCityControlFromRows } from './territory-perks.service.js';

const POWER_CHANGE_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export async function selectTerritoryPower(prisma: PrismaClient, roundPlayerId: string, regionKey: string, now = new Date()) {
  return prisma.$transaction(async (tx) => {
    const player = await tx.roundPlayer.findUniqueOrThrow({ where: { id: roundPlayerId }, select: { id: true, allianceId: true, round: true } });
    if (!player.allianceId) throw AppError.forbidden('Join an alliance to activate a regional power.');
    await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "Alliance" WHERE "id" = ${player.allianceId} FOR UPDATE`;
    const alliance = await tx.alliance.findUniqueOrThrow({ where: { id: player.allianceId }, select: { id: true, name: true, leaderId: true, disbandedAt: true } });
    if (alliance.disbandedAt || alliance.leaderId !== player.id) throw AppError.forbidden('Only the alliance leader can choose a regional power.');
    const round = player.round;
    const ruleset = loadRulesetForRound(round);
    if (!territoryFeatureEnabled(round, ruleset)) throw AppError.conflict('TERRITORY_REWARDS_DISABLED', 'Territory rewards are not enabled for this round.');
    const region = territoryCatalogForRuleset(ruleset)!.regions[regionKey];
    if (!region) throw AppError.badRequest('UNKNOWN_TERRITORY_REGION', 'That regional power is not available in this round.');
    const cityRows = await tx.city.findMany({
      where: { slug: { in: [...region.citySlugs] } },
      select: { slug: true, turf: { where: { roundId: round.id }, select: { holder: { select: { allianceId: true, alliance: { select: { name: true, tag: true } } } } } } },
    });
    const controlledCities = cityRows.filter((city) => territoryPerkCityControlFromRows(ruleset, city.turf)?.allianceId === alliance.id).length;
    if (controlledCities === 0) throw AppError.conflict('REGION_NOT_CONTROLLED', 'Your alliance must control at least one city in that region first.');
    const previous = await tx.territoryPowerSelection.findUnique({ where: { allianceId: alliance.id } });
    if (previous?.regionKey === regionKey) return previous;
    if (previous && now.getTime() - previous.changedAt.getTime() < POWER_CHANGE_COOLDOWN_MS) {
      throw AppError.conflict('REGION_POWER_COOLDOWN', 'Regional power choices can be changed once every 24 hours.');
    }
    const selection = await tx.territoryPowerSelection.upsert({
      where: { allianceId: alliance.id },
      create: { roundId: round.id, allianceId: alliance.id, regionKey, perkKey: region.perk.key },
      update: { regionKey, perkKey: region.perk.key, changedAt: now },
    });
    await tx.territoryAuditEvent.create({
      data: {
        roundId: round.id,
        allianceId: alliance.id,
        actorId: player.id,
        eventType: 'REGIONAL_POWER_SELECTED',
        sourceKey: regionKey,
        catalogVersion: TERRITORY_PERKS_CATALOG_VERSION,
        details: { previousRegionKey: previous?.regionKey ?? null, regionKey, perkKey: region.perk.key },
      },
    });
    return selection;
  }, { maxWait: 10_000, timeout: 30_000 });
}
