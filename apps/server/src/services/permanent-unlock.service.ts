import type { PrismaClient } from '@prisma/client';
import type { PermanentUnlockDefinition, Ruleset } from '@streets/rulesets';
import type { Db } from '../utils/db.js';
import { AppError } from '../utils/errors.js';

export const PermanentUnlockService = {
  async keys(db: Db | PrismaClient, roundPlayerId: string): Promise<Set<string>> {
    const rows = await db.playerUnlock.findMany({
      where: { roundPlayerId },
      select: { key: true },
    });
    return new Set(rows.map((row) => row.key));
  },

  definition(ruleset: Ruleset, key: string): PermanentUnlockDefinition {
    const definition = ruleset.permanentUnlocks?.[key];
    if (!definition) {
      throw AppError.conflict('QUEST_REWARD_INVALID', `Unknown permanent unlock: ${key}.`);
    }
    return definition;
  },

  async award(
    db: Db,
    roundPlayerId: string,
    ruleset: Ruleset,
    key: string,
    sourceQuestKey: string,
    awardedAt = new Date(),
  ): Promise<PermanentUnlockDefinition> {
    const definition = this.definition(ruleset, key);
    await db.playerUnlock.upsert({
      where: { roundPlayerId_key: { roundPlayerId, key } },
      create: { roundPlayerId, key, sourceQuestKey, awardedAt },
      update: {},
    });
    return definition;
  },

  productPurchaseUnlock(ruleset: Ruleset, productKey: string): PermanentUnlockDefinition | null {
    return Object.values(ruleset.permanentUnlocks ?? {}).find((definition) =>
      definition.effect.kind === 'PRODUCT_PURCHASE_ACCESS'
      && definition.effect.productKey === productKey
    ) ?? null;
  },

  /**
   * The products this player may not buy yet, with the unlock each needs. The same everywhere a
   * product can be bought: Pip at home, Pip in another city on a run, and the high markets.
   */
  async lockedProducts(db: Db | PrismaClient, roundPlayerId: string, ruleset: Ruleset): Promise<Map<string, PermanentUnlockDefinition>> {
    const locked = new Map<string, PermanentUnlockDefinition>();
    const gated = Object.values(ruleset.permanentUnlocks ?? {}).filter((definition) => definition.effect.kind === 'PRODUCT_PURCHASE_ACCESS');
    if (!gated.length) return locked;
    const keys = await PermanentUnlockService.keys(db, roundPlayerId);
    for (const definition of gated) {
      if (definition.effect.kind === 'PRODUCT_PURCHASE_ACCESS' && !keys.has(definition.key)) locked.set(definition.effect.productKey, definition);
    }
    return locked;
  },

  /** Refuse buying a product the player has not unlocked, wherever they are buying it. */
  async assertCanBuyProduct(db: Db | PrismaClient, roundPlayerId: string, ruleset: Ruleset, productKey: string): Promise<void> {
    const required = (await PermanentUnlockService.lockedProducts(db, roundPlayerId, ruleset)).get(productKey);
    if (required) throw AppError.conflict('PRODUCT_PURCHASE_LOCKED', `Complete the required job to unlock ${required.name}.`);
  },
};
