import type { PrismaClient } from '@prisma/client';
import type { FavorDefinition, SingleUseFavorEffect, Ruleset } from '@streets/rulesets';
import type { FavorArmInput, FavorArmResult, GameActionResult, QuestArmedFavorDto } from '@streets/shared';
import type { Db } from '../utils/db.js';
import { AppError } from '../utils/errors.js';
import { ActionService } from './action.service.js';
import { FavorInventoryService } from './favor-inventory.service.js';
import { FavorContentService } from './favor-content.service.js';

function isSingleUseEffect(effect: FavorDefinition['effect']): effect is SingleUseFavorEffect {
  return effect?.kind === 'STORE_BUY_DISCOUNT'
    || effect?.kind === 'FREE_RECON'
    || effect?.kind === 'FREE_TREATMENT';
}

function isSingleUse(definition: FavorDefinition): definition is FavorDefinition & {
  activation: { kind: 'SINGLE_USE'; category: 'STREET' | 'UNDERWORLD' | 'MUSCLE' };
  effect: SingleUseFavorEffect;
} {
  return definition.activation.kind === 'SINGLE_USE' && isSingleUseEffect(definition.effect);
}

export const SingleUseFavorService = {
  async listArmed(
    db: Db | PrismaClient,
    roundPlayerId: string,
    ruleset: Ruleset,
  ): Promise<QuestArmedFavorDto[]> {
    const rows = await db.playerArmedFavor.findMany({
      where: { roundPlayerId },
      orderBy: [{ armedAt: 'asc' }, { category: 'asc' }],
    });
    return rows.flatMap((row) => {
      const definition = ruleset.favors?.[row.favorKey];
      if (!definition || !isSingleUse(definition)) return [];
      return [{
        key: row.favorKey,
        name: definition.name,
        description: definition.description,
        category: definition.activation.category,
        armedAt: row.armedAt.toISOString(),
      }];
    });
  },

  arm(
    prisma: PrismaClient,
    roundPlayerId: string,
    key: string,
    input: FavorArmInput,
  ): Promise<GameActionResult<FavorArmResult>> {
    return ActionService.run<FavorArmResult>(prisma, roundPlayerId, {
      action: 'FAVOR_ARM',
      actionId: input.actionId,
      execute: async ({ tx, current, ruleset, now }) => {
        const definition = FavorInventoryService.definition(ruleset, key);
        await FavorContentService.assertEnabled(tx, ruleset, key);
        if (!isSingleUse(definition)) {
          throw AppError.conflict('FAVOR_NOT_SINGLE_USE', 'That favor is not a single-use favor.');
        }

        const inventory = await tx.playerFavor.findUnique({
          where: { roundPlayerId_key: { roundPlayerId, key } },
          select: { quantity: true },
        });
        if (!inventory || inventory.quantity <= 0) {
          throw AppError.conflict('FAVOR_NOT_OWNED', 'You do not have that favor in your inventory.');
        }

        const existing = await tx.playerArmedFavor.findUnique({
          where: { roundPlayerId_category: { roundPlayerId, category: definition.activation.category } },
        });
        if (existing) {
          const activeName = ruleset.favors?.[existing.favorKey]?.name ?? 'Another favor';
          throw AppError.conflict(
            'FAVOR_CATEGORY_ARMED',
            `${activeName} is already armed in ${definition.activation.category}. Disarm it first.`,
          );
        }

        await tx.playerFavor.update({
          where: { roundPlayerId_key: { roundPlayerId, key } },
          data: { quantity: { decrement: 1 } },
        });
        await tx.playerArmedFavor.create({
          data: {
            roundPlayerId,
            category: definition.activation.category,
            favorKey: key,
            armedAt: now,
          },
        });

        return {
          next: current,
          result: {
            favorKey: key,
            name: definition.name,
            category: definition.activation.category,
            armed: true,
            quantityRemaining: inventory.quantity - 1,
          },
          activity: {
            type: 'FAVOR_ARMED',
            payload: {
              favorKey: key,
              name: definition.name,
              category: definition.activation.category,
            },
          },
        };
      },
    });
  },

  disarm(
    prisma: PrismaClient,
    roundPlayerId: string,
    key: string,
    input: FavorArmInput,
  ): Promise<GameActionResult<FavorArmResult>> {
    return ActionService.run<FavorArmResult>(prisma, roundPlayerId, {
      action: 'FAVOR_DISARM',
      actionId: input.actionId,
      execute: async ({ tx, current, ruleset }) => {
        const definition = FavorInventoryService.definition(ruleset, key);
        if (!isSingleUse(definition)) {
          throw AppError.conflict('FAVOR_NOT_SINGLE_USE', 'That favor is not a single-use favor.');
        }

        const armed = await tx.playerArmedFavor.findFirst({
          where: { roundPlayerId, favorKey: key },
        });
        if (!armed) throw AppError.conflict('FAVOR_NOT_ARMED', 'That favor is not armed.');

        await tx.playerArmedFavor.delete({ where: { id: armed.id } });
        const inventory = await tx.playerFavor.update({
          where: { roundPlayerId_key: { roundPlayerId, key } },
          data: { quantity: { increment: 1 } },
          select: { quantity: true },
        });

        return {
          next: current,
          result: {
            favorKey: key,
            name: definition.name,
            category: definition.activation.category,
            armed: false,
            quantityRemaining: inventory.quantity,
          },
          activity: {
            type: 'FAVOR_DISARMED',
            payload: {
              favorKey: key,
              name: definition.name,
              category: definition.activation.category,
            },
          },
        };
      },
    });
  },

  async matching(
    db: Db | PrismaClient,
    roundPlayerId: string,
    ruleset: Ruleset,
    kind: SingleUseFavorEffect['kind'],
  ): Promise<{
    id: string;
    key: string;
    definition: FavorDefinition;
    effect: SingleUseFavorEffect;
  } | null> {
    const [rows, disabled] = await Promise.all([
      db.playerArmedFavor.findMany({ where: { roundPlayerId } }),
      FavorContentService.disabledKeys(db, ruleset),
    ]);
    for (const row of rows) {
      if (disabled.has(row.favorKey)) continue;
      const definition = ruleset.favors?.[row.favorKey];
      if (!definition || !isSingleUse(definition) || definition.effect.kind !== kind) continue;
      return { id: row.id, key: row.favorKey, definition, effect: definition.effect };
    }
    return null;
  },

  async consume(db: Db, armedId: string): Promise<void> {
    await db.playerArmedFavor.delete({ where: { id: armedId } });
  },
};
