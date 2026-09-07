import type { Ruleset } from '@streets/rules-engine';
import type { Db } from '../utils/db.js';

export interface Ranks {
  localRank: number;
  nationalRank: number;
}

/**
 * The most recent daily reset at or before `now`. Section 18.
 */
export function dailyBoundary(now: Date, ruleset: Ruleset): Date {
  const boundary = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      ruleset.rankings.dailyResetHourUtc,
      0,
      0,
      0,
    ),
  );

  // Before today's reset hour, the current day started at yesterday's.
  if (boundary.getTime() > now.getTime()) {
    boundary.setUTCDate(boundary.getUTCDate() - 1);
  }

  return boundary;
}

/**
 * Section 17. Ranks are queried live in 0.1.0 - correctness first, caching
 * later. Every read goes through here so caching is a one file change.
 *
 * Ties share a rank: two players on the same net worth are both #7, and the
 * next player down is #9.
 */
export const RankingService = {
  async nationalRank(db: Db, roundId: string, netWorthCents: bigint): Promise<number> {
    const ahead = await db.roundPlayer.count({
      where: { roundId, netWorthCents: { gt: netWorthCents } },
    });
    return ahead + 1;
  },

  async localRank(
    db: Db,
    roundId: string,
    cityId: string,
    netWorthCents: bigint,
  ): Promise<number> {
    const ahead = await db.roundPlayer.count({
      where: { roundId, cityId, netWorthCents: { gt: netWorthCents } },
    });
    return ahead + 1;
  },

  async ranksFor(
    db: Db,
    player: { roundId: string; cityId: string; netWorthCents: bigint },
  ): Promise<Ranks> {
    const [localRank, nationalRank] = await Promise.all([
      RankingService.localRank(db, player.roundId, player.cityId, player.netWorthCents),
      RankingService.nationalRank(db, player.roundId, player.netWorthCents),
    ]);
    return { localRank, nationalRank };
  },

  /**
   * Section 18. The opening ranks a day's movement is measured against.
   *
   * The snapshot is taken lazily, the first time the player is seen after a
   * reset - so it records where they stood when they came back, which is the
   * closest honest answer without a nightly job over every player.
   */
  isDailySnapshotStale(
    player: { dailyRankSnapshotAt: Date | null },
    now: Date,
    ruleset: Ruleset,
  ): boolean {
    if (!player.dailyRankSnapshotAt) return true;
    return player.dailyRankSnapshotAt.getTime() < dailyBoundary(now, ruleset).getTime();
  },
};
