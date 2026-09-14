import type { Prisma } from '@prisma/client';

export type Db = Prisma.TransactionClient;

/**
 * Section 51. Take a row lock on the player before reading anything we are
 * about to base a write on.
 *
 * Every resource-changing path runs inside a transaction that starts here, so
 * two requests racing each other (a double click, a retry, a background poll
 * landing on top of an action) serialise instead of both reading the same
 * balance and both spending it.
 */
export async function lockRoundPlayer(db: Db, roundPlayerId: string): Promise<void> {
  await db.$queryRaw`SELECT id FROM "RoundPlayer" WHERE id = ${roundPlayerId} FOR UPDATE`;
}

/** Serialise lifecycle transitions for one round. */
export async function lockRound(db: Db, roundId: string): Promise<void> {
  await db.$queryRaw`SELECT id FROM "Round" WHERE id = ${roundId} FOR UPDATE`;
}
