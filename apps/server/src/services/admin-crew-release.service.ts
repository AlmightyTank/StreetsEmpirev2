import type { PrismaClient } from '@prisma/client';
import { loadRulesetForRound } from '@streets/rules-engine';
import { CREW_LOYALTY_CAP, CREW_LOYALTY_DAILY_CAP, CREW_LOYALTY_WEEKLY_CAP, crewLoyaltyEnabled } from './crew-loyalty.service.js';
import { CREW_BOND_MAX_MEMORIES } from './crew-bonds.service.js';
import { eligibleCrewNicknames } from './crew-legends.service.js';
import { CrewRosterService } from './crew-roster.service.js';
import { AdminAuditService, type AuditActor } from './admin-audit.service.js';
import { lockRound, lockRoundPlayer } from '../utils/db.js';
import { AppError } from '../utils/errors.js';

/** Immutable receipts, not user-edited tier labels, are the sole source of truth. */
export function canonicalCrewLoyalty(points: number | null | undefined): number {
  if (!Number.isSafeInteger(points) || (points ?? -1) < 0 || points! > CREW_LOYALTY_CAP) {
    throw AppError.conflict('CREW_LEDGER_INVALID', 'The immutable receipt total is invalid. Investigate the source events rather than manufacturing points.');
  }
  return points!;
}

export interface CrewReceiptAuditRow {
  id: string;
  source: string;
  sourceKey: string;
  points: number;
  summary: string;
  at: string;
}

const perSourceLimit: Record<string, number> = {
  JOB_COMPLETED: 2, DEFENSE_HELD: 4, TRAVEL_COMPLETED: 3, DEALER_SHIFT: 2,
};

export function receiptProblems(receipts: ReadonlyArray<{ id: string; source: string; points: number; at: Date }>): string[] {
  const errors: string[] = [];
  const byDay = new Map<string, number>();
  const byWeek = new Map<string, number>();
  for (const entry of receipts) {
    const cap = perSourceLimit[entry.source];
    if (cap === undefined || !Number.isSafeInteger(entry.points) || entry.points < 0 || entry.points > cap) {
      errors.push(`Invalid receipt ${entry.id}: ${entry.source} +${entry.points}`);
      continue;
    }
    const at = entry.at.getTime();
    if (!Number.isFinite(at)) { errors.push(`Invalid receipt timestamp ${entry.id}`); continue; }
    const day = entry.at.toISOString().slice(0, 10);
    const monday = new Date(Date.UTC(entry.at.getUTCFullYear(), entry.at.getUTCMonth(), entry.at.getUTCDate()));
    monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
    const week = monday.toISOString().slice(0, 10);
    const d = (byDay.get(day) ?? 0) + entry.points;
    const w = (byWeek.get(week) ?? 0) + entry.points;
    byDay.set(day, d); byWeek.set(week, w);
    if (d > CREW_LOYALTY_DAILY_CAP) errors.push(`Daily cap exceeded on ${day}`);
    if (w > CREW_LOYALTY_WEEKLY_CAP) errors.push(`Weekly cap exceeded starting ${week}`);
  }
  return [...new Set(errors)];
}

export const AdminCrewReleaseService = {
  /** Staff-only high-level counters. Aggregations stay in PostgreSQL; no public archive exposure. */
  async roundHealth(prisma: PrismaClient, roundId: string) {
    const round = await prisma.round.findUnique({
      where: { id: roundId },
      select: { id: true, name: true, status: true, rulesetId: true, rulesetVersion: true },
    });
    if (!round) throw AppError.notFound('ROUND_NOT_FOUND', 'That round does not exist.');
    const ruleset = loadRulesetForRound(round);
    const where = { roundPlayer: { roundId } };
    const [members, receipts, positiveReceipts, cappedReceipts, bonds, bondMemories, archives, pendingLegacy] = await Promise.all([
      prisma.crewMember.count({ where }),
      prisma.crewLoyaltyEntry.count({ where }),
      prisma.crewLoyaltyEntry.count({ where: { ...where, points: { gt: 0 } } }),
      prisma.crewLoyaltyEntry.count({ where: { ...where, points: 0 } }),
      prisma.crewMentorBond.count({ where }),
      prisma.crewBondMemory.count({ where }),
      prisma.crewLegendArchive.count({ where: { sourceRoundId: roundId } }),
      prisma.roundPlayer.count({ where: { roundId, crewRosterMigration: null } }),
    ]);
    const anomalies = await prisma.$queryRaw<Array<{ id: string; roundPlayerId: string; stored: number; earned: number }>>`
      SELECT m."id", m."roundPlayerId", m."loyaltyPoints" AS "stored",
        COALESCE(SUM(e."points"), 0)::integer AS "earned"
      FROM "CrewMember" m
      JOIN "RoundPlayer" p ON p."id" = m."roundPlayerId"
      LEFT JOIN "CrewLoyaltyEntry" e ON e."memberId" = m."id"
      WHERE p."roundId" = ${roundId}
      GROUP BY m."id"
      HAVING m."loyaltyPoints" <> COALESCE(SUM(e."points"), 0)
        OR m."loyaltyPoints" NOT BETWEEN 0 AND ${CREW_LOYALTY_CAP}
      ORDER BY m."roundPlayerId", m."id"
      LIMIT 25
    `;
    return {
      roundId, status: round.status, loyaltyEnabled: crewLoyaltyEnabled(ruleset),
      members, receipts, positiveReceipts, cappedReceipts, bonds, bondMemories, archivedLegends: archives,
      pendingLegacy, receiptMismatchSample: anomalies.map((a) => ({ ...a, earned: Number(a.earned) })),
      cutoffs: { loyalty: CREW_LOYALTY_CAP, perDay: CREW_LOYALTY_DAILY_CAP, perWeek: CREW_LOYALTY_WEEKLY_CAP, bondMemories: CREW_BOND_MAX_MEMORIES },
      archivalPolicy: 'Snapshots are detached account records, frozen at season close; no active crew restore',
    };
  },

  /** Staff reads use a bounded page and full numeric aggregate; the recent
   * page is not falsely presented as the full history. Source keys aid traceability.
   */
  async provenance(prisma: PrismaClient, roundPlayerId: string, memberId: string) {
    const player = await prisma.roundPlayer.findUnique({
      where: { id: roundPlayerId },
      select: { id: true, round: { select: { id: true, status: true, rulesetId: true, rulesetVersion: true } } },
    });
    if (!player) throw AppError.notFound('PLAYER_NOT_FOUND', 'That player was not found.');
    const member = await prisma.crewMember.findFirst({
      where: { roundPlayerId, id: memberId },
      select: { id: true, serial: true, role: true, status: true, nicknameKey: true, nicknameSuppressed: true, loyaltyPoints: true },
    });
    if (!member) throw AppError.notFound('CREW_MEMBER_NOT_FOUND', 'That member is not on this roster.');
    const [aggregate, total, rows, bondCount] = await Promise.all([
      prisma.crewLoyaltyEntry.aggregate({ where: { memberId, roundPlayerId }, _sum: { points: true } }),
      prisma.crewLoyaltyEntry.count({ where: { memberId, roundPlayerId } }),
      prisma.crewLoyaltyEntry.findMany({
        where: { memberId, roundPlayerId },
        select: { id: true, source: true, sourceKey: true, points: true, summary: true, at: true },
        orderBy: [{ at: 'desc' }, { id: 'desc' }], take: 100,
      }),
      prisma.crewMentorBond.count({ where: { roundPlayerId, OR: [{ mentorId: memberId }, { apprenticeId: memberId }] } }),
    ]);
    const earned = aggregate._sum.points ?? 0;
    return {
      roundId: player.round.id, roundStatus: player.round.status,
      loyaltyEnabled: crewLoyaltyEnabled(loadRulesetForRound(player.round)),
      member, earnedFromReceipts: earned, storedPointsMatch: earned === member.loyaltyPoints,
      totalReceipts: total, sampledReceipts: rows.length, hasMore: total > rows.length,
      sampleAnomalies: receiptProblems(rows),
      relatedBonds: bondCount,
      recent: rows.map((r): CrewReceiptAuditRow => ({ ...r, at: r.at.toISOString() })),
    };
  },

  /** Safe staff correction ONLY of a corrupt materialized loyalty counter,
   * never of immutable source receipts, combat modifiers, or snapshot histories.
   * Round lock serializes with close; player lock serializes with settlements.
   */
  async reconcile(prisma: PrismaClient, actor: AuditActor, roundPlayerId: string, memberId: string,
    input: { reason: string; expectedPoints: number }, now = new Date()) {
    if (!Number.isSafeInteger(input.expectedPoints) || input.expectedPoints < 0 || input.expectedPoints > CREW_LOYALTY_CAP) {
      throw AppError.badRequest('CREW_CORRECTION_INVALID', 'Expected points must be between zero and 100.');
    }
    return prisma.$transaction(async (tx) => {
      const initial = await tx.roundPlayer.findUnique({ where: { id: roundPlayerId }, select: { roundId: true } });
      if (!initial) throw AppError.notFound('PLAYER_NOT_FOUND', 'That player was not found.');
      await lockRound(tx, initial.roundId);
      await lockRoundPlayer(tx, roundPlayerId);
      const player = await tx.roundPlayer.findUnique({
        where: { id: roundPlayerId },
        select: { id: true, accountId: true, displayName: true, round: { select: { id: true, status: true, rulesetId: true, rulesetVersion: true } } },
      });
      if (!player) throw AppError.notFound('PLAYER_NOT_FOUND', 'That player was not found.');
      if (player.accountId === actor.id) throw AppError.conflict('ADMIN_SELF_ACTION', 'Another admin must correct your own crew.');
      if (player.round.status === 'ENDED' || player.round.status === 'ARCHIVED') {
        throw AppError.conflict('ROUND_FINISHED', 'Frozen round biographies and loyalty cannot be changed.');
      }
      if (!crewLoyaltyEnabled(loadRulesetForRound(player.round))) {
        throw AppError.conflict('CREW_LOYALTY_DISABLED', 'This pinned ruleset does not use loyalty.');
      }
      const member = await tx.crewMember.findFirst({
        where: { id: memberId, roundPlayerId },
        select: { id: true, loyaltyPoints: true, nicknameKey: true, nicknameSuppressed: true },
      });
      if (!member) throw AppError.notFound('CREW_MEMBER_NOT_FOUND', 'That member does not belong to this player.');
      if (member.loyaltyPoints !== input.expectedPoints) throw AppError.conflict('CREW_CORRECTION_STALE', 'Stored loyalty changed; inspect current provenance before retrying.');
      const sum = await tx.crewLoyaltyEntry.aggregate({ where: { memberId, roundPlayerId }, _sum: { points: true } });
      const canonical = canonicalCrewLoyalty(sum._sum.points ?? 0);
      if (canonical === member.loyaltyPoints) throw AppError.conflict('CREW_CORRECTION_UNCHANGED', 'Loyalty already matches the immutable ledger.');
      // Do not preserve a nickname that only crossed its threshold because the materialized total drifted.
      const positive = member.nicknameKey ? await tx.crewLoyaltyEntry.findMany({
        where: { memberId, roundPlayerId, points: { gt: 0 } }, select: { source: true, points: true },
      }) : [];
      const keepName = !member.nicknameSuppressed && member.nicknameKey !== null
        && eligibleCrewNicknames({ loyaltyPoints: canonical, receipts: positive }).some((name) => name.key === member.nicknameKey);
      await tx.crewMember.update({
        where: { id: memberId },
        data: { loyaltyPoints: canonical, ...(member.nicknameKey && !keepName ? { nicknameKey: null } : {}) },
      });
      await tx.crewMemberEvent.create({
        data: { memberId, roundPlayerId, kind: 'ADMIN_CORRECTED', at: now, summary: `Staff reconciled loyalty with verified ledger · ${input.reason}` },
      });
      const audit = await AdminAuditService.record(tx, actor, {
        action: 'crew.loyalty-reconcile', targetType: 'crew-member', targetId: memberId, reason: input.reason,
        before: { roundId: player.round.id, roundPlayerId, displayName: player.displayName, points: member.loyaltyPoints, nicknameKey: member.nicknameKey },
        after: { roundId: player.round.id, roundPlayerId, displayName: player.displayName, points: canonical, nicknameKey: keepName ? member.nicknameKey : null },
      });
      return { memberId, before: member.loyaltyPoints, verified: canonical, nicknameReset: Boolean(member.nicknameKey && !keepName), auditId: audit.id };
    });
  },

  /** Explicit legacy recovery after an interrupted initial import. Uses the
   * standard fail-closed planner under both locks and never alters counts.
   */
  async repairRoster(prisma: PrismaClient, actor: AuditActor, roundPlayerId: string, reason: string, now = new Date()) {
    return prisma.$transaction(async (tx) => {
      const initial = await tx.roundPlayer.findUnique({ where: { id: roundPlayerId }, select: { roundId: true } });
      if (!initial) throw AppError.notFound('PLAYER_NOT_FOUND', 'That player was not found.');
      await lockRound(tx, initial.roundId);
      await lockRoundPlayer(tx, roundPlayerId);
      const player = await tx.roundPlayer.findUnique({
        where: { id: roundPlayerId },
        select: { accountId: true, round: { select: { id: true, status: true, rulesetId: true, rulesetVersion: true } } },
      });
      if (!player) throw AppError.notFound('PLAYER_NOT_FOUND', 'That player was not found.');
      if (player.accountId === actor.id) throw AppError.conflict('ADMIN_SELF_ACTION', 'Another admin must repair your own crew.');
      if (player.round.status === 'ENDED' || player.round.status === 'ARCHIVED') throw AppError.conflict('ROUND_FINISHED', 'Archived rounds cannot be repaired.');
      const ruleset = loadRulesetForRound(player.round);
      if (!ruleset.crewRoster?.enabled) throw AppError.conflict('CREW_ROSTER_DISABLED', 'This pinned ruleset predates individual crew.');
      const migration = await tx.crewRosterMigration.findUnique({ where: { roundPlayerId }, select: { id: true } });
      if (migration) await tx.crewRosterMigration.update({ where: { roundPlayerId }, data: { syncedKey: null } });
      const outcome = await CrewRosterService.sync(tx, roundPlayerId, ruleset, now);
      const audit = await AdminAuditService.record(tx, actor, {
        action: 'crew.roster-repair', targetType: 'round-player', targetId: roundPlayerId, reason,
        before: { roundId: player.round.id, migrationPresent: Boolean(migration) },
        after: { roundId: player.round.id, outcome },
      });
      return { outcome, auditId: audit.id };
    });
  },
};
