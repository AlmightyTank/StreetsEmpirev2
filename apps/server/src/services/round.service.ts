import type { PrismaClient, Round } from '@prisma/client';
import { AppError } from '../utils/errors.js';
import { lockRound, type Db } from '../utils/db.js';
import { PlayerStateService } from './player-state.service.js';

/**
 * A round is joinable while it is taking registrations or already running,
 * and only until its end date passes.
 */
export function isJoinable(round: Round, now = new Date()): boolean {
  if (round.status !== 'ACTIVE' && round.status !== 'REGISTRATION') return false;
  if (round.endsAt.getTime() <= now.getTime()) return false;
  if (round.registrationOpensAt && round.registrationOpensAt.getTime() > now.getTime()) {
    return false;
  }
  return true;
}

export function assertJoinable(round: Round, now = new Date()): void {
  if (round.status === 'ENDED' || round.status === 'ARCHIVED') {
    throw AppError.conflict('ROUND_ENDED', `${round.name} has ended.`);
  }
  if (round.endsAt.getTime() <= now.getTime()) {
    throw AppError.conflict('ROUND_ENDED', `${round.name} has ended.`);
  }
  if (round.status === 'SCHEDULED') {
    throw AppError.conflict(
      'ROUND_NOT_OPEN',
      `${round.name} has not opened for registration yet.`,
    );
  }
  if (round.registrationOpensAt && round.registrationOpensAt.getTime() > now.getTime()) {
    throw AppError.conflict(
      'ROUND_NOT_OPEN',
      `${round.name} has not opened for registration yet.`,
    );
  }
}

type FinalRankPlayer = {
  id: string;
  cityId: string;
  netWorthCents: bigint;
  localRank: number | null;
  nationalRank: number | null;
  account: { isActive: boolean };
};

function finalRanks(sortedDesc: Array<{ id: string; netWorthCents: bigint }>): Map<string, number> {
  const ranks = new Map<string, number>();
  let previous: bigint | null = null;
  let previousRank = 0;
  sortedDesc.forEach((player, index) => {
    const rank = previous !== null && player.netWorthCents === previous ? previousRank : index + 1;
    ranks.set(player.id, rank);
    previous = player.netWorthCents;
    previousRank = rank;
  });
  return ranks;
}

export function finalStandingRanks(players: FinalRankPlayer[]): Map<string, { localRank: number | null; nationalRank: number | null }> {
  const active = players.filter((player) => player.account.isActive);
  const national = finalRanks(active);
  const byCity = new Map<string, FinalRankPlayer[]>();
  for (const player of active) {
    byCity.set(player.cityId, [...(byCity.get(player.cityId) ?? []), player]);
  }

  const local = new Map<string, number>();
  for (const cityPlayers of byCity.values()) {
    for (const [id, rank] of finalRanks(cityPlayers)) local.set(id, rank);
  }

  return new Map(players.map((player) => [
    player.id,
    player.account.isActive
      ? { localRank: local.get(player.id) ?? null, nationalRank: national.get(player.id) ?? null }
      : { localRank: null, nationalRank: null },
  ]));
}

async function freezeFinalStandings(tx: Db, roundId: string, now: Date): Promise<void> {
  const players = await tx.roundPlayer.findMany({
    where: { roundId },
    orderBy: [{ netWorthCents: 'desc' }, { publicPimpId: 'asc' }],
    select: {
      id: true,
      cityId: true,
      netWorthCents: true,
      localRank: true,
      nationalRank: true,
      account: { select: { isActive: true } },
    },
  });
  const ranks = finalStandingRanks(players);

  for (const player of players) {
    const rank = ranks.get(player.id)!;
    await tx.roundPlayer.update({
      where: { id: player.id },
      data: {
        localRank: rank.localRank,
        nationalRank: rank.nationalRank,
        ...(rank.localRank !== player.localRank ? { localRankSinceAt: now } : {}),
        ...(rank.nationalRank !== player.nationalRank ? { nationalRankSinceAt: now } : {}),
        dailyStartingLocalRank: rank.localRank,
        dailyStartingNationalRank: rank.nationalRank,
        dailyRankSnapshotAt: now,
      },
    });
  }
}

export const RoundService = {
  async closeExpired(prisma: PrismaClient, now = new Date()): Promise<Round[]> {
    const expired = await prisma.round.findMany({
      where: { status: { in: ['REGISTRATION', 'ACTIVE'] }, endsAt: { lte: now } },
      select: { id: true },
      orderBy: { endsAt: 'asc' },
    });
    const closed: Round[] = [];
    for (const round of expired) {
      try {
        const result = await RoundService.closeIfExpired(prisma, round.id, now);
        if (result.closed) closed.push(result.round);
      } catch (error) {
        // Deleted between the listing and the close: nothing left to close.
        if (error instanceof AppError && error.code === 'ROUND_NOT_FOUND') continue;
        throw error;
      }
    }
    return closed;
  },

  /**
   * Settle, freeze and end one round inside the caller's transaction, so an
   * admin close and its audit record commit together. The end date becomes the
   * moment standings froze, so a round closed early - by an admin or by a newer
   * season superseding it - does not keep advertising its original end.
   * `endsAt` can pull it earlier still; nothing ever pushes one back.
   */
  async closeRoundInTransaction(
    tx: Db,
    roundId: string,
    finalAt: Date,
    options: { endsAt?: Date } = {},
  ): Promise<{ closed: boolean; round: Round; previous: Round }> {
    await lockRound(tx, roundId);
    const round = await tx.round.findUnique({ where: { id: roundId } });
    if (!round) throw AppError.notFound('ROUND_NOT_FOUND', 'That round does not exist.');
    if (round.status !== 'ACTIVE' && round.status !== 'REGISTRATION') return { closed: false, round, previous: round };

    const freezeAt = new Date(Math.min(round.endsAt.getTime(), finalAt.getTime()));
    const players = await tx.roundPlayer.findMany({
      where: { roundId: round.id },
      orderBy: { publicPimpId: 'asc' },
      select: { id: true },
    });
    for (const player of players) {
      await PlayerStateService.settleInTransaction(tx, player.id, { now: freezeAt, markActive: false });
    }
    await freezeFinalStandings(tx, round.id, freezeAt);

    const closedAt = options.endsAt && options.endsAt.getTime() < freezeAt.getTime() ? options.endsAt : freezeAt;
    const endsAt = closedAt.getTime() < round.endsAt.getTime() ? closedAt : null;
    const ended = await tx.round.update({
      where: { id: round.id },
      data: {
        status: 'ENDED',
        ...(endsAt ? { endsAt, ...(endsAt.getTime() < round.startsAt.getTime() ? { startsAt: endsAt } : {}) } : {}),
      },
    });
    return { closed: true, round: ended, previous: round };
  },

  async closeRoundAt(prisma: PrismaClient, roundId: string, finalAt: Date): Promise<{ closed: boolean; round: Round }> {
    const { closed, round } = await prisma.$transaction(
      (tx) => RoundService.closeRoundInTransaction(tx, roundId, finalAt),
      { maxWait: 10_000, timeout: 30_000 },
    );
    return { closed, round };
  },

  async closeIfExpired(prisma: PrismaClient, roundId: string, now = new Date()): Promise<{ closed: boolean; round: Round }> {
    const round = await prisma.round.findUnique({ where: { id: roundId } });
    if (!round) throw AppError.notFound('ROUND_NOT_FOUND', 'That round does not exist.');
    if (round.endsAt.getTime() > now.getTime()) return { closed: false, round };
    return RoundService.closeRoundAt(prisma, roundId, round.endsAt);
  },

  async closeSupersededActive(prisma: PrismaClient, current: Round): Promise<Round[]> {
    const superseded = await prisma.round.findMany({
      where: { status: 'ACTIVE', id: { not: current.id }, startsAt: { lt: current.startsAt } },
      select: { id: true },
      orderBy: { startsAt: 'asc' },
    });
    const closed: Round[] = [];
    for (const round of superseded) {
      const result = await RoundService.closeRoundAt(prisma, round.id, current.startsAt);
      if (result.closed) closed.push(result.round);
    }
    return closed;
  },

  /** The round players are sent to. Running rounds win over upcoming ones. */
  async getCurrent(prisma: PrismaClient, now = new Date()): Promise<Round | null> {
    await RoundService.closeExpired(prisma, now);

    const active = await prisma.round.findFirst({
      where: { status: 'ACTIVE', endsAt: { gt: now } },
      orderBy: { startsAt: 'desc' },
    });
    if (active) {
      await RoundService.closeSupersededActive(prisma, active);
      return active;
    }

    return prisma.round.findFirst({
      where: { status: 'REGISTRATION', endsAt: { gt: now } },
      orderBy: { startsAt: 'asc' },
    });
  },

  async requireCurrent(prisma: PrismaClient, now = new Date()): Promise<Round> {
    const round = await RoundService.getCurrent(prisma, now);
    if (!round) {
      throw AppError.notFound(
        'NO_ACTIVE_ROUND',
        'There is no game running right now. Check back soon.',
      );
    }
    return round;
  },

  playerCount(prisma: PrismaClient, roundId: string): Promise<number> {
    return prisma.roundPlayer.count({ where: { roundId, account: { isActive: true } } });
  },
};
