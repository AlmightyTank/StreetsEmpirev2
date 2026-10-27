import type { Prisma } from '@prisma/client';
import { AppError } from '../utils/errors.js';
import type { Db } from '../utils/db.js';
import { createPlayerActivity } from './in-app-notification.service.js';

export const SPORTS_INFLUENCE_QUEST_KEY = 'FAVOR_ON_THE_LINE';

export type SportsInfluenceContract = {
  eventId: string;
  sport: string;
  homeTeam: string;
  awayTeam: string;
  startsAt: string;
  targetTeam: 'HOME' | 'AWAY';
  desiredOutcome: 'WIN' | 'LOSE';
  targetRole: string;
  resolved?: SportsInfluenceResolution;
};

export type SportsInfluenceResolution = {
  actualOutcome: 'WIN' | 'LOSE' | 'NO_EFFECT';
  success: boolean;
  exposure: 'LOW' | 'MEDIUM' | 'HIGH';
  heatDelta: number;
};

export type SportsInfluenceContractStatus = 'ACTIVE' | 'RESOLVED' | 'SUCCEEDED' | 'FAILED' | 'BACKFIRED' | 'CANCELED' | 'EXPIRED';

type RewardState = Record<string, unknown>;

function stableNumber(value: string): number {
  let hash = 2166136261;
  for (const char of value) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
}

function rewardState(value: Prisma.JsonValue): RewardState {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as RewardState : {};
}

export function sportsInfluenceContract(value: Prisma.JsonValue): SportsInfluenceContract | null {
  const state = rewardState(value).sportsInfluence;
  if (!state || typeof state !== 'object' || Array.isArray(state)) return null;
  const contract = state as Record<string, unknown>;
  if (typeof contract.eventId !== 'string' || typeof contract.startsAt !== 'string') return null;
  if (contract.targetTeam !== 'HOME' && contract.targetTeam !== 'AWAY') return null;
  if (contract.desiredOutcome !== 'WIN' && contract.desiredOutcome !== 'LOSE') return null;
  return contract as unknown as SportsInfluenceContract;
}

export function isSportsInfluenceQuest(key: string): boolean {
  return key === SPORTS_INFLUENCE_QUEST_KEY;
}

export async function createSportsInfluenceContract(tx: Db, now: Date): Promise<SportsInfluenceContract> {
  const event = await tx.sportsbookEvent.findFirst({
    where: { status: 'PRE', startsAt: { gt: now } },
    orderBy: { startsAt: 'asc' },
    select: { id: true, sport: true, homeTeam: true, awayTeam: true, startsAt: true },
  });
  if (!event) throw AppError.conflict('SPORTS_INFLUENCE_UNAVAILABLE', 'Vic has no upcoming game to work right now.');
  const homeTarget = stableNumber(event.id) % 2 === 0;
  return {
    eventId: event.id,
    sport: event.sport,
    homeTeam: event.homeTeam,
    awayTeam: event.awayTeam,
    startsAt: event.startsAt.toISOString(),
    targetTeam: homeTarget ? 'HOME' : 'AWAY',
    desiredOutcome: stableNumber(`${event.id}:outcome`) % 2 === 0 ? 'WIN' : 'LOSE',
    targetRole: ({ NFL: 'starting quarterback', NBA: 'captain', MLB: 'starting pitcher', NHL: 'starting goalie' } as Record<string, string>)[event.sport] ?? 'key player',
  };
}

export function resolveSportsInfluence(
  contract: SportsInfluenceContract,
  branchKey: string | null,
  heat: number,
  now: Date,
  actualOutcome?: SportsInfluenceResolution['actualOutcome'],
): SportsInfluenceResolution {
  const roll = stableNumber(`${contract.eventId}:${branchKey ?? 'UNSELECTED'}:${contract.desiredOutcome}`) % 100;
  const approachBonus = branchKey === 'ACE_ACCESS' || branchKey === 'LEDGER_COVER' ? 12 : branchKey === 'TOMMY_PRESSURE' ? 6 : 0;
  const success = actualOutcome !== undefined
    ? actualOutcome === contract.desiredOutcome
    : roll < 48 + approachBonus - Math.min(heat, 20);
  const resolvedOutcome = actualOutcome ?? (success ? contract.desiredOutcome : roll % 3 === 0 ? 'NO_EFFECT' : contract.desiredOutcome === 'WIN' ? 'LOSE' : 'WIN');
  const exposure = branchKey === 'TOMMY_PRESSURE' ? 'HIGH' : heat >= 40 ? 'HIGH' : branchKey === 'ACE_ACCESS' ? 'LOW' : 'MEDIUM';
  return { actualOutcome: resolvedOutcome, success, exposure, heatDelta: exposure === 'HIGH' ? 8 : exposure === 'MEDIUM' ? 4 : 2 };
}

export function linkedSportsInfluenceEventIds(value: Prisma.JsonValue): string[] {
  const contract = sportsInfluenceContract(value);
  return contract && !contract.resolved ? [contract.eventId] : [];
}

export function resolvedRewardState(value: Prisma.JsonValue, resolution: SportsInfluenceResolution): Prisma.InputJsonValue {
  const state = rewardState(value);
  return { ...state, sportsInfluence: { ...sportsInfluenceContract(value), resolved: resolution } } as Prisma.InputJsonValue;
}

function resolutionForEvent(
  contract: SportsInfluenceContract,
  event: { status: string; homeScore: number | null; awayScore: number | null },
  branchKey: string | null,
  heat: number,
  now: Date,
): SportsInfluenceResolution {
  if (event.status === 'VOID' || event.homeScore === null || event.awayScore === null) {
    return { actualOutcome: 'NO_EFFECT', success: false, exposure: 'MEDIUM', heatDelta: 1 };
  }
  const targetScore = contract.targetTeam === 'HOME' ? event.homeScore : event.awayScore;
  const otherScore = contract.targetTeam === 'HOME' ? event.awayScore : event.homeScore;
  const actualOutcome = targetScore === otherScore ? 'NO_EFFECT' : targetScore > otherScore ? 'WIN' : 'LOSE';
  return resolveSportsInfluence(contract, branchKey, heat, now, actualOutcome);
}

/** Create the durable audit row alongside the PlayerQuest offer. */
export async function persistSportsInfluenceContract(
  tx: Db,
  input: { roundPlayerId: string; playerQuestId: string; contract: SportsInfluenceContract; acceptedAt: Date; deadlineAt: Date },
): Promise<void> {
  await tx.sportsInfluenceContract.upsert({
    where: { playerQuestId: input.playerQuestId },
    create: {
      roundPlayerId: input.roundPlayerId,
      playerQuestId: input.playerQuestId,
      sportsbookEventId: input.contract.eventId,
      targetTeam: input.contract.targetTeam,
      targetRole: input.contract.targetRole,
      desiredOutcome: input.contract.desiredOutcome,
      acceptedAt: input.acceptedAt,
      deadlineAt: input.deadlineAt,
    },
    update: {
      roundPlayerId: input.roundPlayerId,
      sportsbookEventId: input.contract.eventId,
      targetTeam: input.contract.targetTeam,
      targetRole: input.contract.targetRole,
      desiredOutcome: input.contract.desiredOutcome,
      approach: null,
      status: 'ACTIVE',
      actualOutcome: null,
      success: null,
      heatDelta: 0,
      evidenceGenerated: {},
      acceptedAt: input.acceptedAt,
      deadlineAt: input.deadlineAt,
      resolvedAt: null,
      claimedAt: null,
    },
  });
}

/** Cancel an abandoned attempt without deleting its audit history. */
export async function cancelSportsInfluenceContract(tx: Db, playerQuestId: string, now: Date): Promise<void> {
  await tx.sportsInfluenceContract.updateMany({
    where: { playerQuestId, status: 'ACTIVE' },
    data: { status: 'CANCELED', resolutionReason: 'PLAYER_ABANDONED', resolvedAt: now },
  });
}

/** Resolve every active contract when the canonical sportsbook event is graded. */
export async function resolveSportsInfluencesForEventTx(tx: Db, eventId: string, now: Date): Promise<number> {
  const event = await tx.sportsbookEvent.findUnique({
    where: { id: eventId },
    select: { id: true, status: true, homeScore: true, awayScore: true },
  });
  if (!event) return 0;
  const contracts = await tx.sportsInfluenceContract.findMany({
    where: { sportsbookEventId: eventId, status: 'ACTIVE' },
    include: { playerQuest: true },
  });
  let resolved = 0;
  for (const durable of contracts) {
    const snapshot = sportsInfluenceContract(durable.playerQuest.rewardState);
    if (!snapshot) continue;
    const resolution = resolutionForEvent(snapshot, event, durable.approach, 0, now);
    const status: SportsInfluenceContractStatus = event.status === 'VOID'
      ? 'CANCELED'
      : resolution.success ? 'SUCCEEDED' : resolution.exposure === 'HIGH' ? 'BACKFIRED' : 'FAILED';
    await tx.sportsInfluenceContract.update({
      where: { id: durable.id },
      data: {
        status,
        actualOutcome: resolution.actualOutcome,
        success: resolution.success,
        exposure: resolution.exposure,
        heatDelta: resolution.heatDelta,
        resolutionReason: event.status === 'VOID' ? 'SPORTSBOOK_EVENT_VOID' : 'SPORTSBOOK_EVENT_SETTLED',
        resolvedAt: now,
      },
    });
    await tx.playerQuest.update({
      where: { id: durable.playerQuestId },
      data: { rewardState: resolvedRewardState(durable.playerQuest.rewardState, resolution) },
    });
    await createPlayerActivity(tx, durable.roundPlayerId, 'QUEST_STORY_SCENE', {
      questKey: SPORTS_INFLUENCE_QUEST_KEY,
      sceneKey: 'SPORTS_INFLUENCE_RESOLVED',
      eventId,
      actualOutcome: resolution.actualOutcome,
      success: resolution.success,
      exposure: resolution.exposure,
    });
    resolved += 1;
  }
  return resolved;
}

/** Claim-time guard and fallback for events settled before the resolver hook was deployed. */
export async function resolveSportsInfluenceForClaim(
  tx: Db,
  playerQuestId: string,
  branchKey: string | null,
  heat: number,
  now: Date,
): Promise<SportsInfluenceResolution | null> {
  const durable = await tx.sportsInfluenceContract.findUnique({
    where: { playerQuestId },
    include: { sportsbookEvent: true, playerQuest: true },
  });
  if (!durable) return null;
  if (durable.status === 'ACTIVE') {
    if (!durable.sportsbookEvent.settledAt) {
      throw AppError.conflict('SPORTS_INFLUENCE_PENDING', 'Vic is waiting on the official result before closing this favor.');
    }
    const snapshot = sportsInfluenceContract(durable.playerQuest.rewardState);
    if (snapshot) {
      const resolution = resolutionForEvent(snapshot, durable.sportsbookEvent, branchKey, heat, now);
      const status: SportsInfluenceContractStatus = durable.sportsbookEvent.status === 'VOID'
        ? 'CANCELED' : resolution.success ? 'SUCCEEDED' : resolution.exposure === 'HIGH' ? 'BACKFIRED' : 'FAILED';
      await tx.sportsInfluenceContract.update({ where: { id: durable.id }, data: {
        status, actualOutcome: resolution.actualOutcome, success: resolution.success,
        exposure: resolution.exposure, heatDelta: resolution.heatDelta, resolvedAt: now,
        resolutionReason: durable.sportsbookEvent.status === 'VOID' ? 'SPORTSBOOK_EVENT_VOID' : 'SPORTSBOOK_EVENT_SETTLED',
      } });
      await tx.playerQuest.update({ where: { id: playerQuestId }, data: { rewardState: resolvedRewardState(durable.playerQuest.rewardState, resolution) } });
      return resolution;
    }
  }
  const resolution = durable.actualOutcome && durable.success !== null
    ? resolveSportsInfluence(
      sportsInfluenceContract(durable.playerQuest.rewardState) ?? {
        eventId: durable.sportsbookEventId, sport: durable.sportsbookEvent.sport,
        homeTeam: durable.sportsbookEvent.homeTeam, awayTeam: durable.sportsbookEvent.awayTeam,
        startsAt: durable.sportsbookEvent.startsAt.toISOString(), targetTeam: durable.targetTeam as 'HOME' | 'AWAY',
        desiredOutcome: durable.desiredOutcome as 'WIN' | 'LOSE', targetRole: durable.targetRole,
      },
      branchKey,
      heat,
      now,
      durable.actualOutcome as SportsInfluenceResolution['actualOutcome'],
    )
    : null;
  if (resolution) {
    const status: SportsInfluenceContractStatus = resolution.actualOutcome === 'NO_EFFECT'
      ? 'CANCELED' : resolution.success ? 'SUCCEEDED' : resolution.exposure === 'HIGH' ? 'BACKFIRED' : 'FAILED';
    await tx.sportsInfluenceContract.update({ where: { id: durable.id }, data: {
      approach: branchKey, status, exposure: resolution.exposure, heatDelta: resolution.heatDelta, claimedAt: now,
      evidenceGenerated: resolution.exposure === 'HIGH' ? { kind: 'SUSPICIOUS_CONTACT', severity: 'HIGH' } : {},
    } });
  }
  return resolution;
}

/** Staff-only audit view; deliberately exposes IDs and outcomes, never wager balances. */
export async function sportsInfluenceAdminReport(prisma: Db, limit = 500) {
  const rows = await prisma.sportsInfluenceContract.findMany({
    orderBy: { createdAt: 'desc' },
    take: Math.min(Math.max(limit, 1), 1_000),
    include: {
      sportsbookEvent: { select: { sport: true, homeTeam: true, awayTeam: true, startsAt: true, status: true, homeScore: true, awayScore: true } },
      roundPlayer: { select: { id: true, roundId: true, displayName: true, accountId: true } },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    roundPlayerId: row.roundPlayerId,
    roundId: row.roundPlayer.roundId,
    displayName: row.roundPlayer.displayName,
    accountId: row.roundPlayer.accountId,
    playerQuestId: row.playerQuestId,
    sportsbookEventId: row.sportsbookEventId,
    event: {
      sport: row.sportsbookEvent.sport,
      homeTeam: row.sportsbookEvent.homeTeam,
      awayTeam: row.sportsbookEvent.awayTeam,
      startsAt: row.sportsbookEvent.startsAt.toISOString(),
      status: row.sportsbookEvent.status,
      homeScore: row.sportsbookEvent.homeScore,
      awayScore: row.sportsbookEvent.awayScore,
    },
    targetTeam: row.targetTeam,
    targetRole: row.targetRole,
    desiredOutcome: row.desiredOutcome,
    approach: row.approach,
    difficulty: row.difficulty,
    influencePower: row.influencePower,
    exposure: row.exposure,
    evidenceGenerated: row.evidenceGenerated,
    status: row.status,
    actualOutcome: row.actualOutcome,
    success: row.success,
    heatDelta: row.heatDelta,
    resolutionReason: row.resolutionReason,
    acceptedAt: row.acceptedAt.toISOString(),
    deadlineAt: row.deadlineAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    claimedAt: row.claimedAt?.toISOString() ?? null,
  }));
}
