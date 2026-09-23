import type { PrismaClient } from '@prisma/client';
import type { Ruleset } from '@streets/rulesets';
import type { Db } from '../utils/db.js';
import { AppError } from '../utils/errors.js';

type FavorDb = Db | PrismaClient;

/**
 * Runtime kill switches for ruleset-defined favors. No row means enabled so
 * existing pinned rounds behave exactly as authored until an admin disables one.
 */
export const FavorContentService = {
  async isEnabled(db: FavorDb, ruleset: Ruleset, key: string): Promise<boolean> {
    const row = await db.favorContentSetting.findUnique({
      where: {
        rulesetId_rulesetVersion_key: {
          rulesetId: ruleset.meta.id,
          rulesetVersion: ruleset.meta.version,
          key,
        },
      },
      select: { isEnabled: true },
    });
    return row?.isEnabled ?? true;
  },

  async disabledKeys(db: FavorDb, ruleset: Ruleset): Promise<Set<string>> {
    const rows = await db.favorContentSetting.findMany({
      where: {
        rulesetId: ruleset.meta.id,
        rulesetVersion: ruleset.meta.version,
        isEnabled: false,
      },
      select: { key: true },
    });
    return new Set(rows.map((row) => row.key));
  },

  async assertEnabled(db: FavorDb, ruleset: Ruleset, key: string): Promise<void> {
    if (!await this.isEnabled(db, ruleset, key)) {
      throw AppError.conflict('FAVOR_DISABLED', 'That favor is temporarily disabled by an administrator.');
    }
  },
};
