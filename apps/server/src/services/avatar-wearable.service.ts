import { AVATAR_WEARABLE_SOURCE, AVATAR_WEARABLE_SOURCE_VERSION, avatarWearable, isAvatarSkylineKey, type AvatarWearableKey } from '@streets/rulesets';
import type { PrismaClient } from '@prisma/client';
import type { Db } from '../utils/db.js';

/**
 * Avatar wearables earned in play (docs/ROADMAP-AVATAR-COSMETICS.md). A grant
 * is an account-level AccountCosmeticUnlock, kept for good and never repeated,
 * so it is safe inside any action transaction that may replay.
 */
const TOP_TEN = 10;
const TOP_THREE = 3;

export const AvatarWearableService = {
  /** Unlock keys for every avatar wearable the account holds. */
  async ownedKeys(db: Db | PrismaClient, accountId: string): Promise<Set<string>> {
    const rows = await db.accountCosmeticUnlock.findMany({
      where: { accountId, kind: 'AVATAR_PART' },
      select: { key: true },
    });
    return new Set(rows.map((row) => row.key));
  },

  /** Grants a wearable once. Returns true when this call added it. */
  async grant(db: Db, accountId: string, key: AvatarWearableKey, sourceQuestKey: string, at: Date): Promise<boolean> {
    const wearable = avatarWearable(key);
    const existing = await db.accountCosmeticUnlock.findUnique({
      where: { accountId_key: { accountId, key } },
      select: { key: true },
    });
    if (existing) return false;
    await db.accountCosmeticUnlock.create({
      data: {
        accountId,
        key,
        kind: wearable.kind,
        title: wearable.name,
        description: wearable.description,
        rarity: wearable.rarity,
        styleKey: wearable.styleKey ?? null,
        sourceQuestKey,
        sourceRulesetId: AVATAR_WEARABLE_SOURCE,
        sourceRulesetVersion: AVATAR_WEARABLE_SOURCE_VERSION,
        awardedAt: at,
      },
    });
    return true;
  },

  /** The same grant for the account behind a round player. */
  async grantToRoundPlayer(db: Db, roundPlayerId: string, key: AvatarWearableKey, sourceQuestKey: string, at: Date): Promise<boolean> {
    const player = await db.roundPlayer.findUnique({ where: { id: roundPlayerId }, select: { accountId: true } });
    return player ? this.grant(db, player.accountId, key, sourceQuestKey, at) : false;
  },

  /**
   * Round close, after final standings freeze: the national top 10 gets the
   * laurel and the top 3 the diamond studs, and every crew holding turf gets
   * the skyline of each city it holds a block in. Kept for good; a later round
   * never grants the same piece twice. Returns how many it added.
   */
  async grantAtRoundClose(db: Db, roundId: string, at: Date): Promise<number> {
    const source = `ROUND_CLOSE:${roundId}`;
    let granted = 0;
    const placed = await db.roundPlayer.findMany({
      where: { roundId, nationalRank: { not: null, lte: TOP_TEN } },
      select: { accountId: true, nationalRank: true },
    });
    for (const player of placed) {
      if (await this.grant(db, player.accountId, 'avatar-top-ten-laurel', source, at)) granted++;
      if (player.nationalRank! <= TOP_THREE && await this.grant(db, player.accountId, 'avatar-top-three-diamonds', source, at)) granted++;
    }
    const turf = await db.turf.findMany({
      where: { roundId, holderId: { not: null } },
      select: { city: { select: { slug: true } }, holder: { select: { accountId: true } } },
    });
    const seen = new Set<string>();
    for (const block of turf) {
      const key = `avatar-skyline-${block.city.slug}`;
      if (!block.holder || !isAvatarSkylineKey(key) || seen.has(`${block.holder.accountId}:${key}`)) continue;
      seen.add(`${block.holder.accountId}:${key}`);
      if (await this.grant(db, block.holder.accountId, key, source, at)) granted++;
    }
    return granted;
  },
};
