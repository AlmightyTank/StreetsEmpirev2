import type { PrismaClient, Round } from '@prisma/client';
import type { Db } from '../utils/db.js';
import { AppError } from '../utils/errors.js';
import { RoundRollCallService } from './round-roll-call.service.js';
import { RoundRollCallCosmeticService } from './round-roll-call-cosmetic.service.js';

export const ROUND_ROLL_CALL_RECOVERY_LIMIT = 2;
type Attendance = Awaited<ReturnType<typeof RoundRollCallService.view>>;
type LoginStamp = { dayIndex: number; source: string };
type RecoveryReceipt = { dayIndex: number; actionId: string; createdAt: Date };

export function rollCallRecoveryPolicy(
  attendance: Attendance,
  stamps: readonly LoginStamp[],
  recoveries: readonly RecoveryReceipt[],
) {
  const used = recoveries.length;
  const genuineStamps = stamps.filter((s) => s.source === 'LOGIN').length;
  // Using wall-clock createdAt wrongly excludes eligible round days after
  // completed admin pauses. Anchor eligibility to the first *actual* login
  // stamp instead: it is a pause-adjusted, server-recorded proof that the
  // account was already enrolled by that round day, with no pre-enrollment
  // makeup possibility and no ability to forge earlier attendance.
  const firstRealDay = Math.min(...stamps.filter((s) => s.source === 'LOGIN').map((s) => s.dayIndex));
  const taken = new Set(stamps.map((s) => s.dayIndex));
  const missedEligibleDays = Array.from({ length: Math.max(0, attendance.completedDaySlots) }, (_, i) => i + 1)
    .filter((day) => day >= firstRealDay && !taken.has(day));
  // The existing seven free missed days never reset or become a streak.
  // Self-service repair only activates *after* the native allowance is exhausted.
  let reason: 'ready' | 'closed' | 'complete' | 'limit' | 'allowance' | 'genuine_stamp' | 'no_eligible_day';
  if (!attendance.active) reason = 'closed';
  else if (attendance.completed) reason = 'complete';
  else if (used >= ROUND_ROLL_CALL_RECOVERY_LIMIT) reason = 'limit';
  else if (attendance.missedCompletedDays <= attendance.allowanceDays) reason = 'allowance';
  else if (genuineStamps < 1) reason = 'genuine_stamp';
  else if (!missedEligibleDays.length) reason = 'no_eligible_day';
  else reason = 'ready';
  return {
    used,
    limit: ROUND_ROLL_CALL_RECOVERY_LIMIT,
    remaining: Math.max(0, ROUND_ROLL_CALL_RECOVERY_LIMIT - used),
    eligible: reason === 'ready',
    reason,
    nextDayIndex: reason === 'ready' ? missedEligibleDays[0]! : null,
    genuineStamps,
    history: recoveries.map((row) => ({ dayIndex: row.dayIndex, recoveredAt: row.createdAt.toISOString() })),
  };
}

export const RoundRollCallRecoveryService = {
  /** Side-effect-free preview for the player board and admin diagnostics. */
  async status(
    db: Db | PrismaClient,
    round: Round,
    roundPlayerId: string,
    now = new Date(),
    attendance?: Attendance,
  ) {
    const [player, stamps, recoveries, view] = await Promise.all([
      db.roundPlayer.findUnique({ where: { id: roundPlayerId }, select: { roundId: true } }),
      db.roundLoginCheckIn.findMany({
        where: { roundPlayerId }, select: { dayIndex: true, source: true }, orderBy: { dayIndex: 'asc' },
      }),
      db.roundLoginRecovery.findMany({
        where: { roundPlayerId }, select: { dayIndex: true, actionId: true, createdAt: true }, orderBy: { createdAt: 'asc' },
      }),
      attendance ? Promise.resolve(attendance) : RoundRollCallService.view(db, round, roundPlayerId, now),
    ]);
    if (!player || player.roundId !== round.id) {
      throw AppError.notFound('NOT_IN_ROUND', 'Player does not belong to this round.');
    }
    return rollCallRecoveryPolicy(view, stamps, recoveries);
  },

  /**
   * No currency or paid token, no artificial future-day stamp, and no client
   * chosen day. A max-two, signed-in-account recovery only when >7 days were
   * missed. Round SHARE then player UPDATE locks match the lifecycle order.
   * The audit receipt and recovered stamp commit together.
   */
  async recover(prisma: PrismaClient, roundId: string, roundPlayerId: string, accountId: string, actionId: string, now = new Date()) {
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Round" WHERE id = ${roundId} FOR SHARE`;
      await tx.$queryRaw`SELECT id FROM "RoundPlayer" WHERE id = ${roundPlayerId} AND "roundId" = ${roundId} FOR UPDATE`;
      const [round, player] = await Promise.all([
        tx.round.findUnique({ where: { id: roundId } }),
        tx.roundPlayer.findUnique({ where: { id: roundPlayerId }, select: { accountId: true, roundId: true } }),
      ]);
      if (!round || !player || player.accountId !== accountId || player.roundId !== round.id) {
        throw AppError.notFound('NOT_IN_ROUND', 'Join this round to recover a missed day.');
      }
      const previous = await tx.roundLoginRecovery.findUnique({
        where: { roundPlayerId_actionId: { roundPlayerId, actionId } },
      });
      if (previous) {
        return { recorded: false, replayed: true, dayIndex: previous.dayIndex, ...(await RoundRollCallService.view(tx, round, roundPlayerId, now)),
          recovery: await this.status(tx, round, roundPlayerId, now) };
      }
      const before = await RoundRollCallService.view(tx, round, roundPlayerId, now);
      const eligibility = await this.status(tx, round, roundPlayerId, now, before);
      if (!eligibility.eligible || eligibility.nextDayIndex === null) {
        throw AppError.conflict('ROUND_ROLL_CALL_RECOVERY_UNAVAILABLE', `Catch-up is not available: ${eligibility.reason}.`);
      }
      const dayIndex = eligibility.nextDayIndex;
      await tx.roundLoginCheckIn.create({
        data: { roundPlayerId, dayIndex, checkedInAt: now, source: 'RECOVERY' },
      });
      await tx.roundLoginRecovery.create({
        data: {
          roundPlayerId, dayIndex, actionId, actorAccountId: accountId, reason: 'SELF_SERVICE',
          stampsBefore: before.stamps, missedBefore: before.missedCompletedDays, createdAt: now,
        },
      });
      const after = await RoundRollCallService.view(tx, round, roundPlayerId, now);
      if (after.completed) {
        await RoundRollCallCosmeticService.awardIfEligible(tx, round, roundPlayerId, accountId, now);
      }
      return { ...after, recorded: true, replayed: false, dayIndex,
        recovery: await this.status(tx, round, roundPlayerId, now, after) };
    });
  },
};
