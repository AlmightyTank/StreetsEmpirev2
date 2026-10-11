import type { Prisma, Round } from '@prisma/client';
import { z } from 'zod';
import { AppError } from '../utils/errors.js';

const rewardPerQualificationCents = 50_000n;
const maximumRewardCents = 250_000n;
const qualificationSchema = z.enum([
  'NATIONAL_TOP_10',
  'WEALTH_KING',
  'TURF_WARLORD',
  'DRUG_KINGPIN',
  'CREW_COMMANDER',
  'BUSINESS_TYCOON',
  'ROUND_CHAMPION',
]);

const playerSchema = z.object({
  accountId: z.string(),
  eligibleCompetitor: z.boolean(),
  nationalRank: z.number().int().nullable(),
  crewMembers: z.number().int().nonnegative(),
  drugUnitsHeld: z.number().int().nonnegative().optional(),
  turfBlocksHeld: z.number().int().nonnegative(),
  activeBusinessesHeld: z.number().int().nonnegative(),
}).passthrough();

export type AftermathRewardQualification =
  | 'NATIONAL_TOP_10'
  | 'WEALTH_KING'
  | 'TURF_WARLORD'
  | 'DRUG_KINGPIN'
  | 'CREW_COMMANDER'
  | 'BUSINESS_TYCOON'
  | 'ROUND_CHAMPION';

export interface AftermathReward {
  sourceRoundId: string | null;
  amountCents: bigint;
  qualifications: AftermathRewardQualification[];
}

export function calculateAftermathReward(
  playerAggregates: Prisma.JsonValue | null,
  accountId: string,
): AftermathRewardQualification[] {
  const parsed = z.array(playerSchema).safeParse(playerAggregates);
  if (!parsed.success) {
    throw new AppError(500, 'AFTERMATH_REPORT_INVALID', 'The finalized round report has invalid player data for aftermath rewards.');
  }
  const players = parsed.data.filter((player) => player.eligibleCompetitor && player.nationalRank !== null);
  const player = players.find((candidate) => candidate.accountId === accountId);
  if (!player) return [];

  const topTurf = players.reduce((highest, candidate) => Math.max(highest, candidate.turfBlocksHeld), 0);
  const topCrew = players.reduce((highest, candidate) => Math.max(highest, candidate.crewMembers), 0);
  const topBusinesses = players.reduce((highest, candidate) => Math.max(highest, candidate.activeBusinessesHeld), 0);
  const topDrugs = players.reduce((highest, candidate) => Math.max(highest, candidate.drugUnitsHeld ?? 0), 0);
  const qualifications: AftermathRewardQualification[] = [];
  if (player.nationalRank! <= 10) qualifications.push('NATIONAL_TOP_10');
  if (player.nationalRank === 1) qualifications.push('WEALTH_KING');
  if (topTurf > 0 && player.turfBlocksHeld === topTurf) qualifications.push('TURF_WARLORD');
  if (topDrugs > 0 && (player.drugUnitsHeld ?? 0) === topDrugs) qualifications.push('DRUG_KINGPIN');
  if (topCrew > 0 && player.crewMembers === topCrew) qualifications.push('CREW_COMMANDER');
  if (topBusinesses > 0 && player.activeBusinessesHeld === topBusinesses) qualifications.push('BUSINESS_TYCOON');
  if (player.nationalRank === 1) qualifications.push('ROUND_CHAMPION');
  return qualifications;
}

export function calculateAftermathRewardAmountCents(qualificationCount: number): bigint {
  if (!Number.isInteger(qualificationCount) || qualificationCount < 0) {
    throw new RangeError('Aftermath reward qualification count must be a non-negative integer.');
  }
  const uncappedCents = BigInt(qualificationCount) * rewardPerQualificationCents;
  return uncappedCents > maximumRewardCents ? maximumRewardCents : uncappedCents;
}

export function parseAftermathRewardQualifications(value: Prisma.JsonValue): AftermathRewardQualification[] {
  const parsed = z.array(qualificationSchema).safeParse(value);
  if (!parsed.success) {
    throw new AppError(500, 'AFTERMATH_REWARD_INVALID', 'The saved aftermath reward claim has invalid qualification data.');
  }
  return parsed.data;
}

export const RoundAftermathRewardService = {
  async forNextRound(
    prisma: Prisma.TransactionClient,
    targetRound: Round,
    accountId: string,
  ): Promise<AftermathReward> {
    const previousRound = await prisma.round.findFirst({
      where: {
        id: { not: targetRound.id },
        status: { in: ['ENDED', 'ARCHIVED'] },
        endsAt: { lte: targetRound.startsAt },
      },
      orderBy: [{ endsAt: 'desc' }, { id: 'asc' }],
      select: {
        id: true,
        aftermathReport: { select: { status: true, playerAggregates: true } },
      },
    });
    if (!previousRound?.aftermathReport || previousRound.aftermathReport.status !== 'READY') {
      return { sourceRoundId: null, amountCents: 0n, qualifications: [] };
    }

    const qualifications = calculateAftermathReward(previousRound.aftermathReport.playerAggregates, accountId);
    return {
      sourceRoundId: previousRound.id,
      amountCents: calculateAftermathRewardAmountCents(qualifications.length),
      qualifications,
    };
  },
};
