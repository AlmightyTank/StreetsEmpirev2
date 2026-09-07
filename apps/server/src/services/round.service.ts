import type { PrismaClient, Round } from '@prisma/client';
import { AppError } from '../utils/errors.js';

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

export const RoundService = {
  /** The round players are sent to. Running rounds win over upcoming ones. */
  async getCurrent(prisma: PrismaClient): Promise<Round | null> {
    const active = await prisma.round.findFirst({
      where: { status: 'ACTIVE' },
      orderBy: { startsAt: 'desc' },
    });
    if (active) return active;

    return prisma.round.findFirst({
      where: { status: 'REGISTRATION' },
      orderBy: { startsAt: 'asc' },
    });
  },

  async requireCurrent(prisma: PrismaClient): Promise<Round> {
    const round = await RoundService.getCurrent(prisma);
    if (!round) {
      throw AppError.notFound(
        'NO_ACTIVE_ROUND',
        'There is no game running right now. Check back soon.',
      );
    }
    return round;
  },

  playerCount(prisma: PrismaClient, roundId: string): Promise<number> {
    return prisma.roundPlayer.count({ where: { roundId } });
  },
};
