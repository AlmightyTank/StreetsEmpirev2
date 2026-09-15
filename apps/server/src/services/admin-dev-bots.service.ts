import type { PrismaClient } from '@prisma/client';
import { loadRulesetForRound } from '@streets/rules-engine';
import type { AdminDevBotsDto } from '@streets/shared';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';
import { AdminAuditService, type AuditActor } from './admin-audit.service.js';
import { devBotAccountWhere, devBotsBlockedReason, removeDevBots, seedDevBots } from './dev-bots.service.js';
import { RoundService } from './round.service.js';

const blockedReason = () => devBotsBlockedReason({ isProduction: env.isProduction, databaseUrl: env.DATABASE_URL });

function refuseIfBlocked(): void {
  const reason = blockedReason();
  if (reason) throw AppError.forbidden(reason);
}

async function record(prisma: PrismaClient, actor: AuditActor, action: string, after: Record<string, unknown>, reason?: string) {
  await prisma.$transaction((tx) => AdminAuditService.record(tx, actor, { action, targetType: 'dev-bots', targetId: null, reason: reason ?? null, after }));
}

/** Local test targets from the panel instead of the CLI. Refused in production and against a non-local database. */
export const AdminDevBotsService = {
  async status(prisma: PrismaClient): Promise<AdminDevBotsDto> {
    const round = await RoundService.getCurrent(prisma);
    const accounts = await prisma.account.findMany({
      where: devBotAccountWhere,
      orderBy: { username: 'asc' },
      select: {
        id: true,
        username: true,
        isActive: true,
        _count: { select: { roundPlayers: true } },
        roundPlayers: round
          ? { where: { roundId: round.id }, select: { id: true, displayName: true, publicPimpId: true, netWorthCents: true } }
          : { where: { id: '' }, select: { id: true, displayName: true, publicPimpId: true, netWorthCents: true } },
      },
    });
    return {
      blockedReason: blockedReason(),
      currentRound: round ? { id: round.id, name: round.name, rulesetVersion: round.rulesetVersion } : null,
      bots: accounts.map((account) => {
        const player = account.roundPlayers[0];
        return {
          accountId: account.id,
          username: account.username,
          isActive: account.isActive,
          roundsPlayed: account._count.roundPlayers,
          inCurrentRound: player
            ? { roundPlayerId: player.id, displayName: player.displayName, publicPimpId: player.publicPimpId, netWorthCents: Number(player.netWorthCents) }
            : null,
        };
      }),
    };
  },

  /** Adds the bots to the current round, or resets them there with fresh starting resources. */
  async seed(prisma: PrismaClient, actor: AuditActor, now = new Date()): Promise<AdminDevBotsDto> {
    refuseIfBlocked();
    const round = await RoundService.getCurrent(prisma, now);
    if (!round) throw AppError.conflict('NO_ACTIVE_ROUND', 'There is no current round to add dev bots to.');
    let seeded: number;
    try {
      seeded = await seedDevBots(prisma, round, loadRulesetForRound(round), now);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Starting city')) throw AppError.conflict('STARTING_CITY_DISABLED', error.message);
      throw error;
    }
    await record(prisma, actor, 'dev-bots.seed', { roundId: round.id, roundName: round.name, seeded });
    return AdminDevBotsService.status(prisma);
  },

  async remove(prisma: PrismaClient, actor: AuditActor, reason: string): Promise<AdminDevBotsDto> {
    refuseIfBlocked();
    const removed = await removeDevBots(prisma);
    await record(prisma, actor, 'dev-bots.remove', { removed }, reason);
    return AdminDevBotsService.status(prisma);
  },
};
