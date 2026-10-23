import type { Prisma, RivalryMutuality, RivalryStatus } from '@prisma/client';
import { rivalryRulesForRuleset, RIVALRY_SOURCE_KINDS, type RivalryOutcome, type RivalrySourceKind } from '@streets/rulesets';
import type { RivalryHistoryDto, RivalryPublicCardDto } from '@streets/shared';
import type { PrismaClient } from '@prisma/client';
import type { Db } from '../utils/db.js';
import { rulesets } from '@streets/rulesets';
import { AppError } from '../utils/errors.js';
import { RivalryOperationsService } from './rivalry-operations.service.js';
import { QuestCosmeticService } from './quest-cosmetic.service.js';
import { emitRivalryCityHeadline } from './city-memory.service.js';

export interface SettledRivalrySource {
  readonly roundId: string;
  readonly sourceKind: RivalrySourceKind;
  readonly sourceId: string;
  readonly participantAId: string;
  readonly participantBId: string;
  readonly actorId: string;
  readonly outcome: RivalryOutcome;
  readonly settledAt: Date;
  readonly metadata?: Record<string, unknown>;
  readonly verified?: boolean;
  readonly participated?: boolean;
  readonly selfAlt?: boolean;
}

function pair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

function scoreFor(outcome: RivalryOutcome, actorId: string, a: string, b: string, weights: Record<RivalryOutcome, number>): number {
  const base = weights[outcome];
  return actorId === a ? base : actorId === b ? -base : 0;
}

function safeMetadata(metadata: Record<string, unknown> | undefined): Prisma.InputJsonObject {
  if (!metadata) return {};
  const privateKeys = new Set(['scout', 'combat', 'stock', 'power', 'account', 'reconnaissance', 'exactLocation']);
  return Object.fromEntries(Object.entries(metadata).filter(([key]) => !privateKeys.has(key))) as Prisma.InputJsonObject;
}

export const RivalryService = {
  async claimFairPlayAward(db: Db, roundPlayerId: string, relationshipId: string, awardKey: string, now = new Date()) {
    const relationship = await db.rivalryRelationship.findUnique({
      where: { id: relationshipId },
      include: { participantA: true, participantB: true, sources: true },
    });
    if (!relationship || (relationship.participantAId !== roundPlayerId && relationship.participantBId !== roundPlayerId)) throw AppError.notFound('RIVALRY_NOT_FOUND', 'That rivalry is not available.');
    const ruleset = rulesets[relationship.rulesetId];
    const rules = ruleset ? rivalryRulesForRuleset(ruleset) : null;
    if (!ruleset || !rules?.enabled || !rules.fairPlayAwards.includes(awardKey)) throw AppError.conflict('RIVALRY_AWARD_DISABLED', 'That rivalry record is not available.');
    const participantIds = new Set(relationship.sources.map((source) => source.participantId));
    if (relationship.mutuality !== 'MUTUAL' || participantIds.size < 2 || relationship.sources.length < rules.minimumDistinctEvents) throw AppError.conflict('RIVALRY_AWARD_INELIGIBLE', 'This record has not reached a fair-play milestone.');
    const player = relationship.participantAId === roundPlayerId ? relationship.participantA : relationship.participantB;
    const existing = await db.rivalryAwardClaim.findUnique({ where: { relationshipId_roundPlayerId_awardKey: { relationshipId, roundPlayerId, awardKey } } });
    if (existing) return existing;
    const claim = await db.rivalryAwardClaim.create({ data: { relationshipId, roundPlayerId, awardKey, sourceMilestone: `mutual:${relationship.sources.length}`, claimedAt: now } });
    await QuestCosmeticService.award(db, player.accountId, ruleset, awardKey, `rivalry:${relationshipId}`, now);
    return claim;
  },

  async listForPlayer(db: Db, roundId: string, playerId: string) {
    const relationships = await db.rivalryRelationship.findMany({
      where: { roundId, suppressedAt: null, OR: [{ participantAId: playerId }, { participantBId: playerId }] },
      include: { sources: { where: { visibility: { not: 'SUPPRESSED' } }, orderBy: { settledAt: 'desc' }, take: 20 } },
      orderBy: { updatedAt: 'desc' },
      take: 20,
    });
    return relationships.map((relationship) => ({
      relationshipId: relationship.id,
      roundId: relationship.roundId,
      status: relationship.status,
      mutuality: relationship.mutuality,
      score: playerId === relationship.participantAId ? relationship.scoreA : relationship.scoreB,
      history: relationship.sources.map((source) => ({
        id: source.id,
        sourceKind: source.sourceKind,
        outcome: source.outcome,
        settledAt: source.settledAt.toISOString(),
        visibility: source.visibility,
        scoreDelta: source.scoreDelta,
      })),
    }));
  },

  async recordSettledSource(db: Db, input: SettledRivalrySource) {
    if (RivalryOperationsService.isPaused()) throw AppError.conflict('RIVALRY_PAUSED', 'Rivalry activity is temporarily paused.');
    if (!RIVALRY_SOURCE_KINDS.includes(input.sourceKind) || input.participantAId === input.participantBId
      || input.verified === false || input.participated === false || input.selfAlt === true) return null;
    const [participantAId, participantBId] = pair(input.participantAId, input.participantBId);
    const players = await db.roundPlayer.findMany({
      where: { id: { in: [participantAId, participantBId] }, roundId: input.roundId },
      select: { id: true, accountId: true, round: { select: { id: true, rulesetId: true, rulesetVersion: true, status: true, pausedAt: true } } },
    });
    if (players.length !== 2) return null;
    const [firstPlayer, secondPlayer] = players;
    if (!firstPlayer || !secondPlayer || firstPlayer.accountId === secondPlayer.accountId) return null;
    const round = firstPlayer.round;
    const pinnedRuleset = rulesets[round.rulesetId];
    const catalog = pinnedRuleset ? rivalryRulesForRuleset(pinnedRuleset) : null;
    if (!catalog?.enabled || round.status !== 'ACTIVE' || round.pausedAt || ![participantAId, participantBId].includes(input.actorId)) return null;
    if (!catalog.eligibleSources.includes(input.sourceKind)) return null;

    const existing = await db.rivalryRelationship.findUnique({ where: { roundId_participantAId_participantBId: { roundId: input.roundId, participantAId, participantBId } } });
    let relationship = existing;
    if (!relationship) {
      try {
        relationship = await db.rivalryRelationship.create({
          data: { roundId: input.roundId, participantAId, participantBId, rulesetId: round.rulesetId, rulesetVersion: round.rulesetVersion },
        });
      } catch (error) {
        if ((error as { code?: string }).code !== 'P2002') throw error;
        relationship = await db.rivalryRelationship.findUniqueOrThrow({ where: { roundId_participantAId_participantBId: { roundId: input.roundId, participantAId, participantBId } } });
      }
    }
    const existingSources = await db.rivalrySourceReceipt.count({ where: { relationshipId: relationship.id } });
    if (existingSources >= catalog.maxSourcesPerRelationship) return relationship;
    const recentSources = await db.rivalrySourceReceipt.findMany({
      where: { relationshipId: relationship.id, participantId: input.actorId },
      orderBy: { settledAt: 'desc' },
      take: catalog.maxTargetConcentration,
      select: { settledAt: true },
    });
    const latest = recentSources[0];
    if (latest && input.settledAt.getTime() - latest.settledAt.getTime() < catalog.cooldownMinutes * 60_000) return relationship;
    if (recentSources.length >= catalog.maxTargetConcentration) return relationship;
    const delta = scoreFor(input.outcome, input.actorId, participantAId, participantBId, catalog.outcomeWeights);
    try {
      await db.rivalrySourceReceipt.create({
        data: {
          relationshipId: relationship.id,
          sourceKind: input.sourceKind,
          sourceId: input.sourceId,
          participantId: input.actorId,
          outcome: input.outcome,
          scoreDelta: delta,
          settledAt: input.settledAt,
          visibility: 'INVOLVED_ONLY',
          decisionReason: 'verified_settled_participating_source',
          metadata: safeMetadata(input.metadata),
        },
      });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') return relationship;
      throw error;
    }
    const receipts = await db.rivalrySourceReceipt.findMany({ where: { relationshipId: relationship.id }, select: { participantId: true, scoreDelta: true }, orderBy: { settledAt: 'asc' } });
    const counts = new Map<string, number>();
    for (const receipt of receipts) counts.set(receipt.participantId, (counts.get(receipt.participantId) ?? 0) + 1);
    const mutual = counts.get(participantAId)! >= catalog.minimumDistinctEvents && counts.get(participantBId)! >= catalog.minimumDistinctEvents;
    const mutuality: RivalryMutuality = mutual ? 'MUTUAL' : 'ONE_SIDED';
    const status: RivalryStatus = mutual ? 'MUTUAL' : 'ONE_SIDED';
    const scoreA = receipts.reduce((sum, receipt) => sum + receipt.scoreDelta, 0);
    await db.rivalryRelationship.update({
      where: { id: relationship.id },
      data: { scoreA, scoreB: -scoreA, mutuality, status, lastSettledAt: input.settledAt },
    });
    return relationship;
  },

  async history(prisma: PrismaClient, roundPlayerId: string, relationshipId: string): Promise<RivalryHistoryDto | null> {
    const relationship = await prisma.rivalryRelationship.findFirst({
      where: { id: relationshipId, OR: [{ participantAId: roundPlayerId }, { participantBId: roundPlayerId }] },
      select: { id: true, roundId: true, status: true, mutuality: true, scoreA: true, participantAId: true, suppressedAt: true, sources: { take: 100, orderBy: { settledAt: 'asc' }, select: { id: true, sourceKind: true, outcome: true, settledAt: true, visibility: true, scoreDelta: true } } },
    });
    if (!relationship || relationship.suppressedAt) return null;
    return {
      relationshipId: relationship.id,
      roundId: relationship.roundId,
      status: relationship.status,
      mutuality: relationship.mutuality === 'MUTUAL' ? 'MUTUAL' : relationship.mutuality === 'SUPPRESSED' ? 'SUPPRESSED' : 'ONE_SIDED',
      score: roundPlayerId === relationship.participantAId ? relationship.scoreA : -relationship.scoreA,
      history: relationship.sources.filter((source) => source.visibility !== 'SUPPRESSED').map((source) => ({ ...source, settledAt: source.settledAt.toISOString(), visibility: source.visibility })),
    };
  },

  async publicHistory(prisma: PrismaClient, roundId: string, relationshipId: string): Promise<RivalryHistoryDto | null> {
    const relationship = await prisma.rivalryRelationship.findFirst({
      where: { id: relationshipId, roundId, suppressedAt: null },
      select: { id: true, roundId: true, status: true, mutuality: true, scoreA: true, stories: { where: { published: true, suppressed: false }, select: { sourceId: true } }, sources: { take: 100, orderBy: { settledAt: 'asc' }, select: { id: true, sourceKind: true, outcome: true, settledAt: true, visibility: true, scoreDelta: true } } },
    });
    if (!relationship) return null;
    const published = new Set(relationship.stories.flatMap((story) => story.sourceId ? [story.sourceId] : []));
    return {
      relationshipId: relationship.id,
      roundId: relationship.roundId,
      status: relationship.status,
      mutuality: relationship.mutuality === 'MUTUAL' ? 'MUTUAL' : relationship.mutuality === 'SUPPRESSED' ? 'SUPPRESSED' : 'ONE_SIDED',
      score: relationship.scoreA,
      history: relationship.sources.filter((source) => source.visibility === 'PUBLIC' && published.has(source.id)).map((source) => ({ ...source, settledAt: source.settledAt.toISOString(), visibility: 'PUBLIC' as const })),
    };
  },

  async publicCards(prisma: PrismaClient, roundId: string, relationshipId: string): Promise<RivalryPublicCardDto[]> {
    const relationship = await prisma.rivalryRelationship.findFirst({
      where: { id: relationshipId, roundId, suppressedAt: null },
      select: {
        id: true,
        sources: { where: { visibility: 'PUBLIC' }, select: { id: true, sourceId: true, outcome: true, settledAt: true } },
        stories: { where: { published: true, suppressed: false }, select: { sourceId: true, headline: true } },
      },
    });
    if (!relationship) return [];
    const sources = new Map(relationship.sources.map((source) => [source.id, source]));
    return relationship.stories.flatMap((story) => {
      const source = story.sourceId ? sources.get(story.sourceId) : undefined;
      if (!source || !story.headline) return [];
      return [{ relationshipId: relationship.id, headline: story.headline, outcome: source.outcome, happenedAt: source.settledAt.toISOString() }];
    });
  },

  async publishPublicCard(db: Db, input: { roundId: string; relationshipId: string; sourceId: string; cityId: string }) {
    const row = await db.rivalryRelationship.findFirst({
      where: { id: input.relationshipId, roundId: input.roundId, suppressedAt: null },
      select: { id: true, sources: { where: { id: input.sourceId, visibility: 'PUBLIC' }, select: { id: true, outcome: true, settledAt: true } }, stories: { where: { sourceId: input.sourceId, published: true, suppressed: false }, select: { headline: true } } },
    });
    const source = row?.sources[0];
    const story = row?.stories[0];
    if (!row || !source || !story?.headline) return null;
    return emitRivalryCityHeadline(db, { roundId: input.roundId, cityId: input.cityId, relationshipId: row.id, sourceId: source.id, headline: story.headline, outcome: source.outcome, happenedAt: source.settledAt });
  },
};
