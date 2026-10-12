import { Prisma, type Account, type PrismaClient } from '@prisma/client';
import { normalizeUsername, usernameChangeStatus, USERNAME_HOLD_DAYS, type UsernameChangeStatusDto } from '@streets/shared';
import { lockAccount, type Db } from '../utils/db.js';
import { AppError } from '../utils/errors.js';

const DAY_MS = 86_400_000;

type Reader = Db | PrismaClient;

/** Rounds that have actually started since the player's last name change. */
async function roundsStartedSince(db: Reader, since: Date | null, now: Date): Promise<number> {
  if (!since) return 0;
  return db.round.count({
    where: { startsAt: { gt: since, lte: now }, status: { in: ['ACTIVE', 'ENDED', 'ARCHIVED'] } },
  });
}

/**
 * Who a recently given-up name is held for, if anyone. A player's old name is held for
 * them; a name staff took away is held from everyone.
 */
async function holdOn(db: Reader, usernameNormalized: string, now: Date): Promise<{ accountId: string; source: string; until: Date } | null> {
  const row = await db.accountUsernameChange.findFirst({
    where: { fromUsernameNormalized: usernameNormalized, createdAt: { gt: new Date(now.getTime() - USERNAME_HOLD_DAYS * DAY_MS) } },
    orderBy: { createdAt: 'desc' },
    select: { accountId: true, source: true, createdAt: true },
  });
  return row ? { accountId: row.accountId, source: row.source, until: new Date(row.createdAt.getTime() + USERNAME_HOLD_DAYS * DAY_MS) } : null;
}

function day(date: Date): string {
  return date.toUTCString().slice(5, 16);
}

/**
 * The name the player gave up in their latest change, while it is still held for them.
 * Taking it back is free, once: the take-back is recorded as a REVERT, which is never
 * itself reclaimable, so nobody can flip between two names.
 */
async function reclaimFor(db: Reader, account: Pick<Account, 'id' | 'usernameNormalized'>, now: Date): Promise<UsernameChangeStatusDto['reclaim']> {
  const latest = await db.accountUsernameChange.findFirst({
    where: { accountId: account.id },
    orderBy: { createdAt: 'desc' },
    select: { fromUsername: true, fromUsernameNormalized: true, source: true, createdAt: true },
  });
  if (!latest || latest.source !== 'PLAYER' || latest.fromUsernameNormalized === account.usernameNormalized) return null;
  const until = new Date(latest.createdAt.getTime() + USERNAME_HOLD_DAYS * DAY_MS);
  if (now >= until) return null;
  const taken = await db.account.findFirst({ where: { usernameNormalized: latest.fromUsernameNormalized, id: { not: account.id } }, select: { id: true } });
  return taken ? null : { username: latest.fromUsername, until: until.toISOString() };
}

async function statusFor(db: Reader, account: Pick<Account, 'id' | 'usernameNormalized' | 'usernameChangedAt'>, now: Date): Promise<UsernameChangeStatusDto> {
  return usernameChangeStatus({
    lastChangedAt: account.usernameChangedAt,
    roundsStartedSince: await roundsStartedSince(db, account.usernameChangedAt, now),
    now,
    reclaim: await reclaimFor(db, account, now),
  });
}

function cooldownMessage(status: UsernameChangeStatusDto): string {
  const left = status.cooldownRounds - status.roundsSinceChange;
  const when = status.availableAt ? day(new Date(status.availableAt)) : 'soon';
  const back = status.reclaim ? ` You can still take back ${status.reclaim.username} for free until ${day(new Date(status.reclaim.until))}.` : '';
  return `You can change your name again after ${left} more round${left === 1 ? '' : 's'} start, or on ${when}, whichever comes first.${back}`;
}

function taken(username: string): AppError {
  return AppError.conflict('USERNAME_TAKEN', `${username} is already working these streets. Pick another name.`, { username: 'That pimp name is taken.' });
}

export const UsernameChangeService = {
  /**
   * Refuses a name another account holds in any casing, or one recently given up by
   * someone else (or taken away by staff). `accountId` is who is asking; null for sign-up.
   */
  async assertAvailable(db: Reader, username: string, accountId: string | null, now = new Date()): Promise<void> {
    const usernameNormalized = normalizeUsername(username);
    const clash = await db.account.findFirst({
      where: { usernameNormalized, ...(accountId ? { id: { not: accountId } } : {}) },
      select: { id: true },
    });
    if (clash) throw taken(username);
    const hold = await holdOn(db, usernameNormalized, now);
    if (!hold || (hold.accountId === accountId && hold.source !== 'STAFF')) return;
    throw AppError.conflict(
      'USERNAME_HELD',
      hold.source === 'STAFF'
        ? `${username} was retired by staff and cannot be used until ${day(hold.until)}.`
        : `${username} was given up recently and is held for its previous owner until ${day(hold.until)}.`,
      { username: 'That pimp name is being held.' },
    );
  },

  /** True when nobody may sign up as this name right now. Used to pick automatic names. */
  async isHeld(db: Reader, username: string, now = new Date()): Promise<boolean> {
    return Boolean(await holdOn(db, normalizeUsername(username), now));
  },

  async status(prisma: PrismaClient, accountId: string, now = new Date()): Promise<UsernameChangeStatusDto> {
    const account = await prisma.account.findUniqueOrThrow({ where: { id: accountId }, select: { id: true, usernameNormalized: true, usernameChangedAt: true } });
    return statusFor(prisma, account, now);
  },

  /**
   * A player renames themselves. The name on every round they played follows, the same as
   * a staff rename, and the old name is kept in the account's name history (and held for
   * them for 30 days).
   */
  async change(prisma: PrismaClient, accountId: string, username: string, now = new Date()): Promise<{ account: Account; status: UsernameChangeStatusDto }> {
    try {
      return await prisma.$transaction(async (tx) => {
        await lockAccount(tx, accountId);
        const before = await tx.account.findUniqueOrThrow({ where: { id: accountId } });
        if (before.username === username) {
          throw AppError.badRequest('USERNAME_UNCHANGED', 'That is already your name.', { username: 'Pick a different name.' });
        }
        const usernameNormalized = normalizeUsername(username);
        const status = await statusFor(tx, before, now);
        // Taking back the name just given up is free and leaves the cooldown clock alone.
        const reverting = status.reclaim !== null && normalizeUsername(status.reclaim.username) === usernameNormalized;
        if (!status.canChange && !reverting) {
          throw new AppError(429, 'USERNAME_CHANGE_COOLDOWN', cooldownMessage(status), { username: 'Not yet.' });
        }
        await UsernameChangeService.assertAvailable(tx, username, before.id, now);

        const account = await tx.account.update({
          where: { id: before.id },
          data: { username, usernameNormalized, usernameChangedAt: reverting ? before.usernameChangedAt : now },
        });
        await tx.roundPlayer.updateMany({ where: { accountId: before.id }, data: { displayName: username } });
        await tx.accountUsernameChange.create({
          data: {
            accountId: before.id,
            fromUsername: before.username,
            fromUsernameNormalized: before.usernameNormalized,
            toUsername: username,
            source: reverting ? 'REVERT' : 'PLAYER',
            createdAt: now,
          },
        });
        return { account, status: await statusFor(tx, account, now) };
      });
    } catch (error) {
      // Two players racing for the same free name: the unique key decides, the loser hears why.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw taken(username);
      throw error;
    }
  },
};
