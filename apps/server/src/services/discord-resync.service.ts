import type { PrismaClient } from '@prisma/client';
import { env } from '../config/env.js';
import type { Db } from '../utils/db.js';

export interface DiscordResyncClaimDto {
  /** Re-sync every member; discordIds is empty when this is true. */
  all: boolean;
  discordIds: string[];
}

/**
 * Pending admin resync requests, marked claimed before the bot acts on them so
 * a crash or restart never repeats one. Only one bot process should call this.
 */
export async function claimResyncRequests(prisma: PrismaClient, now = new Date()): Promise<DiscordResyncClaimDto> {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.discordResyncRequest.findMany({
      where: { claimedAt: null },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
    if (!rows.length) return { all: false, discordIds: [] };
    await tx.discordResyncRequest.updateMany({
      where: { id: { in: rows.map((row) => row.id) }, claimedAt: null },
      data: { claimedAt: now },
    });
    const all = rows.some((row) => row.discordId === null);
    return {
      all,
      discordIds: all ? [] : [...new Set(rows.map((row) => row.discordId).filter((id): id is string => Boolean(id)))],
    };
  });
}

/**
 * 0.3.0-C. Ask the bot to refresh alliance roles now instead of on its next pass.
 * 'all' also retires roles for alliances that disbanded or were renamed. Accounts
 * without Discord linked are skipped, and nothing is queued while the bot is off.
 */
export async function queueAllianceRoleResync(db: Db, target: { accountIds: string[] } | 'all', requestedBy = 'Alliance change'): Promise<void> {
  if (!env.discordBot.enabled) return;
  if (target === 'all') {
    await db.discordResyncRequest.create({ data: { discordId: null, requestedByUsername: requestedBy } });
    return;
  }
  if (!target.accountIds.length) return;
  const accounts = await db.account.findMany({ where: { id: { in: target.accountIds }, discordId: { not: null } }, select: { discordId: true } });
  if (accounts.length) {
    await db.discordResyncRequest.createMany({ data: accounts.map((account) => ({ discordId: account.discordId, requestedByUsername: requestedBy })) });
  }
}
