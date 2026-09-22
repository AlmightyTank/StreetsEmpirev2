import type { PermanentUnlockDefinition, Ruleset } from '@streets/rulesets';
import type { Db } from '../utils/db.js';
import { AppError } from '../utils/errors.js';

export const PermanentUnlockService = {
  async keys(db: Db, roundPlayerId: string): Promise<Set<string>> {
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
};
