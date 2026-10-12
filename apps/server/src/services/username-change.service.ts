import { Prisma, type Account, type PrismaClient } from '@prisma/client';
import { normalizeUsername, usernameChangeStatus, type UsernameChangeStatusDto } from '@streets/shared';
import { lockAccount, type Db } from '../utils/db.js';
import { AppError } from '../utils/errors.js';

/** Rounds that have actually started since the player's last name change. */
async function roundsStartedSince(db: Db | PrismaClient, since: Date | null, now: Date): Promise<number> {
  if (!since) return 0;
  return db.round.count({
    where: { startsAt: { gt: since, lte: now }, status: { in: ['ACTIVE', 'ENDED', 'ARCHIVED'] } },
  });
}

async function statusFor(db: Db | PrismaClient, account: Pick<Account, 'usernameChangedAt'>, now: Date): Promise<UsernameChangeStatusDto> {
  return usernameChangeStatus({
    lastChangedAt: account.usernameChangedAt,
    roundsStartedSince: await roundsStartedSince(db, account.usernameChangedAt, now),
    now,
  });
}

function cooldownMessage(status: UsernameChangeStatusDto): string {
  const left = status.cooldownRounds - status.roundsSinceChange;
  const when = status.availableAt ? new Date(status.availableAt).toUTCString().slice(5, 16) : 'soon';
  return `You can change your name again after ${left} more round${left === 1 ? '' : 's'} start, or on ${when}, whichever comes first.`;
}

export const UsernameChangeService = {
  async status(prisma: PrismaClient, accountId: string, now = new Date()): Promise<UsernameChangeStatusDto> {
    const account = await prisma.account.findUniqueOrThrow({ where: { id: accountId }, select: { usernameChangedAt: true } });
    return statusFor(prisma, account, now);
  },

  /**
   * A player renames themselves. The name on every round they played follows, the same as
   * a staff rename, and the old name is kept in the account's name history.
   */
  async change(prisma: PrismaClient, accountId: string, username: string, now = new Date()): Promise<{ account: Account; status: UsernameChangeStatusDto }> {
    try {
      return await prisma.$transaction(async (tx) => {
        await lockAccount(tx, accountId);
        const before = await tx.account.findUniqueOrThrow({ where: { id: accountId } });
        if (before.username === username) {
          throw AppError.badRequest('USERNAME_UNCHANGED', 'That is already your name.', { username: 'Pick a different name.' });
        }
        const status = await statusFor(tx, before, now);
        if (!status.canChange) {
          throw new AppError(429, 'USERNAME_CHANGE_COOLDOWN', cooldownMessage(status), { username: 'Not yet.' });
        }
        const usernameNormalized = normalizeUsername(username);
        const clash = await tx.account.findFirst({ where: { usernameNormalized, id: { not: before.id } }, select: { id: true } });
        if (clash) throw AppError.conflict('USERNAME_TAKEN', `${username} is already working these streets. Pick another name.`, { username: 'That pimp name is taken.' });

        const account = await tx.account.update({
          where: { id: before.id },
          data: { username, usernameNormalized, usernameChangedAt: now },
        });
        await tx.roundPlayer.updateMany({ where: { accountId: before.id }, data: { displayName: username } });
        await tx.accountUsernameChange.create({
          data: { accountId: before.id, fromUsername: before.username, toUsername: username, source: 'PLAYER', createdAt: now },
        });
        return { account, status: await statusFor(tx, account, now) };
      });
    } catch (error) {
      // Two players racing for the same free name: the unique key decides, the loser hears why.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw AppError.conflict('USERNAME_TAKEN', `${username} is already working these streets. Pick another name.`, { username: 'That pimp name is taken.' });
      }
      throw error;
    }
  },
};
