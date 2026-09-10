import type { PrismaClient } from '@prisma/client';
import { calculateProduce, districtCapacities, type Rng } from '@streets/rules-engine';
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
   * with. The reason to do it is the price:
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

      execute: ({ current, whoreHappiness, thugHappiness, player, ruleset, round, now }) => {
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

        // The girls work their usual block while the thugs cook. Which block
        // that is stays hidden, so its capacity is looked up rather than
        // chosen.
        const capacities = districtCapacities(round.id, now, ruleset);

        const outcome = calculateProduce({
          player: { ...current, whoreHappiness, thugHappiness },
          turns: input.turns,
          ruleset,
          city: player.city,
          clientCapacity: capacities[ruleset.scouting.produceDistrict],
          cashCents: current.cashCents,
          payoutPercent: current.payoutPercent,
          rng,
        });

        const next = {
          ...current,
          turns: current.turns - input.turns,

          // Manual 3.2 sends the girls out too, so a cook counts toward the
          // clerk's favour on the same terms as a trip.
          cleanShiftStreak:
            outcome.shortages.condoms > 0 ? 0 : current.cleanShiftStreak + 1,

          // Manual 3.2: they still work, just for less.
          cashCents:
            current.cashCents - outcome.ingredientCents + outcome.pimpTakeCents,

          whores: Math.max(
            0,
            current.whores - outcome.departures.whores - outcome.infections.lost,
          ),
          thugs: Math.max(0, current.thugs - outcome.departures.thugs),

          crack:
            current.crack +
            outcome.crackProduced -
            outcome.consumption.crack +
            outcome.crackFound,
          condoms: current.condoms - outcome.consumption.condoms,
          medicine: current.medicine - outcome.infections.medicineUsed,
          beer: current.beer - outcome.consumption.beer,

        };

        const result: ProduceCrackResult = {
          crackProduced: outcome.crackProduced,
          ingredientCents: Number(outcome.ingredientCents),
          limitedByCash: outcome.limitedByCash,

          beerUsed: outcome.consumption.beer,
          whoresLeft: outcome.departures.whores,
          thugsLeft: outcome.departures.thugs,

          infected: outcome.infections.infected,
          treated: outcome.infections.treated,
          medicineUsed: outcome.infections.medicineUsed,
          lostToInfection: outcome.infections.lost,

          grossEarnedCents: Number(outcome.grossCents),
          crewTakeCents: Number(outcome.crewTakeCents),
          cashEarnedCents: Number(outcome.pimpTakeCents),
          payoutPercent: current.payoutPercent,

          crackFound: outcome.crackFound,
          condomsUsed: outcome.consumption.condoms,
          crackUsed: outcome.consumption.crack,
          condomsMissing: outcome.shortages.condoms,
          beerMissing: outcome.shortages.beer,


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
              cashCents: Number(outcome.pimpTakeCents),
              crackFound: outcome.crackFound,
              whoresLeft: outcome.departures.whores,
              thugsLeft: outcome.departures.thugs,
              infected: outcome.infections.infected,
              lostToInfection: outcome.infections.lost,
            },
          },
        };
      },
    });
  },
};
