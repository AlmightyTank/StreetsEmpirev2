import type { CriminalCaseEvidence, CriminalCaseFile, Prisma, PrismaClient, Round } from '@prisma/client';
import { activeRoundEventTime, LIVING_CASE_BLUEPRINTS, livingStoryCatalogForRuleset } from '@streets/rulesets';
import type { CaseClueDefinition } from '@streets/rulesets';
import { loadRulesetForRound } from '@streets/rules-engine';
import type { CriminalCaseFileDto, CriminalCasePageDto, CriminalCaseStatusDto } from '@streets/shared';
import type { Db } from '../utils/db.js';
import { AppError } from '../utils/errors.js';
import { evaluateLivingStoryOffer } from './living-story-contract.service.js';

type CaseRow = CriminalCaseFile & { evidence: CriminalCaseEvidence[] };
type Clock = Pick<Round, 'pausedAt' | 'pausedMinutesTotal'>;
const OPEN = ['AVAILABLE', 'ACTIVE'] as const;
const include = { evidence: { orderBy: { recordedAt: 'asc' } } } as const;

function cluesOf(value: Prisma.JsonValue): CaseClueDefinition[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const row = item as Record<string, unknown>;
    return typeof row.key === 'string' && typeof row.label === 'string'
      && typeof row.sourceKind === 'string' && typeof row.eventType === 'string'
      ? [{ key: row.key, label: row.label, sourceKind: row.sourceKind as CaseClueDefinition['sourceKind'], eventType: row.eventType }]
      : [];
  });
}
function branchesOf(value: Prisma.JsonValue): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}
function currentStatus(row: CaseRow, clock: Clock, now: Date): CriminalCaseStatusDto {
  if (OPEN.includes(row.status as typeof OPEN[number]) && !clock.pausedAt
    && activeRoundEventTime(clock, now) >= row.expiresAtActive) return 'EXPIRED';
  return row.status;
}
function toDto(row: CaseRow, clock: Clock, now: Date): CriminalCaseFileDto {
  const plan = cluesOf(row.cluePlan);
  const byKey = new Map(row.evidence.map((e) => [e.clueKey, e]));
  return {
    id: row.id, caseKey: row.caseKey,
    title: LIVING_CASE_BLUEPRINTS[row.caseKey as keyof typeof LIVING_CASE_BLUEPRINTS]?.title ?? 'Case File',
    storyKey: row.storyKey, cityId: row.cityId,
    status: currentStatus(row, clock, now),
    clues: plan.map((clue) => ({
      key: clue.key, label: clue.label, sourceKind: clue.sourceKind,
      found: byKey.has(clue.key), observedAt: byKey.get(clue.key)?.observedAt.toISOString() ?? null,
    })),
    cluesFound: plan.filter((clue) => byKey.has(clue.key)).length,
    cluesRequired: plan.length,
    choices: branchesOf(row.branchKeys),
    chosenBranch: row.chosenBranch,
    acceptedAt: row.acceptedAt?.toISOString() ?? null,
    solvedAt: row.solvedAt?.toISOString() ?? null,
    closedAt: row.closedAt?.toISOString() ?? null,
    expiresAtActive: row.expiresAtActive.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}
async function getOwned(db: Db, caseId: string, ownerId: string): Promise<CaseRow> {
  // Fail closed: case IDs never authorize access without the owner constraint.
  const row = await db.criminalCaseFile.findFirst({
    where: { id: caseId, ownerId },
    include,
  });
  if (!row) throw AppError.notFound('CASE_NOT_FOUND', 'That case file is not available.');
  return row;
}
async function lockOwned(db: Db, caseId: string, ownerId: string): Promise<CaseRow> {
  const rows = await db.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "CriminalCaseFile"
    WHERE id = ${caseId} AND "ownerId" = ${ownerId} FOR UPDATE
  `;
  if (rows.length === 0) throw AppError.notFound('CASE_NOT_FOUND', 'That case file is not available.');
  return getOwned(db, caseId, ownerId);
}
async function roundForCase(db: Db, row: CaseRow): Promise<Round> {
  const round = await db.round.findUnique({ where: { id: row.roundId } });
  if (!round || round.rulesetId !== row.rulesetId || round.rulesetVersion !== row.rulesetVersion) {
    throw AppError.conflict('CASE_RULESET_CHANGED', 'This case belongs to a different round.');
  }
  return round;
}
function requirePlayable(round: Round): void {
  if (round.status !== 'ACTIVE' || round.pausedAt) {
    throw AppError.conflict('CASE_ROUND_UNAVAILABLE', 'Case work is unavailable while the round is paused or inactive.');
  }
}
async function persistExpiry(db: Db, row: CaseRow, round: Round, now: Date): Promise<CaseRow | null> {
  if (currentStatus(row, round, now) !== 'EXPIRED') return null;
  // Return an archived case instead of throwing: a throw would roll back the
  // same transaction's expiry write.
  await db.criminalCaseFile.updateMany({
    where: { id: row.id, status: { in: [...OPEN] } },
    data: { status: 'EXPIRED', expiredAt: now },
  });
  return getOwned(db, row.id, row.ownerId);
}

/**
 * B provides the model and transactional interfaces, not an event subscriber.
 * Only trusted settlement code can call this internal function. Source
 * identity, visibility, actors, and pinned ruleset are loaded from DB.
 *
 * Must be invoked in the settlement window, not as a historical backfill:
 * source active clock is captured using the round clock at source settlement.
 */
export const CriminalCaseFileService = {
  async offerFromCityMemory(db: Db, input: {
    ownerId: string; storyKey: string; cityMemoryId: string; now: Date;
  }): Promise<CriminalCaseFileDto | null> {
    const [player, memory] = await Promise.all([
      db.roundPlayer.findUnique({ where: { id: input.ownerId }, select: { id: true, roundId: true, cityId: true } }),
      db.cityMemoryEvent.findUnique({ where: { id: input.cityMemoryId } }),
    ]);
    if (!player || !memory || memory.roundId !== player.roundId || memory.cityId !== player.cityId) return null;
    const round = await db.round.findUnique({ where: { id: player.roundId } });
    if (!round || round.status !== 'ACTIVE' || round.pausedAt) return null;
    // Prevent retroactive invitations using a changed pause counter or old source.
    if (memory.happenedAt > input.now || input.now.getTime() - memory.happenedAt.getTime() > 60_000) return null;
    const ruleset = loadRulesetForRound(round);
    const def = livingStoryCatalogForRuleset(ruleset)[input.storyKey];
    if (!def || !def.enabled || !LIVING_CASE_BLUEPRINTS[def.caseKey]) return null;
    const actors = Array.isArray(memory.actors) ? memory.actors.filter((x): x is string => typeof x === 'string') : [];
    const decision = evaluateLivingStoryOffer(ruleset, input.storyKey, {
      roundId: memory.roundId, cityId: memory.cityId, sourceKind: 'CITY_MEMORY',
      sourceId: memory.id, eventKind: memory.kind,
      visibility: memory.visibility === 'public' ? 'public' : 'involved-only',
      actorRoundPlayerIds: actors,
      happenedAtActive: activeRoundEventTime(round, memory.happenedAt),
    }, {
      roundId: player.roundId, cityId: player.cityId, roundPlayerId: player.id,
      roundClock: round, now: input.now,
    });
    if (!decision.eligible) return null;
    const plan = LIVING_CASE_BLUEPRINTS[def.caseKey];
    const row = await db.criminalCaseFile.upsert({
      where: { offerDedupeKey: decision.dedupeKey },
      update: {},
      create: {
        roundId: round.id, ownerId: player.id, cityId: memory.cityId,
        rulesetId: round.rulesetId, rulesetVersion: round.rulesetVersion,
        storyKey: def.key, caseKey: def.caseKey,
        sourceMemoryId: memory.id, offerDedupeKey: decision.dedupeKey,
        cluePlan: plan.clues as unknown as Prisma.InputJsonValue,
        branchKeys: plan.branchKeys as unknown as Prisma.InputJsonValue,
        expiresAtActive: decision.expiresAtActive,
      },
      include,
    });
    return toDto(row, round, input.now);
  },

  /** A read never creates offers, evidence, expiry updates, XP or rewards. */
  async page(prisma: PrismaClient, roundId: string, ownerId: string, now = new Date()): Promise<CriminalCasePageDto> {
    const [round, records] = await Promise.all([
      prisma.round.findUnique({ where: { id: roundId }, select: { pausedAt: true, pausedMinutesTotal: true } }),
      prisma.criminalCaseFile.findMany({ where: { roundId, ownerId }, include, orderBy: { createdAt: 'desc' }, take: 100 }),
    ]);
    if (!round) throw AppError.notFound('ROUND_NOT_FOUND', 'Round not found.');
    const active: CriminalCaseFileDto[] = [], archived: CriminalCaseFileDto[] = [];
    for (const row of records) {
      const view = toDto(row, round, now);
      (view.status === 'LOCKED' || view.status === 'AVAILABLE' || view.status === 'ACTIVE' ? active : archived).push(view);
    }
    return { active, archived };
  },

  async get(prisma: PrismaClient, ownerId: string, caseId: string, now = new Date()): Promise<CriminalCaseFileDto> {
    const row = await prisma.criminalCaseFile.findFirst({ where: { id: caseId, ownerId }, include });
    if (!row) throw AppError.notFound('CASE_NOT_FOUND', 'That case file is not available.');
    const round = await prisma.round.findUnique({ where: { id: row.roundId }, select: { pausedAt: true, pausedMinutesTotal: true } });
    if (!round) throw AppError.notFound('ROUND_NOT_FOUND', 'Round not found.');
    return toDto(row, round, now);
  },

  async activate(prisma: PrismaClient, ownerId: string, caseId: string, now = new Date()): Promise<CriminalCaseFileDto> {
    return prisma.$transaction(async (tx) => {
      const row = await lockOwned(tx, caseId, ownerId);
      const round = await roundForCase(tx, row);
      requirePlayable(round);
      const expired = await persistExpiry(tx, row, round, now);
      if (expired) return toDto(expired, round, now);
      if (row.status === 'AVAILABLE') {
        await tx.criminalCaseFile.update({ where: { id: row.id }, data: { status: 'ACTIVE', acceptedAt: now } });
      } else if (row.status !== 'ACTIVE' && row.status !== 'SOLVED' && row.status !== 'CLOSED') {
        throw AppError.conflict('CASE_NOT_AVAILABLE', 'This case cannot be activated.');
      }
      return toDto(await getOwned(tx, caseId, ownerId), round, now);
    });
  },

  /**
   * Internal receipt hook for Slice D. Never exposed as a player POST.
   * The actual receipt is loaded from PlayerActivity and must be owned by
   * this same RoundPlayer, created after activation, and match the next clue.
   */
  async recordVerifiedActivity(prisma: PrismaClient, ownerId: string, caseId: string, activityId: string, now = new Date()): Promise<CriminalCaseFileDto> {
    return prisma.$transaction(async (tx) => {
      const row = await lockOwned(tx, caseId, ownerId);
      const round = await roundForCase(tx, row);
      requirePlayable(round);
      await requireNotExpired(tx, row, round, now);
      if (row.status !== 'ACTIVE') return toDto(row, round, now);
      const activity = await tx.playerActivity.findUnique({ where: { id: activityId }, select: { id: true, roundPlayerId: true, type: true, createdAt: true } });
      if (!activity || activity.roundPlayerId !== ownerId || !row.acceptedAt || activity.createdAt < row.acceptedAt || activity.createdAt > now) {
        return toDto(row, round, now);
      }
      const plan = cluesOf(row.cluePlan);
      const found = new Set(row.evidence.map((entry) => entry.clueKey));
      const next = plan.find((entry) => !found.has(entry.key));
      if (!next || next.eventType !== activity.type) return toDto(row, round, now);
      if (row.evidence.some((entry) => entry.sourceReceiptId === activity.id || entry.sourceKind === next.sourceKind)) {
        return toDto(row, round, now);
      }
      await tx.criminalCaseEvidence.create({
        data: {
          caseId: row.id, clueKey: next.key, sourceKind: next.sourceKind,
          sourceReceiptId: activity.id, observedAt: activity.createdAt,
        },
      });
      if (found.size + 1 >= plan.length) {
        await tx.criminalCaseFile.update({ where: { id: row.id }, data: { status: 'SOLVED', solvedAt: now } });
      }
      return toDto(await getOwned(tx, caseId, ownerId), round, now);
    });
  },

  /** No payout, combat or reputation effects in B. Only an audited story choice. */
  async close(prisma: PrismaClient, ownerId: string, caseId: string, branchKey: string, now = new Date()): Promise<CriminalCaseFileDto> {
    return prisma.$transaction(async (tx) => {
      const row = await lockOwned(tx, caseId, ownerId);
      const round = await roundForCase(tx, row);
      requirePlayable(round);
      if (row.status === 'CLOSED' && row.chosenBranch === branchKey) return toDto(row, round, now);
      if (row.status !== 'SOLVED') throw AppError.conflict('CASE_UNSOLVED', 'Find the evidence before reaching a conclusion.');
      if (!branchesOf(row.branchKeys).includes(branchKey)) throw AppError.badRequest('CASE_BRANCH_INVALID', 'Choose an available conclusion.');
      await tx.criminalCaseFile.update({ where: { id: row.id }, data: { status: 'CLOSED', chosenBranch: branchKey, chosenAt: now, closedAt: now } });
      return toDto(await getOwned(tx, caseId, ownerId), round, now);
    });
  },
};
