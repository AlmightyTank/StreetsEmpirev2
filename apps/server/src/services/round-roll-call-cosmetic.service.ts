import type { PrismaClient, Round } from '@prisma/client';
import { ROUND_ROLL_CALL_FINALE, ROUND_ROLL_CALL_FINALE_COSMETICS } from '@streets/rulesets';
import type { Db } from '../utils/db.js';
import { roundRollCallClock } from './round-roll-call.service.js';

const PAIR = [
  ROUND_ROLL_CALL_FINALE_COSMETICS[ROUND_ROLL_CALL_FINALE.themeKey],
  ROUND_ROLL_CALL_FINALE_COSMETICS[ROUND_ROLL_CALL_FINALE.crewKey],
] as const;
export const ROUND_ROLL_CALL_FINALE_KEYS = PAIR.map((definition) => definition.key);

/** Completion, not a paid pass, purchases or consecutive streaks, gates the set. */
export function rollCallFinaleEligible(requiredStamps: number, earnedStamps: number): boolean {
  return requiredStamps > 0 && earnedStamps >= requiredStamps;
}

export const RoundRollCallCosmeticService = {
  async ownership(db: Db | PrismaClient, accountId: string) {
    const rows = await db.accountCosmeticUnlock.findMany({
      where: { accountId, key: { in: [...ROUND_ROLL_CALL_FINALE_KEYS] } },
      select: { key: true },
    });
    const keys = new Set(rows.map((row) => row.key));
    return {
      unlocked: ROUND_ROLL_CALL_FINALE_KEYS.every((key) => keys.has(key)),
      themeOwned: keys.has(ROUND_ROLL_CALL_FINALE.themeKey),
      crewOwned: keys.has(ROUND_ROLL_CALL_FINALE.crewKey),
      themeStyle: ROUND_ROLL_CALL_FINALE.themeStyle,
      crewStyle: ROUND_ROLL_CALL_FINALE.crewStyle,
      name: ROUND_ROLL_CALL_FINALE.name,
    };
  },

  /**
   * Called *inside* a verified, player-locked or round-close transaction.
   * Never trust client progress. The raw server stamps and the round's fixed
   * full-length goal decide eligibility. Each permanent account unlock is
   * upserted under (accountId,key); both commit or roll back together.
   */
  async awardIfEligible(
    tx: Db,
    round: Round,
    roundPlayerId: string,
    accountId: string,
    at = new Date(),
  ): Promise<boolean> {
    // During an open pause the close-path must not accidentally shorten the
    // goal by counting pause time as an attendance opportunity.
    const clock = roundRollCallClock(round, round.pausedAt ?? at);
    if (clock.requiredStamps === 0) return false;
    const stamps = await tx.roundLoginCheckIn.count({ where: { roundPlayerId } });
    if (!rollCallFinaleEligible(clock.requiredStamps, stamps)) return false;

    for (const cosmetic of PAIR) {
      await tx.accountCosmeticUnlock.upsert({
        where: { accountId_key: { accountId, key: cosmetic.key } },
        create: {
          accountId,
          key: cosmetic.key,
          kind: cosmetic.kind,
          title: cosmetic.name,
          description: cosmetic.description,
          rarity: cosmetic.rarity,
          styleKey: cosmetic.styleKey,
          sourceQuestKey: `round-roll-call:${round.id}:finale`,
          sourceRulesetId: round.rulesetId,
          sourceRulesetVersion: round.rulesetVersion,
          awardedAt: at,
        },
        update: {},
      });
    }
    return true;
  },

  /**
   * Round close safety net. Qualifying players receive both permanent looks
   * even if they forgot to claim the final gameplay reward; no expired cash,
   * turns or supplies are paid. Scans qualifying stamps in batches to avoid
   * querying one profile per participant.
   */
  async grantCompletedAtClose(tx: Db, round: Round, at: Date): Promise<number> {
    const requiredStamps = roundRollCallClock(round, round.pausedAt ?? at).requiredStamps;
    if (requiredStamps === 0) return 0;
    const eligible = await tx.roundLoginCheckIn.groupBy({
      by: ['roundPlayerId'],
      where: { roundPlayer: { roundId: round.id } },
      _count: { _all: true },
      having: { roundPlayerId: { _count: { gte: requiredStamps } } },
    });
    if (eligible.length === 0) return 0;
    const players = await tx.roundPlayer.findMany({
      where: { roundId: round.id, id: { in: eligible.map((row) => row.roundPlayerId) } },
      select: { id: true, accountId: true },
    });
    let granted = 0;
    for (const player of players) {
      if (await this.awardIfEligible(tx, round, player.id, player.accountId, at)) granted++;
    }
    return granted;
  },
};
