import type { PrismaClient, Round } from '@prisma/client';
import { lockRound } from '../utils/db.js';
import { AppError } from '../utils/errors.js';
import { TERRITORY_PERKS_CATALOG_VERSION } from '@streets/rulesets';
import { loadRulesetForRound } from '@streets/rules-engine';

export const AdminTerritoryPerksService = {
  async setEnabled(prisma: PrismaClient, roundId: string, actorId: string, enabled: boolean): Promise<Pick<Round, 'id' | 'territoryPerksEnabled' | 'territoryPerksCatalogVersion'>> {
    return prisma.$transaction(async (tx) => {
      await lockRound(tx, roundId);
      const round = await tx.round.findUnique({ where: { id: roundId }, select: { id: true, status: true, rulesetId: true, rulesetVersion: true, territoryPerksEnabled: true, territoryPerksCatalogVersion: true } });
      if (!round) throw AppError.notFound('ROUND_NOT_FOUND', 'That round does not exist.');
      if (!['SCHEDULED', 'REGISTRATION'].includes(round.status)) {
        throw AppError.conflict('TERRITORY_FLAG_LOCKED', 'Territory rewards can only be changed before the round starts.');
      }
      if (enabled && loadRulesetForRound(round).territoryPerks?.catalogVersion !== TERRITORY_PERKS_CATALOG_VERSION) {
        throw AppError.conflict('TERRITORY_RULESET_REQUIRED', 'Select a ruleset version that includes the territory rewards catalog before enabling it.');
      }
      const updated = await tx.round.update({
        where: { id: round.id },
        data: {
          territoryPerksEnabled: enabled,
          territoryPerksCatalogVersion: enabled ? TERRITORY_PERKS_CATALOG_VERSION : null,
        },
        select: { id: true, territoryPerksEnabled: true, territoryPerksCatalogVersion: true },
      });
      await tx.territoryAuditEvent.create({
        data: {
          roundId: round.id,
          actorId,
          eventType: enabled ? 'FEATURE_ENABLED' : 'FEATURE_DISABLED',
          sourceKey: 'admin-round-flag',
          catalogVersion: enabled ? TERRITORY_PERKS_CATALOG_VERSION : round.territoryPerksCatalogVersion ?? TERRITORY_PERKS_CATALOG_VERSION,
          details: { enabled, previousEnabled: round.territoryPerksEnabled, catalogVersion: updated.territoryPerksCatalogVersion },
        },
      });
      return updated;
    }, { maxWait: 10_000, timeout: 30_000 });
  },
};
