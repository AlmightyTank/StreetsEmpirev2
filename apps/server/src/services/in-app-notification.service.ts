import type { ActivityType, Prisma, PrismaClient } from '@prisma/client';
import type { ActivityDto, InAppNotificationFeedDto } from '@streets/shared';
import type { Db } from '../utils/db.js';

const ALWAYS_NOTIFIABLE = new Set<ActivityType>([
  'QUEST_OBJECTIVE_COMPLETE',
  'QUEST_READY',
  'AWAY_BONUS',
  'ADMIN_GRANT',
  'BATTLE_VOIDED',
  'RAID_DEFENSE',
  'DRIVE_BY_DEFENSE',
  'CONVOY_DEFENSE',
  'TURF_PUSH_DEFENSE',
  'RUN_RETURNED',
  'RUN_INCIDENT',
  'CONVOY_BACKUP',
  'TURF_CLAIM',
  'TURF_PUSH_ATTACK',
  'TURF_PUSH_BACKUP',
]);

function objectPayload(payload: Prisma.InputJsonValue): Record<string, unknown> {
  return payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : {};
}

/** Keep this predicate aligned with gameEventToastFor on the web client. */
export function shouldCreateInAppNotification(type: ActivityType, payload: Prisma.InputJsonValue): boolean {
  if (ALWAYS_NOTIFIABLE.has(type)) return true;
  const p = objectPayload(payload);
  if (type === 'QUEST_CLAIMED') return Array.isArray(p.newlyAvailable) && p.newlyAvailable.length > 0;
  if (type === 'SCOUT' || type === 'PRODUCE_CRACK') return p.busted === true;
  return false;
}

/**
 * The only low-level activity writer. Quest progress calls this directly for
 * derived quest events so they become bell notifications without recursively
 * advancing quest progress again.
 */
export async function createPlayerActivity(
  db: Db,
  roundPlayerId: string,
  type: ActivityType,
  payload: Prisma.InputJsonValue,
) {
  const activity = await db.playerActivity.create({
    data: { roundPlayerId, type, payload },
  });

  if (shouldCreateInAppNotification(type, payload)) {
    await db.inAppNotification.create({
      data: {
        id: activity.id,
        activityId: activity.id,
        roundPlayerId,
        createdAt: activity.createdAt,
      },
    });
  }

  return activity;
}

function activityDto(activity: {
  id: string;
  type: ActivityType;
  payload: Prisma.JsonValue;
  createdAt: Date;
}): ActivityDto {
  return {
    id: activity.id,
    type: activity.type as ActivityDto['type'],
    payload: activity.payload as Record<string, unknown>,
    createdAt: activity.createdAt.toISOString(),
  };
}

async function currentRoundPlayerId(prisma: PrismaClient, accountId: string, now = new Date()): Promise<string | null> {
  const active = await prisma.roundPlayer.findFirst({
    where: {
      accountId,
      round: { status: 'ACTIVE', endsAt: { gt: now } },
    },
    orderBy: { round: { startsAt: 'desc' } },
    select: { id: true },
  });
  if (active) return active.id;

  const registration = await prisma.roundPlayer.findFirst({
    where: {
      accountId,
      round: { status: 'REGISTRATION', endsAt: { gt: now } },
    },
    orderBy: { round: { startsAt: 'asc' } },
    select: { id: true },
  });
  return registration?.id ?? null;
}

export const InAppNotificationService = {
  async inbox(prisma: PrismaClient, accountId: string, limit = 40): Promise<InAppNotificationFeedDto> {
    const roundPlayerId = await currentRoundPlayerId(prisma, accountId);
    if (!roundPlayerId) {
      return { unreadCount: 0, notifications: [] };
    }

    const [rows, unreadCount] = await Promise.all([
      prisma.inAppNotification.findMany({
        where: { roundPlayerId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true,
          readAt: true,
          activity: { select: { id: true, type: true, payload: true, createdAt: true } },
        },
      }),
      prisma.inAppNotification.count({
        where: { roundPlayerId, readAt: null },
      }),
    ]);

    return {
      unreadCount,
      notifications: rows.map((row) => ({
        id: row.id,
        readAt: row.readAt?.toISOString() ?? null,
        activity: activityDto(row.activity),
      })),
    };
  },

  async read(prisma: PrismaClient, accountId: string, id: string, now = new Date()) {
    const roundPlayerId = await currentRoundPlayerId(prisma, accountId, now);
    if (!roundPlayerId) return { ok: true as const };

    await prisma.inAppNotification.updateMany({
      where: { id, roundPlayerId, readAt: null },
      data: { readAt: now },
    });
    return { ok: true as const };
  },

  async readAll(prisma: PrismaClient, accountId: string, now = new Date()) {
    const roundPlayerId = await currentRoundPlayerId(prisma, accountId, now);
    if (!roundPlayerId) return { ok: true as const };

    await prisma.inAppNotification.updateMany({
      where: { roundPlayerId, readAt: null },
      data: { readAt: now },
    });
    return { ok: true as const };
  },
};
