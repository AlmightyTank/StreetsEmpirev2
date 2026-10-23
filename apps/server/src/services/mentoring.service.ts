import type { PrismaClient } from '@prisma/client';
import { MENTORING, experienceLevelFor, type MentoringDto, type MentoringPersonDto } from '@streets/shared';
import type { Db } from '../utils/db.js';
import { AppError } from '../utils/errors.js';
import { RoundService } from './round.service.js';

/**
 * Mentoring: a new player names one seasoned mentor for good. The mentor earns
 * account XP as the mentee reaches MENTORING.milestones. Gameplay is untouched.
 */

async function finishedASeason(db: Db | PrismaClient, accountId: string): Promise<boolean> {
  return Boolean(await db.roundPlayer.findFirst({
    where: { accountId, round: { status: { in: ['ENDED', 'ARCHIVED'] } } },
    select: { id: true },
  }));
}

async function people(prisma: PrismaClient, accounts: { id: string; experiencePoints: number; username: string }[]): Promise<Map<string, MentoringPersonDto>> {
  const round = await RoundService.getCurrent(prisma);
  const players = round && accounts.length
    ? await prisma.roundPlayer.findMany({
        where: { roundId: round.id, accountId: { in: accounts.map((account) => account.id) } },
        select: { accountId: true, displayName: true, publicPimpId: true },
      })
    : [];
  const byAccount = new Map(players.map((row) => [row.accountId, row]));
  return new Map(accounts.map((account) => {
    const player = byAccount.get(account.id);
    return [account.id, {
      displayName: player?.displayName ?? account.username,
      publicPimpId: player?.publicPimpId ?? null,
      level: experienceLevelFor(account.experiencePoints),
    }];
  }));
}

const accountSelect = { id: true, experiencePoints: true, username: true } as const;

export const MentoringService = {
  async view(prisma: PrismaClient, accountId: string): Promise<MentoringDto> {
    const [me, link, mentees, veteran] = await Promise.all([
      prisma.account.findUniqueOrThrow({ where: { id: accountId }, select: accountSelect }),
      prisma.mentorship.findUnique({ where: { menteeAccountId: accountId }, select: { mentor: { select: accountSelect } } }),
      prisma.mentorship.findMany({ where: { mentorAccountId: accountId }, orderBy: { createdAt: 'asc' }, select: { mentee: { select: accountSelect } } }),
      finishedASeason(prisma, accountId),
    ]);
    const level = experienceLevelFor(me.experiencePoints);
    const names = await people(prisma, [...(link ? [link.mentor] : []), ...mentees.map((row) => row.mentee)]);
    return {
      mentor: link ? names.get(link.mentor.id)! : null,
      mentees: mentees.map(({ mentee }) => {
        const person = names.get(mentee.id)!;
        return { ...person, milestonesReached: MENTORING.milestones.filter((milestone) => person.level >= milestone).length };
      }),
      canChooseMentor: !link && !veteran && level < MENTORING.menteeBelowLevel,
      canMentor: level >= MENTORING.mentorMinLevel && mentees.length < MENTORING.maxMentees,
    };
  },

  /** The mentee names their mentor by player number in the current round. Once, for good. */
  async choose(prisma: PrismaClient, accountId: string, mentorPublicPimpId: number): Promise<MentoringDto> {
    const round = await RoundService.requireCurrent(prisma);
    await prisma.$transaction(async (tx) => {
      const mentor = await tx.roundPlayer.findFirst({
        where: { roundId: round.id, publicPimpId: mentorPublicPimpId, account: { isActive: true } },
        select: { accountId: true, displayName: true, account: { select: { experiencePoints: true } } },
      });
      if (!mentor) throw AppError.notFound('PLAYER_NOT_FOUND', 'No player with that number is in this round.');
      if (mentor.accountId === accountId) throw AppError.badRequest('MENTOR_SELF', 'You cannot mentor yourself.');
      const me = await tx.account.findUniqueOrThrow({ where: { id: accountId }, select: { experiencePoints: true } });
      if (experienceLevelFor(me.experiencePoints) >= MENTORING.menteeBelowLevel || await finishedASeason(tx, accountId)) {
        throw AppError.conflict('MENTEE_TOO_SENIOR', `Mentors are for new players below level ${MENTORING.menteeBelowLevel}.`);
      }
      if (experienceLevelFor(mentor.account.experiencePoints) < MENTORING.mentorMinLevel) {
        throw AppError.conflict('MENTOR_TOO_JUNIOR', `${mentor.displayName} needs account level ${MENTORING.mentorMinLevel} to mentor.`);
      }
      if (await tx.mentorship.count({ where: { mentorAccountId: mentor.accountId } }) >= MENTORING.maxMentees) {
        throw AppError.conflict('MENTOR_FULL', `${mentor.displayName} already mentors ${MENTORING.maxMentees} players.`);
      }
      if (await tx.mentorship.findUnique({ where: { menteeAccountId: accountId }, select: { id: true } })) {
        throw AppError.conflict('MENTOR_ALREADY_CHOSEN', 'You already have a mentor.');
      }
      await tx.mentorship.create({ data: { mentorAccountId: mentor.accountId, menteeAccountId: accountId } });
    });
    return MentoringService.view(prisma, accountId);
  },

  /** Milestone levels the mentee crossed in (fromLevel, toLevel], with the mentor to pay. Called from the XP award. */
  async milestonesFor(tx: Db, menteeAccountId: string, fromLevel: number, toLevel: number): Promise<{ mentorAccountId: string; milestones: number[] } | null> {
    const milestones = MENTORING.milestones.filter((milestone) => milestone > fromLevel && milestone <= toLevel);
    if (!milestones.length) return null;
    const link = await tx.mentorship.findUnique({ where: { menteeAccountId }, select: { mentorAccountId: true } });
    return link ? { mentorAccountId: link.mentorAccountId, milestones } : null;
  },
};
