import type { ActivityType, Prisma } from '@prisma/client';
import {
  applyQuestProgress,
  type QuestDataObject,
  type QuestDataValue,
  type QuestObjectiveDefinition,
  type QuestObjectiveKind,
  type QuestProgressEvent,
  type QuestProgressMap,
} from '@streets/rulesets';
import type { Db } from '../utils/db.js';

const ACTIVE_STATUSES = ['ACTIVE', 'READY_TO_TURN_IN'] as const;
const OBJECTIVE_KINDS = new Set<QuestObjectiveKind>([
  'EVENT_COUNT',
  'EVENT_SUM',
  'SPEND_TURNS',
  'EARN_CASH',
  'RECRUIT_CREW',
  'WIN_EVENTS',
  'STATE_AT_LEAST',
]);

export interface QuestProgressSignal {
  sourceKey: string;
  type: string;
  payload: QuestDataValue;
  at?: Date;
}

export interface QuestProgressResult {
  considered: number;
  matched: number;
  advanced: number;
  readied: number;
  reopened: number;
  expired: number;
  duplicate: number;
}

function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function objectives(value: Prisma.JsonValue): QuestObjectiveDefinition[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
    const row = raw as Record<string, unknown>;
    if (
      typeof row.id !== 'string'
      || typeof row.kind !== 'string'
      || !OBJECTIVE_KINDS.has(row.kind as QuestObjectiveKind)
      || typeof row.description !== 'string'
      || typeof row.target !== 'number'
      || !Number.isFinite(row.target)
      || row.target <= 0
    ) return [];

    return [{
      id: row.id,
      kind: row.kind as QuestObjectiveKind,
      description: row.description,
      target: row.target,
      ...(row.params && typeof row.params === 'object' && !Array.isArray(row.params)
        ? { params: row.params as never }
        : {}),
    }];
  });
}

function progress(value: Prisma.JsonValue): QuestProgressMap {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result: Record<string, { current: number; target: number; completed: boolean }> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const row = raw as Record<string, unknown>;
    if (typeof row.current !== 'number' || typeof row.target !== 'number') continue;
    result[key] = {
      current: row.current,
      target: row.target,
      completed: row.completed === true,
    };
  }
  return result;
}

async function playerState(db: Db, roundPlayerId: string): Promise<QuestDataObject | undefined> {
  const row = await db.roundPlayer.findUnique({
    where: { id: roundPlayerId },
    select: {
      cashCents: true,
      turns: true,
      payoutPercent: true,
      whores: true,
      thugs: true,
      woundedThugs: true,
      busyThugs: true,
      postedThugs: true,
      condoms: true,
      medicine: true,
      crack: true,
      beer: true,
      pistols: true,
      shotguns: true,
      tek9s: true,
      ak47s: true,
      lowRiders: true,
      shotgunUnlocked: true,
      tek9Unlocked: true,
      ak47Unlocked: true,
      heat: true,
      netWorthCents: true,
      hideoutSafeRoomLevel: true,
      hideoutLookoutsLevel: true,
      hideoutWorkshopLevel: true,
      hideoutBackOfficeLevel: true,
      hideoutGarageLevel: true,
      allianceId: true,
      city: { select: { slug: true } },
    },
  });
  if (!row) return undefined;

  const fitThugs = Math.max(0, row.thugs - row.woundedThugs - row.busyThugs - row.postedThugs);
  const weapons = row.pistols + row.shotguns + row.tek9s + row.ak47s;

  return {
    cashCents: Number(row.cashCents),
    turns: row.turns,
    payoutPercent: row.payoutPercent,
    whores: row.whores,
    thugs: row.thugs,
    fitThugs,
    woundedThugs: row.woundedThugs,
    busyThugs: row.busyThugs,
    postedThugs: row.postedThugs,
    armedThugs: Math.min(fitThugs, weapons),
    condoms: row.condoms,
    medicine: row.medicine,
    crack: row.crack,
    beer: row.beer,
    pistols: row.pistols,
    shotguns: row.shotguns,
    tek9s: row.tek9s,
    ak47s: row.ak47s,
    lowRiders: row.lowRiders,
    shotgunUnlocked: row.shotgunUnlocked,
    tek9Unlocked: row.tek9Unlocked,
    ak47Unlocked: row.ak47Unlocked,
    heat: row.heat,
    netWorthCents: Number(row.netWorthCents),
    hideoutSafeRoomLevel: row.hideoutSafeRoomLevel,
    hideoutLookoutsLevel: row.hideoutLookoutsLevel,
    hideoutWorkshopLevel: row.hideoutWorkshopLevel,
    hideoutBackOfficeLevel: row.hideoutBackOfficeLevel,
    hideoutGarageLevel: row.hideoutGarageLevel,
    allianceId: row.allianceId,
    city: row.city.slug,
  };
}

async function lockPlayerQuest(db: Db, id: string): Promise<void> {
  await db.$queryRaw`SELECT id FROM "PlayerQuest" WHERE id = ${id} FOR UPDATE`;
}

export const QuestProgressService = {
  async recordActivity(
    db: Db,
    activity: {
      id: string;
      roundPlayerId: string;
      type: ActivityType;
      payload: Prisma.JsonValue;
      createdAt: Date;
    },
  ): Promise<QuestProgressResult> {
    return this.emit(db, activity.roundPlayerId, {
      sourceKey: `activity:${activity.id}`,
      type: activity.type,
      payload: activity.payload as unknown as QuestDataValue,
      at: activity.createdAt,
    });
  },

  async emit(
    db: Db,
    roundPlayerId: string,
    signal: QuestProgressSignal,
  ): Promise<QuestProgressResult> {
    const at = signal.at ?? new Date();
    const result: QuestProgressResult = {
      considered: 0,
      matched: 0,
      advanced: 0,
      readied: 0,
      reopened: 0,
      expired: 0,
      duplicate: 0,
    };

    const candidates = await db.playerQuest.findMany({
      where: { roundPlayerId, status: { in: [...ACTIVE_STATUSES] } },
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    if (candidates.length === 0) return result;

    const state = await playerState(db, roundPlayerId);
    const event: QuestProgressEvent = {
      type: signal.type,
      payload: signal.payload,
      ...(state ? { state } : {}),
    };

    for (const candidate of candidates) {
      await lockPlayerQuest(db, candidate.id);
      const playerQuest = await db.playerQuest.findUnique({
        where: { id: candidate.id },
        include: { questDefinition: true },
      });
      if (!playerQuest || !ACTIVE_STATUSES.includes(playerQuest.status as typeof ACTIVE_STATUSES[number])) continue;

      result.considered += 1;

      if (playerQuest.expiresAt && playerQuest.expiresAt.getTime() <= at.getTime()) {
        await db.playerQuest.update({
          where: { id: playerQuest.id },
          data: { status: 'EXPIRED' },
        });
        result.expired += 1;
        continue;
      }

      const prior = await db.questProgressReceipt.findUnique({
        where: {
          playerQuestId_sourceKey: {
            playerQuestId: playerQuest.id,
            sourceKey: signal.sourceKey,
          },
        },
        select: { id: true },
      });
      if (prior) {
        result.duplicate += 1;
        continue;
      }

      const required = applyQuestProgress(
        objectives(playerQuest.questDefinition.objectives),
        progress(playerQuest.objectiveProgress),
        event,
      );
      const bonus = applyQuestProgress(
        objectives(playerQuest.questDefinition.bonusObjectives),
        progress(playerQuest.bonusProgress),
        event,
      );

      if (!required.matched && !bonus.matched) continue;
      result.matched += 1;

      await db.questProgressReceipt.create({
        data: {
          playerQuestId: playerQuest.id,
          sourceKey: signal.sourceKey,
          eventType: signal.type,
          applied: json({
            required: required.deltas,
            bonus: bonus.deltas,
          }),
        },
      });

      if (!required.changed && !bonus.changed) continue;

      const becameReady = playerQuest.status === 'ACTIVE' && required.completed;
      const becameUnready = playerQuest.status === 'READY_TO_TURN_IN' && !required.completed;
      await db.playerQuest.update({
        where: { id: playerQuest.id },
        data: {
          objectiveProgress: json(required.progress),
          bonusProgress: json(bonus.progress),
          ...(becameReady
            ? { status: 'READY_TO_TURN_IN', completedAt: playerQuest.completedAt ?? at }
            : becameUnready
              ? { status: 'ACTIVE', completedAt: null }
              : {}),
        },
      });

      result.advanced += 1;
      if (becameReady) result.readied += 1;
      if (becameUnready) result.reopened += 1;
    }

    return result;
  },
};
