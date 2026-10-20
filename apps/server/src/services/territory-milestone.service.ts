import { loadRulesetForRound } from '@streets/rules-engine';
import { territoryCatalogForRuleset, type TerritoryCatalog } from '@streets/rulesets';
import type { Db } from '../utils/db.js';
import { territoryFeatureEnabled, territoryPerkCityControlFromRows } from './territory-perks.service.js';

export interface TerritoryCityController {
  citySlug: string;
  allianceId: string | null;
}

export interface TerritoryMilestone {
  allianceId: string;
  awardKey: string;
  scopeKey: string;
  regionKey: string | null;
  tier: number | null;
}

/** Deterministic milestones from the final, authoritative city controllers. */
export function territoryMilestonesForControl(
  catalog: TerritoryCatalog,
  controllers: readonly TerritoryCityController[],
): TerritoryMilestone[] {
  const controllerByCity = new Map(controllers.map((row) => [row.citySlug, row.allianceId]));
  const milestones = new Map<string, TerritoryMilestone>();
  const regionOwners = new Map<string, Set<string>>();
  for (const [regionKey, region] of Object.entries(catalog.regions)) {
    const owners = new Map<string, number>();
    for (const citySlug of region.citySlugs) {
      const allianceId = controllerByCity.get(citySlug);
      if (allianceId) owners.set(allianceId, (owners.get(allianceId) ?? 0) + 1);
    }
    const completeOwners = new Set<string>();
    for (const [allianceId, citiesHeld] of owners) {
      for (const [index, threshold] of region.tiers.entries()) {
        if (citiesHeld < threshold) continue;
        const award: TerritoryMilestone = {
          allianceId,
          awardKey: 'territory-region-hold',
          scopeKey: `region:${regionKey}:tier:${index + 1}`,
          regionKey,
          tier: index + 1,
        };
        milestones.set(`${allianceId}:${award.scopeKey}`, award);
      }
      if (citiesHeld >= region.citySlugs.length) completeOwners.add(allianceId);
    }
    regionOwners.set(regionKey, completeOwners);
  }
  const allAllianceIds = new Set([...regionOwners.values()].flatMap((owners) => [...owners]));
  for (const allianceId of allAllianceIds) {
    if ([...regionOwners.values()].every((owners) => owners.has(allianceId))) {
      const award: TerritoryMilestone = {
        allianceId,
        awardKey: 'territory-national-kingpin',
        scopeKey: 'national:all-regions',
        regionKey: null,
        tier: null,
      };
      milestones.set(`${allianceId}:${award.scopeKey}`, award);
    }
  }
  return [...milestones.values()].sort((a, b) => a.allianceId.localeCompare(b.allianceId) || a.scopeKey.localeCompare(b.scopeKey));
}

const TERRITORY_ACTIVITY_TYPES = [
  'TURF_CLAIM', 'TURF_POST', 'TURF_PULL', 'TURF_PUSH', 'TURF_PUSH_BACKUP',
  'TURF_PUSH_ATTACK', 'TURF_PUSH_DEFENSE', 'TURF_OUTPOST_ESTABLISH',
] as const;

/** Freeze end-of-round territory awards, profile entitlements, and Hall of Fame summary. */
export async function finalizeTerritoryMilestones(
  tx: Db,
  input: { roundId: string; cutoffAt: Date },
): Promise<PrismaJsonTerritorySummary | null> {
  const round = await tx.round.findUnique({ where: { id: input.roundId } });
  if (!round) return null;
  const ruleset = loadRulesetForRound(round);
  if (!territoryFeatureEnabled(round, ruleset)) return null;
  const catalog = territoryCatalogForRuleset(ruleset);
  if (!catalog) return null;

  const turfs = await tx.turf.findMany({
    where: { roundId: round.id },
    select: { holder: { select: { allianceId: true, alliance: { select: { name: true, tag: true } } } }, city: { select: { slug: true } } },
  });
  const byCity = new Map<string, Array<{ holder: { allianceId: string | null; alliance: { name: string; tag: string } | null } | null }>>();
  for (const turf of turfs) {
    const city = byCity.get(turf.city.slug) ?? [];
    city.push({ holder: turf.holder });
    byCity.set(turf.city.slug, city);
  }
  const cityControllers = [...byCity].map(([citySlug, rows]) => ({ citySlug, allianceId: territoryPerkCityControlFromRows(ruleset, rows)?.allianceId ?? null }));
  const milestones = territoryMilestonesForControl(catalog, cityControllers);
  if (!milestones.length) return { regions: [], nationalKingpinAllianceId: null, awards: [] };

  const qualifyingAllianceIds = [...new Set(milestones.map((row) => row.allianceId))];
  const contributors = await tx.playerActivity.groupBy({
    by: ['roundPlayerId'],
    where: {
      roundPlayer: { roundId: round.id, allianceId: { in: qualifyingAllianceIds } },
      type: { in: [...TERRITORY_ACTIVITY_TYPES] },
      createdAt: { gte: round.startsAt, lte: input.cutoffAt },
    },
  });
  const contributorIds = contributors.map((row) => row.roundPlayerId);
  const players = contributorIds.length ? await tx.roundPlayer.findMany({
    where: { id: { in: contributorIds }, allianceId: { in: qualifyingAllianceIds }, account: { isActive: true } },
    select: { id: true, accountId: true, allianceId: true, account: { select: { username: true } } },
  }) : [];
  const activeMilestones = milestones.filter((milestone) => players.some((player) => player.allianceId === milestone.allianceId));
  const definitions = ruleset.cosmetics ?? {};
  for (const milestone of activeMilestones) {
    const members = players.filter((player) => player.allianceId === milestone.allianceId);
    for (const player of members) {
      await tx.territoryRoundAward.upsert({
        where: { roundPlayerId_awardKey_scopeKey: { roundPlayerId: player.id, awardKey: milestone.awardKey, scopeKey: milestone.scopeKey } },
        create: { roundId: round.id, roundPlayerId: player.id, allianceId: milestone.allianceId, awardKey: milestone.awardKey, scopeKey: milestone.scopeKey },
        update: {},
      });
      const rewardKeys = milestone.awardKey === 'territory-national-kingpin'
        ? ['territory-national-kingpin', 'territory-national-kingpin-frame']
        : ['territory-regional-governor'];
      for (const key of rewardKeys) {
        const cosmetic = definitions[key];
        if (!cosmetic) continue;
        await tx.accountCosmeticUnlock.upsert({
          where: { accountId_key: { accountId: player.accountId, key } },
          create: {
            accountId: player.accountId,
            key,
            kind: cosmetic.kind,
            title: cosmetic.name,
            description: cosmetic.description,
            rarity: cosmetic.rarity,
            styleKey: cosmetic.styleKey ?? null,
            sourceQuestKey: `territory-milestone:${milestone.scopeKey}`,
            sourceRulesetId: round.rulesetId,
            sourceRulesetVersion: round.rulesetVersion,
          },
          update: {},
        });
      }
    }
  }

  const regionRows = [...new Set(activeMilestones.filter((row) => row.regionKey).map((row) => row.regionKey!))]
    .map((regionKey) => {
      const award = activeMilestones.find((row) => row.regionKey === regionKey)!;
      return { regionKey, allianceId: award.allianceId, highestTier: Math.max(...activeMilestones.filter((row) => row.regionKey === regionKey).map((row) => row.tier ?? 0)) };
    });
  const national = activeMilestones.find((row) => row.awardKey === 'territory-national-kingpin');
  return {
    regions: regionRows,
    nationalKingpinAllianceId: national?.allianceId ?? null,
    awards: activeMilestones.map(({ allianceId, awardKey, scopeKey }) => ({ allianceId, awardKey, scopeKey })),
  };
}

export interface PrismaJsonTerritorySummary {
  regions: Array<{ regionKey: string; allianceId: string; highestTier: number }>;
  nationalKingpinAllianceId: string | null;
  awards: Array<{ allianceId: string; awardKey: string; scopeKey: string }>;
}
