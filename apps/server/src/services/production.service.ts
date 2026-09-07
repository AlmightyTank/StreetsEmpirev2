import type { PrismaClient } from '@prisma/client';
import { calculateProduce, type Rng } from '@streets/rules-engine';
import type { GameActionResult, ProduceCrackResult } from '@streets/shared';
import { AppError } from '../utils/errors.js';
import { ActionService, assertTurns } from './action.service.js';

export interface ProduceInput {
  turns: number;
  actionId?: string;
}

export const ProductionService = {
  /**
   * Section 29. Put the crew to work cooking.
   *
   * The whores keep earning while this happens, and the same upkeep is paid,
   * so the choice against Scout is growth versus stock rather than work versus
   * rest.
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
            `Producing costs at least ${ruleset.production.minTurns} turn.`,
            { turns: 'Spend at least one turn.' },
          );
        }

        if (current.thugs <= 0) {
          throw AppError.badRequest(
            'NO_THUGS',
            'You need at least one thug to cook. Pick some up at Tek9 Tommy’s or scout for them.',
          );
        }

        assertTurns(current.turns, input.turns);

        const outcome = calculateProduce({
          player: { ...current, whoreHappiness, thugHappiness },
          turns: input.turns,
          ruleset,
          city: player.city,
          rng,
        });

        // Crack is produced and consumed in the same run; the batch lands
        // first so a player with an empty shelf can still supply the girls.
        const next = {
          ...current,
          turns: current.turns - input.turns,
          cashCents: current.cashCents + outcome.income.pimpCents,

          whores: Math.max(0, current.whores - outcome.departures.whores),
          thugs: Math.max(0, current.thugs - outcome.departures.thugs),

          condoms: current.condoms - outcome.consumption.condoms,
          crack: current.crack + outcome.crackProduced - outcome.consumption.crack,
          beer: current.beer - outcome.consumption.beer,
        };

        const result: ProduceCrackResult = {
          crackProduced: outcome.crackProduced,
          condomsUsed: outcome.consumption.condoms,
          crackUsed: outcome.consumption.crack,
          beerUsed: outcome.consumption.beer,
          whoresLeft: outcome.departures.whores,
          thugsLeft: outcome.departures.thugs,
          grossEarnedCents: Number(outcome.income.grossCents),
          cashEarnedCents: Number(outcome.income.pimpCents),
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
              cashCents: Number(outcome.income.pimpCents),
              whoresLeft: outcome.departures.whores,
              thugsLeft: outcome.departures.thugs,
            },
          },
        };
      },
    });
  },
};
