import type { GameEventType, PrismaClient } from '@prisma/client';

const SCHEDULED_EVENT_TYPES = ['COMMUNITY', 'SEASONAL', 'CITY_CONDITION'] as const;

export interface EventLifecycleSweepResult {
  activated: number;
  expired: number;
  resumed: number;
}

function lifecycleDedupeKey(type: GameEventType, occurrenceId: string, action: 'ACTIVATED' | 'EXPIRED'): string {
  const prefix = type === 'COMMUNITY' ? 'community'
    : type === 'SEASONAL' ? 'seasonal'
      : type === 'CITY_CONDITION' ? 'city-condition'
        : 'random-encounter';
  return `${prefix}:${occurrenceId}:${action.toLowerCase()}`;
}

/**
 * Reconcile clock-driven event occurrences after downtime and while the server is running.
 * ACTIVE rows are already durable and need no restart mutation; `resumed` reports the rows
 * that were found still in progress. Action-triggered encounters keep their own settlement path.
 */
export const EventLifecycleService = {
  async sweep(prisma: PrismaClient, now = new Date()): Promise<EventLifecycleSweepResult> {
    const rows = await prisma.gameEventOccurrence.findMany({
      where: {
        status: { in: ['SCHEDULED', 'ACTIVE'] },
        definition: { type: { in: [...SCHEDULED_EVENT_TYPES] } },
      },
      select: {
        id: true,
        status: true,
        startsAt: true,
        endsAt: true,
        definition: { select: { type: true, isEnabled: true } },
        round: { select: { pausedAt: true } },
      },
    });

    const result: EventLifecycleSweepResult = { activated: 0, expired: 0, resumed: 0 };
    for (const row of rows) {
      // Round-clock events do not advance while an administrator has paused the round.
      if (row.round?.pausedAt) continue;

      if (row.endsAt && row.endsAt <= now) {
        const changed = await prisma.gameEventOccurrence.updateMany({
          where: { id: row.id, status: { in: ['SCHEDULED', 'ACTIVE'] } },
          data: { status: 'EXPIRED', expiredAt: now },
        });
        if (changed.count > 0) {
          result.expired += 1;
          await prisma.gameEventHistory.createMany({
            data: [{
              occurrenceId: row.id,
              action: 'EXPIRED',
              dedupeKey: lifecycleDedupeKey(row.definition.type, row.id, 'EXPIRED'),
              happenedAt: now,
            }],
            skipDuplicates: true,
          });
        }
        continue;
      }

      if (row.status === 'ACTIVE') {
        result.resumed += 1;
        continue;
      }

      if (row.definition.isEnabled && row.startsAt && row.startsAt <= now) {
        const changed = await prisma.gameEventOccurrence.updateMany({
          where: { id: row.id, status: 'SCHEDULED' },
          data: { status: 'ACTIVE', activatedAt: now },
        });
        if (changed.count > 0) {
          result.activated += 1;
          await prisma.gameEventHistory.createMany({
            data: [{
              occurrenceId: row.id,
              action: 'ACTIVATED',
              dedupeKey: lifecycleDedupeKey(row.definition.type, row.id, 'ACTIVATED'),
              happenedAt: now,
            }],
            skipDuplicates: true,
          });
        }
      }
    }
    return result;
  },
};
