import type { PrismaClient } from '@prisma/client';
import { env } from '../config/env.js';

/** Ranks for values already sorted high to low: ties share a rank and skip the tied positions. */
export function rankValues(sortedDesc: Array<number | bigint>): number[] {
  const ranks: number[] = [];
  sortedDesc.forEach((value, index) => {
    ranks.push(index > 0 && sortedDesc[index - 1] === value ? ranks[index - 1]! : index + 1);
  });
  return ranks;
}

/** Rankings-style ranks for rows already sorted by net worth, richest first. */
export function competitionRanks(sortedDesc: Array<{ netWorthCents: bigint }>): number[] {
  return rankValues(sortedDesc.map((row) => row.netWorthCents));
}

export function gameUrl(path: string): string {
  return new URL(path, env.frontendOrigin).toString();
}

export function playerUrl(publicPimpId: number): string {
  return gameUrl(`/game/players/${publicPimpId}`);
}

/** Active players of a round, richest first, with tie-aware ranks. */
export async function roundStandings(prisma: Pick<PrismaClient, 'roundPlayer'>, roundId: string) {
  const players = await prisma.roundPlayer.findMany({
    where: { roundId, account: { isActive: true } },
    orderBy: [{ netWorthCents: 'desc' }, { publicPimpId: 'asc' }],
    select: { accountId: true, publicPimpId: true, displayName: true, netWorthCents: true, city: { select: { name: true } } },
  });
  const ranks = competitionRanks(players);
  return { players, ranks, rankByAccount: new Map(players.map((player, index) => [player.accountId, ranks[index]!])) };
}
