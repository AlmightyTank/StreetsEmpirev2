import type { PrismaClient } from '@prisma/client';

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
