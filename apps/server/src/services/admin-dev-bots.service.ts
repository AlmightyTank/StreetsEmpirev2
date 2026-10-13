import type { PrismaClient } from '@prisma/client';
import { loadRulesetForRound } from '@streets/rules-engine';
import type { AdminDevBotsDto } from '@streets/shared';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';
import { AdminAuditService, type AuditActor } from './admin-audit.service.js';
import { DEV_BOT_USERNAME_PREFIX, DEV_TEST_RIVALS, devBotAccountWhere, devBotsBlockedReason, removeDevBots, seedDevBots } from './dev-bots.service.js';
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
    const now = new Date();
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
          ? {
              where: { roundId: round.id },
              select: {
                id: true,
                displayName: true,
                publicPimpId: true,
                netWorthCents: true,
              },
            }
          : {
              where: { id: '' },
              select: {
                id: true,
                displayName: true,
                publicPimpId: true,
                netWorthCents: true,
              },
            },
      },
    });

    let encounterGangSummary: AdminDevBotsDto['encounterGangSummary'] = {
      generatedAt: now.toISOString(),
      active: 0,
      dormant: 0,
      heldBlocks: 0,
      openGrudges: 0,
      cities: [],
    };
    if (round) {
      const [active, dormant, heldBlocks, openGrudges, gangs, turfs] = await Promise.all([
        prisma.encounterGang.count({ where: { roundId: round.id, status: 'ACTIVE' } }),
        prisma.encounterGang.count({ where: { roundId: round.id, status: 'DORMANT' } }),
        prisma.encounterGangTurf.count({ where: { roundId: round.id, status: 'HELD' } }),
        prisma.encounterGangGrudge.count({
          where: { gang: { roundId: round.id }, settledAt: null, expiresAt: { gt: now } },
        }),
        prisma.encounterGang.findMany({
          where: { roundId: round.id },
          select: { cityId: true, status: true, city: { select: { name: true } } },
        }),
        prisma.encounterGangTurf.findMany({
          where: { roundId: round.id, status: 'HELD' },
          select: { cityId: true },
        }),
      ]);
      const cityRows = new Map<string, { city: string; activeGangs: number; dormant: number; heldBlocks: number }>();
      for (const gang of gangs) {
        const row = cityRows.get(gang.cityId) ?? { city: gang.city.name, activeGangs: 0, dormant: 0, heldBlocks: 0 };
        if (gang.status === 'ACTIVE') row.activeGangs += 1;
        if (gang.status === 'DORMANT') row.dormant += 1;
        cityRows.set(gang.cityId, row);
      }
      for (const turf of turfs) {
        const row = cityRows.get(turf.cityId);
        if (row) row.heldBlocks += 1;
      }
      encounterGangSummary = {
        generatedAt: now.toISOString(),
        active,
        dormant,
        heldBlocks,
        openGrudges,
        cities: Array.from(cityRows.values()).sort((left, right) => left.city.localeCompare(right.city)),
      };
    }

    return {
      blockedReason: blockedReason(),
      currentRound: round ? { id: round.id, name: round.name, rulesetVersion: round.rulesetVersion } : null,
      controls: {
        rivals: DEV_TEST_RIVALS.map((rival) => ({
          slug: rival.slug,
          displayName: rival.displayName,
          personality: rival.slug,
          inRound: accounts.some((account) => account.username === `${DEV_BOT_USERNAME_PREFIX}${rival.slug}` && account.roundPlayers.length > 0),
        })),
      },
      encounterGangSummary,
      bots: accounts.map((account) => {
        const player = account.roundPlayers[0];
        return {
          accountId: account.id,
          kind: 'DEV' as const,
          username: account.username,
          isActive: account.isActive,
          roundsPlayed: account._count.roundPlayers,
          inCurrentRound: player
            ? {
                roundPlayerId: player.id,
                displayName: player.displayName,
                publicPimpId: player.publicPimpId,
                netWorthCents: Number(player.netWorthCents),
              }
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

  /** Phase O. Add or reset one dev crew in the current round. */
  async seedOne(prisma: PrismaClient, actor: AuditActor, slug: string, now = new Date()): Promise<AdminDevBotsDto> {
    refuseIfBlocked();
    const rival = DEV_TEST_RIVALS.find((row) => row.slug === slug);
    if (!rival) throw AppError.notFound('DEV_BOT_NOT_FOUND', 'There is no dev crew with that name.');
    const round = await RoundService.getCurrent(prisma, now);
    if (!round) throw AppError.conflict('NO_ACTIVE_ROUND', 'There is no current round to add a dev crew to.');
    await seedDevBots(prisma, round, loadRulesetForRound(round), now, [rival]);
    await record(prisma, actor, 'dev-bots.seed-one', { roundId: round.id, slug });
    return AdminDevBotsService.status(prisma);
  },

  /** Phase O. Delete one dev bot account, and its players in every round. */
  async removeOne(prisma: PrismaClient, actor: AuditActor, accountId: string, reason: string): Promise<AdminDevBotsDto> {
    refuseIfBlocked();
    const account = await prisma.account.findFirst({ where: { id: accountId, ...devBotAccountWhere }, select: { id: true, username: true } });
    if (!account) throw AppError.notFound('DEV_BOT_NOT_FOUND', 'That account is not a dev bot.');
    await prisma.account.delete({ where: { id: account.id } });
    await record(prisma, actor, 'dev-bots.remove-one', { accountId: account.id, username: account.username }, reason);
    return AdminDevBotsService.status(prisma);
  },

  async remove(prisma: PrismaClient, actor: AuditActor, reason: string): Promise<AdminDevBotsDto> {
    refuseIfBlocked();
    const removed = await removeDevBots(prisma);
    await record(prisma, actor, 'dev-bots.remove', { removed }, reason);
    return AdminDevBotsService.status(prisma);
  },
};
