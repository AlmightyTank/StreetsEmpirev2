import type { PrismaClient } from '@prisma/client';
import { calculateProduce, clampFatigue, type Rng } from '@streets/rules-engine';
import type { GameActionResult, ProduceCrackResult } from '@streets/shared';
import { AppError } from '../utils/errors.js';
import { ActionService, assertTurns } from './action.service.js';

export interface ProduceInput {
  turns: number;
  actionId?: string;
}

export const ProductionService = {
  /**
   * Section 29. Turns and money in, crack out.
   *
   * Nobody earns anything cooking and there is no take to pay the crew back
   * with, so every point of wear sticks. The reason to do it is the price:
   * ingredients cost a tenth of what Pip's charges for a finished rock.
   */
  produceCrack(
    prisma: PrismaClient,
    roundPlayerId: string,
    input: ProduceInput,
    rng?: Rng,
  ): Promise<GameActionResult<ProduceCrackResult>> {
    return ActionService.run<ProduceCrackResult>(prisma, roundPlayerId, {
      action: 'PRODUCE_CRACK',
      actionId: input.actionId,

      execute: ({ current, whoreHappiness, thugHappiness, player, ruleset }) => {
        if (input.turns < ruleset.production.minTurns) {
          throw AppError.badRequest(
            'TURNS_TOO_LOW',
            `Cooking costs at least ${ruleset.production.minTurns} turn.`,
            { turns: 'Spend at least one turn.' },
          );
        }

        if (current.thugs <= 0) {
          throw AppError.badRequest(
            'NO_THUGS',
            'You need at least one thug to cook. Scout for them, or pick some up at Tek9 Tommy’s.',
          );
        }

        const perRock = ruleset.production.crack.ingredientCentsPerRock;
        if (current.cashCents < BigInt(perRock)) {
          throw AppError.badRequest(
            'NO_INGREDIENT_MONEY',
            `Ingredients cost $${(perRock / 100).toFixed(2)} a rock and you cannot cover one.`,
          );
        }

        assertTurns(current.turns, input.turns);

        const outcome = calculateProduce({
          player: { ...current, whoreHappiness, thugHappiness },
          turns: input.turns,
          ruleset,
          city: player.city,
          cashCents: current.cashCents,
          rng,
        });

        const next = {
          ...current,
          turns: current.turns - input.turns,
          cashCents: current.cashCents - outcome.ingredientCents,

          whores: Math.max(0, current.whores - outcome.departures.whores),
          thugs: Math.max(0, current.thugs - outcome.departures.thugs),

          crack: current.crack + outcome.crackProduced,
          beer: current.beer - outcome.consumption.beer,

          thugFatigue: clampFatigue(current.thugFatigue + outcome.thugFatigue, ruleset),
        };

        const result: ProduceCrackResult = {
          crackProduced: outcome.crackProduced,
          ingredientCents: Number(outcome.ingredientCents),
          limitedByCash: outcome.limitedByCash,

          beerUsed: outcome.consumption.beer,
          whoresLeft: outcome.departures.whores,
          thugsLeft: outcome.departures.thugs,

          thugFatigueChange: outcome.thugFatigue,

          turnsUsed: input.turns,
          turnsRemaining: next.turns,
        };

        return {
          next,
          result,
          activity: {
            type: 'PRODUCE_CRACK',
            payload: {
              turns: input.turns,
              crack: outcome.crackProduced,
              ingredientCents: Number(outcome.ingredientCents),
              thugFatigueChange: outcome.thugFatigue,
            },
          },
        };
      },
    });
  },
};
