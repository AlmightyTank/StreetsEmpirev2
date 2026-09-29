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

/**
 * 1.0.0-C. Lock another player only if nobody holds them right now. For work
 * done on someone else's behalf (settling a rival's corner while you scout it):
 * when they are busy, their own transaction is already settling them, and
 * waiting would risk a deadlock with a player doing the same thing back.
 */
export async function tryLockRoundPlayer(db: Db, roundPlayerId: string): Promise<boolean> {
  const rows = await db.$queryRaw<Array<{ id: string }>>`SELECT id FROM "RoundPlayer" WHERE id = ${roundPlayerId} FOR UPDATE SKIP LOCKED`;
  return rows.length > 0;
}

/** Serialise lifecycle transitions for one round. */
export async function lockRound(db: Db, roundId: string): Promise<void> {
  await db.$queryRaw`SELECT id FROM "Round" WHERE id = ${roundId} FOR UPDATE`;
}

/** Serialise admin moderation of one account. */
export async function lockAccount(db: Db, accountId: string): Promise<void> {
  await db.$queryRaw`SELECT id FROM "Account" WHERE id = ${accountId} FOR UPDATE`;
}
