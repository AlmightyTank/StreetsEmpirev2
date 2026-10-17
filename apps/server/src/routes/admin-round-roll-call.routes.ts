import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { parseBody } from '../utils/validate.js';
import { AppError } from '../utils/errors.js';
import { RoundRollCallService, roundRollCallClock } from '../services/round-roll-call.service.js';
import { RoundRollCallRewardService } from '../services/round-roll-call-reward.service.js';
import { rollCallEconomyProjection, rollCallReleaseWarnings } from '../services/round-roll-call-release.service.js';

const id = z.string().trim().min(1).max(128);
const overviewQuery = z.object({ roundId: id }).strict();
const detailQuery = z.object({ roundId: id, roundPlayerId: id }).strict();

/**
 * Private, read-only diagnostics. Admin cannot mint arbitrary attendance;
 * recoveries can only happen through the player's server-enforced rules.
 */
const adminRoundRollCallRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', fastify.requireAdmin);

  fastify.get('/round-roll-call/overview', async (request, reply) => {
    const { roundId } = parseBody(overviewQuery, request.query);
    reply.header('Cache-Control', 'private, no-store');
    const round = await fastify.prisma.round.findUnique({ where: { id: roundId } });
    if (!round) throw AppError.notFound('ROUND_NOT_FOUND', 'Round does not exist.');
    const where = { roundPlayer: { roundId } };
    const [players, actualLogins, recoveredStamps, recoveryAudits, rewardClaims, recentRecoveries] = await Promise.all([
      fastify.prisma.roundPlayer.count({ where: { roundId } }),
      fastify.prisma.roundLoginCheckIn.count({ where: { ...where, source: 'LOGIN' } }),
      fastify.prisma.roundLoginCheckIn.count({ where: { ...where, source: 'RECOVERY' } }),
      fastify.prisma.roundLoginRecovery.count({ where }),
      fastify.prisma.roundLoginRewardClaim.count({ where }),
      fastify.prisma.roundLoginRecovery.findMany({
        where, orderBy: { createdAt: 'desc' }, take: 50,
        select: {
          id: true, roundPlayerId: true, dayIndex: true, actionId: true, actorAccountId: true,
          createdAt: true, reason: true, stampsBefore: true, missedBefore: true,
          roundPlayer: { select: { displayName: true } },
        },
      }),
    ]);
    const clock = roundRollCallClock(round, new Date());
    const economy = rollCallEconomyProjection(clock.roundDays, players, round.roundLoginRewardVersion);
    const releaseWarnings = rollCallReleaseWarnings({
      players, roundDays: clock.roundDays, requiredStamps: clock.requiredStamps,
      actualLogins, recoveredStamps, recoveryAudits, rewardClaims,
      rewardVersion: round.roundLoginRewardVersion,
    });
    return {
      roundId,
      status: round.status,
      clock,
      economy,
      releaseWarnings,
      players,
      actualLogins,
      recoveredStamps,
      recoveryAudits,
      rewardClaims,
      auditMatchesStampCount: recoveredStamps === recoveryAudits,
      recoveryLimitPerPlayer: 2,
      recentRecoveries: recentRecoveries.map((row) => ({
        ...row, displayName: row.roundPlayer.displayName, roundPlayer: undefined,
      })),
    };
  });

  fastify.get('/round-roll-call/diagnose', async (request, reply) => {
    const { roundId, roundPlayerId } = parseBody(detailQuery, request.query);
    reply.header('Cache-Control', 'private, no-store');
    const [round, player] = await Promise.all([
      fastify.prisma.round.findUnique({ where: { id: roundId } }),
      fastify.prisma.roundPlayer.findUnique({
        where: { id: roundPlayerId },
        select: { id: true, accountId: true, roundId: true, displayName: true, createdAt: true },
      }),
    ]);
    if (!round || !player || player.roundId !== round.id) {
      throw AppError.notFound('NOT_IN_ROUND', 'No matching player in this round.');
    }
    const [attendance, rewardBoard, stamps, audits] = await Promise.all([
      RoundRollCallService.view(fastify.prisma, round, player.id),
      RoundRollCallRewardService.board(fastify.prisma, round, player.id),
      fastify.prisma.roundLoginCheckIn.findMany({
        where: { roundPlayerId: player.id }, orderBy: { dayIndex: 'asc' },
        select: { dayIndex: true, checkedInAt: true, source: true },
      }),
      fastify.prisma.roundLoginRecovery.findMany({
        where: { roundPlayerId: player.id }, orderBy: { createdAt: 'asc' },
        select: { dayIndex: true, actionId: true, actorAccountId: true,
          reason: true, stampsBefore: true, missedBefore: true, createdAt: true },
      }),
    ]);
    const recovered = stamps.filter((stamp) => stamp.source === 'RECOVERY').map((stamp) => stamp.dayIndex);
    return {
      roundId, player, attendance,
      recovery: rewardBoard.recovery,
      grandPrize: rewardBoard.grandPrize,
      claimedRewardTiers: rewardBoard.rewardTrack.filter((tier) => tier.claimed).map((tier) => tier.tier),
      stamps, audits,
      anomalies: {
        auditStampMismatch: recovered.length !== audits.length
          || recovered.some((day) => !audits.some((audit) => audit.dayIndex === day)),
        exceedsRecoveryCap: audits.length > 2,
        unpairedGrandPrize: rewardBoard.grandPrize.themeOwned !== rewardBoard.grandPrize.crewOwned,
      },
    };
  });
};
export default adminRoundRollCallRoutes;
