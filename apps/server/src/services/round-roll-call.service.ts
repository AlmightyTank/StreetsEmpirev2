import type { PrismaClient, Round } from '@prisma/client';
import { AppError } from '../utils/errors.js';
import { RoundRollCallCosmeticService } from './round-roll-call-cosmetic.service.js';
import { CrownEarnService } from './crown-earn.service.js';
import type { Db } from '../utils/db.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
export const ROUND_ROLL_CALL_ALLOWANCE_DAYS = 7;

/**
 * Each attendance window begins at the round's startsAt plus a whole number
 * of 24-hour days. It does not use the browser clock or a player's timezone.
 * Partial final days count as a day, and their window closes at endsAt.
 */
export function roundRollCallClock(round: Pick<Round, 'startsAt' | 'endsAt' | 'status'> & { pausedAt?: Date | null; pausedMinutesTotal?: number }, now: Date) {
  const start = round.startsAt.getTime();
  const end = round.endsAt.getTime();
  const current = now.getTime();
  // Admin resume extends endsAt for the completed pause. Subtract that paused
  // time so it never adds attendance requirements or consumes a missed day.
  const completedPauseMs = Math.max(0, round.pausedMinutesTotal ?? 0) * MINUTE_MS;
  const openPauseMs = round.pausedAt
    ? Math.max(0, Math.min(current, end) - round.pausedAt.getTime())
    : 0;
  // An open pause freezes the current day. It must not shrink the scheduled
  // track: resume either extends endsAt by the same pause, or records it in
  // pausedMinutesTotal. Subtracting the open pause from the duration early
  // drops required stamps and rewrites unclaimed rewards until play resumes.
  const effectiveNowMs = Math.max(0, current - start - completedPauseMs - openPauseMs);
  const effectiveDurationMs = Math.max(0, end - start - completedPauseMs);
  const roundDays = Math.max(0, Math.ceil(effectiveDurationMs / DAY_MS));
  const requiredStamps = Math.max(0, roundDays - ROUND_ROLL_CALL_ALLOWANCE_DAYS);
  const beforeStart = current < start;
  const ended = current >= end || round.status === 'ENDED' || round.status === 'ARCHIVED';
  const roundDay = beforeStart ? 0 : Math.min(roundDays, Math.floor(effectiveNowMs / DAY_MS) + 1);
  const active = round.status === 'ACTIVE' && round.pausedAt == null && !beforeStart && !ended && requiredStamps > 0;
  const completedDaySlots = beforeStart ? 0 : ended ? roundDays : Math.min(roundDays, Math.floor(effectiveNowMs / DAY_MS));
  const nextDayAt = active
    ? new Date(Math.min(end, start + roundDay * DAY_MS + completedPauseMs)).toISOString()
    : null;

  return {
    roundDays,
    requiredStamps,
    allowanceDays: Math.min(ROUND_ROLL_CALL_ALLOWANCE_DAYS, roundDays),
    roundDay,
    completedDaySlots,
    active,
    ended,
    nextDayAt,
    roundEndsAt: round.endsAt.toISOString(),
  };
}

export const RoundRollCallService = {
  /** Reading the board is side-effect-free. It never awards a login stamp. */
  async view(
    db: Db | PrismaClient,
    round: Round,
    roundPlayerId: string,
    now = new Date(),
  ) {
    const clock = roundRollCallClock(round, now);
    const records = await db.roundLoginCheckIn.findMany({
      where: { roundPlayerId },
      orderBy: { dayIndex: 'asc' },
      select: { dayIndex: true },
    });
    const checkedInRoundDays = records.map((record) => record.dayIndex);
    const stamps = Math.min(clock.requiredStamps, checkedInRoundDays.length);
    const checkedToday = clock.roundDay > 0 && checkedInRoundDays.includes(clock.roundDay);
    const completed = clock.requiredStamps > 0 && stamps >= clock.requiredStamps;
    const previouslyStamped = checkedInRoundDays.filter((day) => day <= clock.completedDaySlots).length;
    const missedCompletedDays = Math.max(0, clock.completedDaySlots - previouslyStamped);
    const availableFutureSlots = clock.roundDay === 0
      ? clock.roundDays
      : clock.ended
        ? 0
        : Math.max(0, clock.roundDays - clock.roundDay + (checkedToday ? 0 : 1));

    return {
      ...clock,
      checkedInRoundDays,
      stamps,
      completed,
      alreadyCheckedInToday: checkedToday,
      canCheckInToday: clock.active && !checkedToday && !completed,
      missedCompletedDays,
      allowanceRemaining: Math.max(0, clock.allowanceDays - missedCompletedDays),
      canStillFinish: clock.requiredStamps > 0 && (completed || stamps + availableFutureSlots >= clock.requiredStamps),
      // Rewards, their claim receipts and cosmetic entitlements belong to Slices B-D.
    };
  },

  /**
   * Only authenticated, joined players can call this through the game route.
   * Shared round lock serializes with early closure without blocking other check-ins; the unique
   * (roundPlayerId, dayIndex) key protects against tabs, retries and races.
   */
  async checkIn(prisma: PrismaClient, roundId: string, roundPlayerId: string, now = new Date()) {
    return prisma.$transaction(async (tx) => {
      // FOR SHARE permits concurrent check-ins but blocks round closure's FOR UPDATE.
      await tx.$queryRaw`SELECT id FROM "Round" WHERE id = ${roundId} FOR SHARE`;
      // Serialize against makeups (and final claims) on this player's row.
      // Round then player ordering matches the recovery endpoint and closure.
      const locked = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM "RoundPlayer" WHERE id = ${roundPlayerId} AND "roundId" = ${roundId} FOR UPDATE`;
      if (locked.length === 0) throw AppError.notFound('NOT_IN_ROUND', 'This player is not registered in the round.');
      const round = await tx.round.findUnique({ where: { id: roundId } });
      if (!round) throw AppError.notFound('ROUND_NOT_FOUND', 'That round is no longer available.');
      const clock = roundRollCallClock(round, now);
      if (!clock.active) {
        throw AppError.conflict('ROUND_ROLL_CALL_CLOSED', 'The round login reward window is not active.');
      }

      const before = await RoundRollCallService.view(tx, round, roundPlayerId, now);
      if (before.completed) {
        // Existing completed players, including those who claimed prior to D,
        // receive the missing account pair on an authenticated retry.
        const player = await tx.roundPlayer.findUniqueOrThrow({
          where: { id: roundPlayerId }, select: { accountId: true },
        });
        await RoundRollCallCosmeticService.awardIfEligible(tx, round, roundPlayerId, player.accountId, now);
        return { ...before, recorded: false };
      }
      if (before.alreadyCheckedInToday) return { ...before, recorded: false };

      const inserted = await tx.roundLoginCheckIn.createMany({
        data: [{ roundPlayerId, dayIndex: clock.roundDay, checkedInAt: now }],
        skipDuplicates: true,
      });
      // The Drop: check-in day milestones pay Crowns once each per round.
      if (inserted.count === 1) await CrownEarnService.onCheckIn(tx, roundPlayerId, now);
      const after = await RoundRollCallService.view(tx, round, roundPlayerId, now);
      // Full attendance is a server-verified requirement; no earlier stamp
      // awards permanent cosmetics and no second check-in can duplicate them.
      if (after.completed) {
        const player = await tx.roundPlayer.findUniqueOrThrow({
          where: { id: roundPlayerId }, select: { accountId: true },
        });
        await RoundRollCallCosmeticService.awardIfEligible(tx, round, roundPlayerId, player.accountId, now);
      }
      return { ...after, recorded: inserted.count === 1 };
    });
  },
};
