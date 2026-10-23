import type { Prisma, PrismaClient } from '@prisma/client';
import type { Ruleset } from '@streets/rules-engine';
import type { CrewMentorBondDto } from '@streets/shared';
import { lockRoundPlayer, type Db } from '../utils/db.js';
import { AppError } from '../utils/errors.js';
import { crewLoyaltyEnabled } from './crew-loyalty.service.js';
import { crewMemberName } from './crew-profile.js';

export const CREW_BOND_MAX_APPRENTICES = 2;
export const CREW_BOND_MAX_MEMORIES = 5;
export const CREW_BOND_MENTOR_XP = 100;
export const CREW_BOND_MENTOR_LOYALTY = 25;
export const CREW_BOND_APPRENTICE_LOYALTY_CAP = 25;

type BondMember = {
  id: string; role: 'THUG' | 'WORKER'; serial: number; status: string;
  experiencePoints: number; loyaltyPoints: number;
};

/** No rewards, stat adjustments, daily chores or pay-to-advance paths. */
export function assertMentorPair(mentor: BondMember, apprentice: BondMember): void {
  if (mentor.id === apprentice.id || mentor.role !== apprentice.role) {
    throw AppError.badRequest('CREW_MENTOR_PAIR', 'Choose two different crew members with the same role.');
  }
  if (mentor.status === 'RELEASED' || apprentice.status === 'RELEASED') {
    throw AppError.conflict('CREW_MENTOR_RELEASED', 'Released crew members cannot begin a mentorship.');
  }
  if (mentor.experiencePoints < CREW_BOND_MENTOR_XP && mentor.loyaltyPoints < CREW_BOND_MENTOR_LOYALTY) {
    throw AppError.conflict('CREW_MENTOR_INEXPERIENCED', 'A mentor needs 100 earned XP or 25 loyalty.');
  }
  if (apprentice.loyaltyPoints >= CREW_BOND_APPRENTICE_LOYALTY_CAP || apprentice.experiencePoints >= mentor.experiencePoints) {
    throw AppError.conflict('CREW_MENTOR_APPRENTICE', 'Choose a newer member with less experience and under 25 loyalty.');
  }
}

export function crewBondMilestone(memories: number): string {
  if (memories >= 5) return 'Trusted Partners';
  if (memories >= 3) return 'Finding Their Rhythm';
  if (memories >= 1) return 'First Lesson';
  return 'New Connection';
}

const bondSelect = {
  id: true, mentorId: true, apprenticeId: true, lessons: true, startedAt: true, endedAt: true,
  mentor: { select: { role: true, serial: true } },
  apprentice: { select: { role: true, serial: true } },
  memories: { orderBy: [{ at: 'desc' as const }, { id: 'desc' as const }], take: 3,
    select: { source: true, summary: true, at: true } },
} satisfies Prisma.CrewMentorBondSelect;

export const CrewBondService = {
  async link(prisma: PrismaClient, roundPlayerId: string, ruleset: Ruleset, input: {
    mentorId: string; apprenticeId: string;
  }, at = new Date()): Promise<CrewMentorBondDto> {
    if (!crewLoyaltyEnabled(ruleset)) throw AppError.conflict('CREW_BONDS_DISABLED', 'Crew bonds need a loyalty-enabled round.');
    return prisma.$transaction(async (tx) => {
      await lockRoundPlayer(tx, roundPlayerId);
      const members = await tx.crewMember.findMany({
        where: { roundPlayerId, id: { in: [input.mentorId, input.apprenticeId] } },
        select: { id: true, role: true, serial: true, status: true, experiencePoints: true, loyaltyPoints: true },
      });
      const mentor = members.find((member) => member.id === input.mentorId);
      const apprentice = members.find((member) => member.id === input.apprenticeId);
      if (!mentor || !apprentice) throw AppError.notFound('CREW_MEMBER_NOT_FOUND', 'Choose crew members who belong to your round.');
      assertMentorPair(mentor, apprentice);
      const existing = await tx.crewMentorBond.findFirst({
        where: { roundPlayerId, OR: [
          { apprenticeId: apprentice.id },
          { mentorId: apprentice.id, endedAt: null },
          { apprenticeId: mentor.id, endedAt: null },
        ] },
        select: { id: true },
      });
      if (existing) throw AppError.conflict('CREW_BOND_EXISTS', 'That crew member has an existing bond or has already had a mentor this round.');
      const count = await tx.crewMentorBond.count({ where: { roundPlayerId, mentorId: mentor.id, endedAt: null } });
      if (count >= CREW_BOND_MAX_APPRENTICES) throw AppError.conflict('CREW_MENTOR_CAP', 'A veteran can mentor up to two crew members at a time.');
      const created = await tx.crewMentorBond.create({
        data: { roundPlayerId, mentorId: mentor.id, apprenticeId: apprentice.id, startedAt: at },
        select: bondSelect,
      });
      return CrewBondService.dto(created);
    });
  },

  async end(prisma: PrismaClient, roundPlayerId: string, bondId: string, ruleset: Ruleset, at = new Date()): Promise<void> {
    if (!crewLoyaltyEnabled(ruleset)) throw AppError.conflict('CREW_BONDS_DISABLED', 'Crew bonds are not available in this round.');
    await prisma.$transaction(async (tx) => {
      await lockRoundPlayer(tx, roundPlayerId);
      const ended = await tx.crewMentorBond.updateMany({
        where: { id: bondId, roundPlayerId, endedAt: null },
        data: { endedAt: at },
      });
      if (!ended.count) throw AppError.notFound('CREW_BOND_NOT_FOUND', 'That active crew bond is not on your roster.');
    });
  },

  /** The second positive receipt for a *shared, server-verified operation* creates
   * one immutable memory. Handles either member settling first; never uses paid
   * TRAINED events, reassignments, or retrospective operations before the link.
   */
  async afterLoyaltyReceipt(tx: Db, input: {
    roundPlayerId: string; memberId: string; sourceKey: string; source: string; at: Date;
  }): Promise<void> {
    const bonds = await tx.crewMentorBond.findMany({
      where: { roundPlayerId: input.roundPlayerId, endedAt: null, OR: [
        { mentorId: input.memberId }, { apprenticeId: input.memberId },
      ] },
      select: { id: true, mentorId: true, apprenticeId: true, startedAt: true },
    });
    for (const bond of bonds) {
      if (input.at < bond.startedAt) continue;
      // Serialize simultaneous settlements of either partner before checking
      // caps and the unique source receipt.
      const [locked] = await tx.$queryRaw<Array<{ id: string; lessons: number; endedAt: Date | null }>>`
        SELECT "id", "lessons", "endedAt" FROM "CrewMentorBond" WHERE "id" = ${bond.id} FOR UPDATE
      `;
      if (!locked || locked.endedAt || locked.lessons >= CREW_BOND_MAX_MEMORIES) continue;
      const otherId = bond.mentorId === input.memberId ? bond.apprenticeId : bond.mentorId;
      const partner = await tx.crewMember.findFirst({
        where: { id: otherId, roundPlayerId: input.roundPlayerId, status: { not: 'RELEASED' } }, select: { id: true },
      });
      if (!partner) continue;
      const matching = await tx.crewLoyaltyEntry.findUnique({
        where: { memberId_sourceKey: { memberId: otherId, sourceKey: input.sourceKey } },
        select: { points: true, at: true, source: true },
      });
      if (!matching || matching.points <= 0 || matching.source !== input.source || matching.at < bond.startedAt) continue;
      const prior = await tx.crewBondMemory.findUnique({
        where: { bondId_sourceKey: { bondId: bond.id, sourceKey: input.sourceKey } }, select: { id: true },
      });
      if (prior) continue;
      const dayStart = new Date(Date.UTC(input.at.getUTCFullYear(), input.at.getUTCMonth(), input.at.getUTCDate()));
      const dayEnd = new Date(dayStart.getTime() + 86_400_000);
      const today = await tx.crewBondMemory.count({
        where: { bondId: bond.id, at: { gte: dayStart, lt: dayEnd } },
      });
      if (today > 0) continue;
      await tx.crewBondMemory.create({
        data: { roundPlayerId: input.roundPlayerId, bondId: bond.id,
          sourceKey: input.sourceKey, source: input.source,
          summary: 'Shared a verified crew operation · training memory recorded.',
          at: input.at,
        },
      });
      await tx.crewMentorBond.update({ where: { id: bond.id }, data: { lessons: { increment: 1 } } });
    }
  },

  dto(row: {
    id: string; mentorId: string; apprenticeId: string; lessons: number;
    startedAt: Date; endedAt: Date | null;
    mentor: { role: 'THUG' | 'WORKER'; serial: number };
    apprentice: { role: 'THUG' | 'WORKER'; serial: number };
    memories: readonly { source: string; summary: string; at: Date }[];
  }): CrewMentorBondDto {
    return {
      id: row.id, mentorId: row.mentorId, apprenticeId: row.apprenticeId,
      mentorName: crewMemberName(row.mentor.role, row.mentor.serial),
      apprenticeName: crewMemberName(row.apprentice.role, row.apprentice.serial),
      lessons: row.lessons, maxLessons: CREW_BOND_MAX_MEMORIES,
      milestone: crewBondMilestone(row.lessons),
      startedAt: row.startedAt.toISOString(), endedAt: row.endedAt?.toISOString() ?? null,
      memories: row.memories.map((memory) => ({
        source: memory.source, label: memory.summary, at: memory.at.toISOString(),
      })),
    };
  },

  async list(tx: Db, roundPlayerId: string, enabled: boolean): Promise<CrewMentorBondDto[]> {
    if (!enabled) return [];
    // Never hide an old ACTIVE bond behind newer ended history: the player
    // must always be able to end every active mentorship from the roster.
    const [active, ended] = await Promise.all([
      tx.crewMentorBond.findMany({
        where: { roundPlayerId, endedAt: null },
        orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
        select: bondSelect,
      }),
      tx.crewMentorBond.findMany({
        where: { roundPlayerId, endedAt: { not: null } },
        orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
        take: 100,
        select: bondSelect,
      }),
    ]);
    return [...active, ...ended].map((row) => CrewBondService.dto(row));
  },
};
