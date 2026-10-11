import type { PrismaClient } from '@prisma/client';
import type { AdminCrewCorrectionInput, AdminCrewCorrectionResult, AdminCrewPlayerDto, AdminCrewRosterDto } from '@streets/shared';
import { loadRulesetForRound } from '@streets/rules-engine';
import { lockRound, lockRoundPlayer } from '../utils/db.js';
import { AppError } from '../utils/errors.js';
import { AdminAuditService, type AuditActor } from './admin-audit.service.js';
import { crewMemberName } from './crew-profile.js';

const MAX_CAREER_XP = 1_000_000;

/** 1.7.0-F. Career health reporting and narrowly scoped, immutable admin correction. */
export const AdminCrewService = {
  async playerRoster(prisma: PrismaClient, roundPlayerId: string): Promise<AdminCrewPlayerDto> {
    const player = await prisma.roundPlayer.findUnique({ where: { id: roundPlayerId }, select: { id: true, round: { select: { rulesetId: true, rulesetVersion: true } } } });
    if (!player) throw AppError.notFound('PLAYER_NOT_FOUND', 'That player does not exist.');
    const ruleset = loadRulesetForRound(player.round);
    if (!ruleset.crewRoster?.enabled) return { enabled: false, members: [] };
    const rows = await prisma.crewMember.findMany({ where: { roundPlayerId }, orderBy: [{ experiencePoints: 'desc' }, { serial: 'asc' }], take: 200, select: { id: true, role: true, serial: true, status: true, experiencePoints: true, specialty: true, specialtyExperiencePoints: true } });
    return { enabled: true, members: rows.map((row) => ({ ...row, name: crewMemberName(row.role, row.serial) })) };
  },

  async report(prisma: PrismaClient, roundId: string, now = new Date()): Promise<AdminCrewRosterDto> {
    const round = await prisma.round.findUnique({ where: { id: roundId }, select: { id: true, name: true, status: true, rulesetId: true, rulesetVersion: true } });
    if (!round) throw AppError.notFound('ROUND_NOT_FOUND', 'That round does not exist.');
    const ruleset = loadRulesetForRound(round);
    const [players, migrations, totals, experience, roles, specialties, statuses, assignments, veterans] = await Promise.all([
      prisma.roundPlayer.count({ where: { roundId } }),
      prisma.crewRosterMigration.count({ where: { roundPlayer: { roundId } } }),
      prisma.crewMember.count({ where: { roundPlayer: { roundId } } }),
      prisma.crewMember.aggregate({ where: { roundPlayer: { roundId } }, _min: { experiencePoints: true }, _max: { experiencePoints: true }, _avg: { experiencePoints: true } }),
      prisma.crewMember.groupBy({ by: ['role'], where: { roundPlayer: { roundId } }, _count: { _all: true } }),
      prisma.crewMember.groupBy({ by: ['specialty'], where: { roundPlayer: { roundId } }, _count: { _all: true } }),
      prisma.crewMember.groupBy({ by: ['status'], where: { roundPlayer: { roundId } }, _count: { _all: true } }),
      prisma.crewMember.groupBy({ by: ['assignmentKind'], where: { roundPlayer: { roundId }, status: { not: 'RELEASED' } }, _count: { _all: true } }),
      prisma.crewMember.findMany({
        where: { roundPlayer: { roundId }, experiencePoints: { gt: 0 } },
        orderBy: [{ experiencePoints: 'desc' }, { specialtyExperiencePoints: 'desc' }, { serial: 'asc' }], take: 100,
        select: { id: true, roundPlayerId: true, role: true, serial: true, experiencePoints: true, specialty: true, specialtyExperiencePoints: true, roundPlayer: { select: { displayName: true } } },
      }),
    ]);
    return {
      roundId, roundName: round.name, roundStatus: round.status, rulesetId: round.rulesetId,
      enabled: Boolean(ruleset.crewRoster?.enabled), generatedAt: now.toISOString(),
      players: { total: players, migrated: migrations, pending: Math.max(0, players - migrations) },
      members: { total: totals, experienceMin: experience._min.experiencePoints, experienceMax: experience._max.experiencePoints, experienceAverage: experience._avg.experiencePoints === null ? null : Math.round(experience._avg.experiencePoints) },
      byRole: roles.map((row) => ({ role: row.role, count: row._count._all })),
      bySpecialty: specialties.map((row) => ({ specialty: row.specialty, count: row._count._all })),
      byStatus: statuses.map((row) => ({ status: row.status, count: row._count._all })),
      byAssignment: assignments.map((row) => ({ assignment: row.assignmentKind ?? 'UNASSIGNED', count: row._count._all })),
      topVeterans: veterans.map((row) => ({ roundPlayerId: row.roundPlayerId, displayName: row.roundPlayer.displayName, memberId: row.id, role: row.role, serial: row.serial, experiencePoints: row.experiencePoints, specialty: row.specialty, specialtyExperiencePoints: row.specialtyExperiencePoints })),
    };
  },

  async correct(prisma: PrismaClient, actor: AuditActor, roundPlayerId: string, memberId: string, input: AdminCrewCorrectionInput, now = new Date()): Promise<AdminCrewCorrectionResult> {
    if (!Number.isSafeInteger(input.experiencePoints) || input.experiencePoints < 0 || input.experiencePoints > MAX_CAREER_XP
      || !Number.isSafeInteger(input.specialtyExperiencePoints) || input.specialtyExperiencePoints < 0 || input.specialtyExperiencePoints > MAX_CAREER_XP) {
      throw AppError.badRequest('CREW_CORRECTION_INVALID', `Career experience must be a whole number from 0 to ${MAX_CAREER_XP}.`);
    }
    return prisma.$transaction(async (tx) => {
      const initial = await tx.roundPlayer.findUnique({ where: { id: roundPlayerId }, select: { id: true, round: { select: { id: true } } } });
      if (!initial) throw AppError.notFound('PLAYER_NOT_FOUND', 'That player does not exist.');
      // Serialize with round close/archive before checking status, so a correction
      // cannot slip through while a lifecycle transition freezes the round.
      await lockRound(tx, initial.round.id);
      await lockRoundPlayer(tx, roundPlayerId);
      const player = await tx.roundPlayer.findUnique({ where: { id: roundPlayerId }, select: { id: true, accountId: true, displayName: true, round: { select: { id: true, status: true } } } });
      if (!player) throw AppError.notFound('PLAYER_NOT_FOUND', 'That player does not exist.');
      if (player.accountId === actor.id) throw AppError.conflict('ADMIN_SELF_ACTION', 'Another admin has to correct your own crew career.');
      if (player.round.status === 'ENDED' || player.round.status === 'ARCHIVED') throw AppError.conflict('ROUND_FINISHED', 'That round has finished, so its crew careers are frozen.');
      const member = await tx.crewMember.findFirst({ where: { id: memberId, roundPlayerId } });
      if (!member) throw AppError.notFound('CREW_MEMBER_NOT_FOUND', 'That crew member does not belong to this player.');
      if (member.dealerStaffId && (input.specialty !== 'DEALER' || input.specialtyExperiencePoints !== input.experiencePoints)) {
        throw AppError.conflict('DEALER_CAREER_LINKED', 'Dealer careers stay linked to their dealer record. Keep the DEALER specialty and set both experience values to the same total.');
      }
      const after = { experiencePoints: input.experiencePoints, specialty: input.specialty, specialtyExperiencePoints: input.specialtyExperiencePoints };
      const before = { experiencePoints: member.experiencePoints, specialty: member.specialty, specialtyExperiencePoints: member.specialtyExperiencePoints };
      if (before.experiencePoints === after.experiencePoints && before.specialty === after.specialty && before.specialtyExperiencePoints === after.specialtyExperiencePoints) {
        throw AppError.conflict('CREW_CORRECTION_UNCHANGED', 'Those career values are already set.');
      }
      await tx.crewMember.update({ where: { id: member.id }, data: after });
      if (member.dealerStaffId) await tx.dealerStaff.update({ where: { id: member.dealerStaffId }, data: { experiencePoints: input.experiencePoints } });
      await tx.crewMemberEvent.create({ data: { memberId: member.id, roundPlayerId, kind: 'ADMIN_CORRECTED', summary: `Staff career correction · ${input.reason}`, at: now } });
      const audit = await AdminAuditService.record(tx, actor, {
        action: 'crew.member-correct', targetType: 'crew-member', targetId: member.id, reason: input.reason,
        before: { roundId: player.round.id, roundPlayerId, displayName: player.displayName, ...before },
        after: { roundId: player.round.id, roundPlayerId, displayName: player.displayName, ...after },
      });
      return { memberId: member.id, ...after, auditId: audit?.id ?? null };
    });
  },
};
