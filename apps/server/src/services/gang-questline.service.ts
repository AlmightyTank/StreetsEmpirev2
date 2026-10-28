import type { PrismaClient } from '@prisma/client';
import type { GangQuestlineQuest, Ruleset } from '@streets/rulesets';
import type { GangQuestlineDto, GangQuestlinePageDto } from '@streets/shared';
import { AppError } from '../utils/errors.js';

type Relationship = {
  status: string;
  score: number;
  trustScore: number;
  respectScore: number;
};

export function gangQuestlineFor(ruleset: Ruleset, questKey: string): GangQuestlineQuest | undefined {
  return ruleset.questDefinitions?.[questKey]?.gangQuestline ?? ruleset.gangQuestlines?.[questKey];
}

export function gangQuestlineGate(
  questline: GangQuestlineQuest,
  relationship: Relationship | null,
): { available: boolean; reason: string | null } {
  const gates = questline.gates;
  if (!relationship) return { available: false, reason: 'Build a relationship with this gang first.' };
  if (relationship.status === 'NEMESIS' && gates?.allowNemesis !== true) {
    return { available: false, reason: 'This gang considers you a Nemesis.' };
  }
  if (gates?.trustScoreAtLeast !== undefined && relationship.trustScore < gates.trustScoreAtLeast) {
    return { available: false, reason: `Earn at least ${gates.trustScoreAtLeast} trust with this gang.` };
  }
  if (gates?.respectScoreAtLeast !== undefined && relationship.respectScore < gates.respectScoreAtLeast) {
    return { available: false, reason: `Earn at least ${gates.respectScoreAtLeast} respect with this gang.` };
  }
  if (gates?.hostilityScoreAtMost !== undefined && relationship.score > gates.hostilityScoreAtMost) {
    return { available: false, reason: 'Cool tensions with this gang before taking its work.' };
  }
  return { available: true, reason: null };
}

function relationshipDto(relationship: Relationship | null): GangQuestlineDto['relationship'] {
  return relationship
    ? { status: relationship.status, hostilityScore: relationship.score, trustScore: relationship.trustScore, respectScore: relationship.respectScore }
    : { status: 'UNKNOWN', hostilityScore: 0, trustScore: 0, respectScore: 0 };
}

export const GangQuestlineService = {
  async page(db: PrismaClient, roundPlayerId: string, ruleset: Ruleset): Promise<GangQuestlinePageDto> {
    const player = await db.roundPlayer.findUniqueOrThrow({
      where: { id: roundPlayerId },
      select: { roundId: true, city: { select: { slug: true } } },
    });
    const definitions = ruleset.questDefinitions ?? {};
    const keys = new Set([
      ...Object.keys(ruleset.gangQuestlines ?? {}),
      ...Object.entries(definitions).filter(([, definition]) => definition.gangQuestline).map(([key]) => key),
    ]);
    if (!keys.size) return { quests: [] };
    const metadata = [...keys].flatMap((questKey) => {
      const questline = gangQuestlineFor(ruleset, questKey);
      const definition = definitions[questKey];
      return questline && definition ? [{ questKey, questline, definition }] : [];
    });
    const gangSlugs = [...new Set(metadata.map(({ questline }) => questline.gangSlug))];
    const [gangs, playerQuests] = await Promise.all([
      db.encounterGang.findMany({
        where: { roundId: player.roundId, slug: { in: gangSlugs } },
        select: {
          id: true, slug: true, bossName: true, crewName: true, crewTag: true,
          playerRelationships: {
            where: { roundPlayerId },
            select: { status: true, score: true, trustScore: true, respectScore: true },
            take: 1,
          },
        },
      }),
      db.playerQuest.findMany({
        where: { roundPlayerId, questDefinition: { key: { in: [...keys] }, rulesetId: ruleset.meta.id, rulesetVersion: ruleset.meta.version } },
        select: { status: true, questDefinition: { select: { key: true } } },
        orderBy: { attempt: 'desc' },
      }),
    ]);
    const gangBySlug = new Map(gangs.map((gang) => [gang.slug, gang]));
    const questStatus = new Map<string, string>();
    for (const quest of playerQuests) if (!questStatus.has(quest.questDefinition.key)) questStatus.set(quest.questDefinition.key, quest.status);
    const quests = metadata.map(({ questKey, questline, definition }) => {
      const gang = gangBySlug.get(questline.gangSlug);
      const relationship = gang?.playerRelationships[0] ?? null;
      const gate = gangQuestlineGate(questline, relationship);
      return {
        questKey,
        title: definition.title,
        description: definition.description,
        gang: gang ? { slug: gang.slug, bossName: gang.bossName, crewName: gang.crewName, crewTag: gang.crewTag } : null,
        chapter: questline.chapter,
        cityBranch: questline.cityBranches[player.city.slug] ?? null,
        relationship: relationshipDto(relationship),
        available: Boolean(gang) && gate.available,
        unavailableReason: gang ? gate.reason : 'This gang is not active in the current round.',
        status: questStatus.get(questKey) ?? null,
      } satisfies GangQuestlineDto;
    });
    return { quests };
  },
};

export async function assertGangQuestlineAccess(
  db: PrismaClient | import('@prisma/client').Prisma.TransactionClient,
  roundPlayerId: string,
  roundId: string,
  ruleset: Ruleset,
  questKey: string,
): Promise<void> {
  const questline = gangQuestlineFor(ruleset, questKey);
  if (!questline) return;
  const gang = await db.encounterGang.findUnique({
    where: { roundId_slug: { roundId, slug: questline.gangSlug } },
    select: { id: true },
  });
  const relationship = gang ? await db.gangPlayerRelationship.findUnique({
    where: { gangId_roundPlayerId: { gangId: gang.id, roundPlayerId } },
    select: { status: true, score: true, trustScore: true, respectScore: true },
  }) : null;
  const gate = gangQuestlineGate(questline, relationship);
  if (!gate.available) throw AppError.conflict('GANG_QUEST_RELATIONSHIP_REQUIRED', gate.reason ?? 'This gang is not ready to work with you.');
}
