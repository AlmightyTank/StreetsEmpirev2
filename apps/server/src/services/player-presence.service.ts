import type { PrismaClient } from '@prisma/client';

/** Cross-tab limit: keep the online signal fresh without a DB write per click. */
export const PRESENCE_WRITE_INTERVAL_MS = 60_000;

/**
 * Check in a recently engaged player without settling turns, loans, or events.
 * updateMany's date predicate makes this throttle atomic across browser tabs.
 */
export async function recordPlayerPresence(
  prisma: PrismaClient,
  roundPlayerId: string,
  now = new Date(),
): Promise<void> {
  await prisma.roundPlayer.updateMany({
    where: {
      id: roundPlayerId,
      lastActiveAt: { lt: new Date(now.getTime() - PRESENCE_WRITE_INTERVAL_MS) },
    },
    data: { lastActiveAt: now },
  });
}
