import { AVATAR_WEARABLE_SOURCE, AVATAR_WEARABLE_SOURCE_VERSION, AVATAR_WEARABLES, type AvatarWearableKey } from '@streets/rulesets';
import type { PrismaClient } from '@prisma/client';
import type { Db } from '../utils/db.js';

/**
 * Avatar wearables earned in play (docs/ROADMAP-AVATAR-COSMETICS.md). A grant
 * is an account-level AccountCosmeticUnlock, kept for good and never repeated,
 * so it is safe inside any action transaction that may replay.
 */
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
    const wearable = AVATAR_WEARABLES[key];
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
        styleKey: wearable.styleKey,
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
};
