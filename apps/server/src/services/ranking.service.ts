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
  async nationalRank(
    db: Db,
    roundId: string,
    netWorthCents: bigint,
    excludePlayerId?: string,
  ): Promise<number> {
    const ahead = await db.roundPlayer.count({
      where: {
        roundId,
        netWorthCents: { gt: netWorthCents },
        ...(excludePlayerId ? { id: { not: excludePlayerId } } : {}),
      },
    });
    return ahead + 1;
  },

  async localRank(
    db: Db,
    roundId: string,
    cityId: string,
    netWorthCents: bigint,
    excludePlayerId?: string,
  ): Promise<number> {
    const ahead = await db.roundPlayer.count({
      where: {
        roundId,
        cityId,
        netWorthCents: { gt: netWorthCents },
        ...(excludePlayerId ? { id: { not: excludePlayerId } } : {}),
      },
    });
    return ahead + 1;
  },

  /**
   * Ranks for a net worth the caller has just computed but not yet written.
   *
   * `id` must be passed whenever the player already has a row, because that
   * row still holds their PREVIOUS net worth. Without it, an action that
   * lowers net worth - buying condoms is the classic, $1 of cash for $0.10 of
   * net worth - counts the player's own stale row as somebody ahead of them,
   * and the receipt reports a rank drop that never happened.
   */
  async ranksFor(
    db: Db,
    player: { id?: string; roundId: string; cityId: string; netWorthCents: bigint },
  ): Promise<Ranks> {
    const [localRank, nationalRank] = await Promise.all([
      RankingService.localRank(
        db,
        player.roundId,
        player.cityId,
        player.netWorthCents,
        player.id,
      ),
      RankingService.nationalRank(db, player.roundId, player.netWorthCents, player.id),
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
