import type { PrismaClient } from '@prisma/client';
import type { FavorCategory, FavorDefinition, Ruleset } from '@streets/rulesets';
import type { FavorActivateInput, FavorActivationResult, GameActionResult, QuestActiveFavorDto } from '@streets/shared';
import type { Db } from '../utils/db.js';
import { AppError } from '../utils/errors.js';
import { ActionService } from './action.service.js';
import { FavorInventoryService } from './favor-inventory.service.js';

export interface TimedFavorBonuses {
  scoutIncomePercent: number;
  scoutRecruitmentPercent: number;
  productionOutputPercent: number;
  pipBuyDiscountPercent: number;
  treatmentMedicineEfficiencyPercent: number;
}

const EMPTY_BONUSES: TimedFavorBonuses = {
  scoutIncomePercent: 0,
  scoutRecruitmentPercent: 0,
  productionOutputPercent: 0,
  pipBuyDiscountPercent: 0,
  treatmentMedicineEfficiencyPercent: 0,
};

function timed(definition: FavorDefinition): definition is FavorDefinition & {
  activation: { kind: 'TIMED'; category: FavorCategory; durationMinutes: number };
} {
  return definition.activation.kind === 'TIMED';
}

export const TimedFavorService = {
  async listActive(
    db: Db | PrismaClient,
    roundPlayerId: string,
    ruleset: Ruleset,
    now = new Date(),
  ): Promise<QuestActiveFavorDto[]> {
    const rows = await db.playerActiveFavor.findMany({
      where: { roundPlayerId, expiresAt: { gt: now } },
      orderBy: [{ expiresAt: 'asc' }, { category: 'asc' }],
    });
    return rows.flatMap((row) => {
      const definition = ruleset.favors?.[row.favorKey];
      if (!definition || !timed(definition)) return [];
      return [{
        key: row.favorKey,
        name: definition.name,
        description: definition.description,
        category: definition.activation.category,
        startedAt: row.startedAt.toISOString(),
        expiresAt: row.expiresAt.toISOString(),
      }];
    });
  },

  async bonuses(
    db: Db | PrismaClient,
    roundPlayerId: string,
    ruleset: Ruleset,
    now = new Date(),
  ): Promise<TimedFavorBonuses> {
    const rows = await db.playerActiveFavor.findMany({
      where: { roundPlayerId, expiresAt: { gt: now } },
      select: { favorKey: true },
    });
    const out = { ...EMPTY_BONUSES };
    for (const row of rows) {
      const effect = ruleset.favors?.[row.favorKey]?.effect;
      if (!effect) continue;
      switch (effect.kind) {
        case 'SCOUT_BOOST':
          out.scoutIncomePercent = Math.max(out.scoutIncomePercent, effect.incomePercent);
          out.scoutRecruitmentPercent = Math.max(out.scoutRecruitmentPercent, effect.recruitmentPercent);
          break;
        case 'PRODUCTION_BOOST':
          out.productionOutputPercent = Math.max(out.productionOutputPercent, effect.outputPercent);
          break;
        case 'PIP_BUY_DISCOUNT':
          out.pipBuyDiscountPercent = Math.max(out.pipBuyDiscountPercent, effect.discountPercent);
          break;
        case 'TREATMENT_EFFICIENCY':
          out.treatmentMedicineEfficiencyPercent = Math.max(
            out.treatmentMedicineEfficiencyPercent,
            effect.medicineEfficiencyPercent,
          );
          break;
      }
    }
    return out;
  },

  activate(
    prisma: PrismaClient,
    roundPlayerId: string,
    key: string,
    input: FavorActivateInput,
  ): Promise<GameActionResult<FavorActivationResult>> {
    return ActionService.run<FavorActivationResult>(prisma, roundPlayerId, {
      action: 'FAVOR_ACTIVATE',
      actionId: input.actionId,
      execute: async ({ tx, current, ruleset, now }) => {
        const definition = FavorInventoryService.definition(ruleset, key);
        if (!timed(definition) || !definition.effect) {
          throw AppError.conflict('FAVOR_NOT_TIMED', 'That favor is not a timed favor.');
        }

        const inventory = await tx.playerFavor.findUnique({
          where: { roundPlayerId_key: { roundPlayerId, key } },
          select: { quantity: true },
        });
        if (!inventory || inventory.quantity <= 0) {
          throw AppError.conflict('FAVOR_NOT_OWNED', 'You do not have that favor in your inventory.');
        }

        const category = definition.activation.category;
        const existing = await tx.playerActiveFavor.findUnique({
          where: { roundPlayerId_category: { roundPlayerId, category } },
        });
        if (existing && existing.expiresAt.getTime() > now.getTime()) {
          const minutes = Math.max(1, Math.ceil((existing.expiresAt.getTime() - now.getTime()) / 60_000));
          const activeName = ruleset.favors?.[existing.favorKey]?.name ?? 'Another favor';
          throw AppError.conflict(
            'FAVOR_CATEGORY_ACTIVE',
            `${activeName} is already active in ${category}. It has about ${minutes} minute${minutes === 1 ? '' : 's'} left.`,
          );
        }

        const expiresAt = new Date(now.getTime() + definition.activation.durationMinutes * 60_000);
        await tx.playerFavor.update({
          where: { roundPlayerId_key: { roundPlayerId, key } },
          data: { quantity: { decrement: 1 } },
        });
        await tx.playerActiveFavor.upsert({
          where: { roundPlayerId_category: { roundPlayerId, category } },
          create: { roundPlayerId, category, favorKey: key, startedAt: now, expiresAt },
          update: { favorKey: key, startedAt: now, expiresAt },
        });

        const result: FavorActivationResult = {
          favorKey: key,
          name: definition.name,
          category,
          startedAt: now.toISOString(),
          expiresAt: expiresAt.toISOString(),
          quantityRemaining: inventory.quantity - 1,
        };

        return {
          next: current,
          result,
          activity: {
            type: 'FAVOR_ACTIVATED',
            payload: {
              favorKey: key,
              name: definition.name,
              category,
              startedAt: result.startedAt,
              expiresAt: result.expiresAt,
            },
          },
        };
      },
    });
  },
};
