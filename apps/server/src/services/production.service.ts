import type { PrismaClient } from '@prisma/client';
import { PRODUCE_JOB, calculateProduce, districtCapacities, type Rng } from '@streets/rules-engine';
import type { GameActionResult, ProduceCrackResult, ProductTypeDto } from '@streets/shared';
import { AppError } from '../utils/errors.js';
import { ActionService, assertTurns, fitThugs } from './action.service.js';
import { hideoutBackOfficeBonusCents, hideoutWorkshopBonusCrack } from './hideout.service.js';
import { toPlanDto, WorkSupplyService } from './work-supply.service.js';

export interface ProduceInput {
  turns: number;
  productType?: ProductTypeDto;
  actionId?: string;
}

const PRODUCT_NAMES: Record<ProductTypeDto, string> = {
  WEED: 'Weed',
  COKE: 'Coke',
  DOWNERS: 'Downers',
  ECSTASY: 'Ecstasy',
  HEROIN: 'Heroin',
  ACID: 'Acid',
};

export const ProductionService = {
  /**
   * Section 29. Turns and money in, product out.
   *
   * Nobody earns anything producing and there is no take to pay the crew back
   * with. The reason to do it is the price:
   * ingredients cost a tenth of what Pip's charges for a finished unit.
   */
  produceCrack(
    prisma: PrismaClient,
    roundPlayerId: string,
    input: ProduceInput,
    rng?: Rng,
  ): Promise<GameActionResult<ProduceCrackResult>> {
    const productType = input.productType ?? 'WEED';
    const productName = PRODUCT_NAMES[productType] ?? 'Product';

    return ActionService.run<ProduceCrackResult>(prisma, roundPlayerId, {
      action: 'PRODUCE_CRACK',
      actionId: input.actionId,

      execute: async ({ tx, current, whoreHappiness, thugHappiness, player, ruleset, round, now }) => {
        if (input.turns < ruleset.production.minTurns) {
          throw AppError.badRequest(
            'TURNS_TOO_LOW',
            `Production costs at least ${ruleset.production.minTurns} turn.`,
            { turns: 'Spend at least one turn.' },
          );
        }

        const active = { ...current, thugs: fitThugs(current) };
        if (active.thugs <= 0) {
          throw AppError.badRequest(
            'NO_THUGS',
            'You need at least one fit thug to produce.',
          );
        }

        const perRock = ruleset.production.crack.ingredientCentsPerRock;
        if (current.cashCents < BigInt(perRock)) {
          throw AppError.badRequest(
            'NO_INGREDIENT_MONEY',
            `Ingredients cost $${(perRock / 100).toFixed(2)} per product unit and you cannot cover one.`,
          );
        }

        assertTurns(current.turns, input.turns);

        // The girls work their usual block while the thugs produce. Which block
        // that is stays hidden, so its capacity is looked up rather than
        // chosen.
        const capacities = districtCapacities(round.id, now, ruleset);

        // 0.4.0-B: the girls' shift burns products by the PRODUCE policy. Consumption is
        // planned from stock before this batch is cooked, as crack always was.
        const supply = ruleset.workSupply
          ? await WorkSupplyService.plan(tx, roundPlayerId, ruleset, { job: PRODUCE_JOB, whores: active.whores, turns: input.turns, crack: current.crack })
          : undefined;
        if (supply) await WorkSupplyService.consume(tx, roundPlayerId, ruleset, supply);

        const outcome = calculateProduce({
          supply,
          player: { ...active, whoreHappiness, thugHappiness },
          turns: input.turns,
          ruleset,
          city: player.city,
          clientCapacity: capacities[ruleset.scouting.produceDistrict],
          cashCents: current.cashCents,
          payoutPercent: current.payoutPercent,
          rng,
        });
        const hideoutBonusCents = hideoutBackOfficeBonusCents(outcome.pimpTakeCents, ruleset, current);
        const pimpTakeCents = outcome.pimpTakeCents + hideoutBonusCents;
        const hideoutBonusCrack = hideoutWorkshopBonusCrack(outcome.crackProduced, ruleset, current);
        const crackProduced = outcome.crackProduced + hideoutBonusCrack;

        const next = {
          ...current,
          turns: current.turns - input.turns,

          // Manual 3.2 sends the girls out too, so production counts toward the
          // clerk's favour on the same terms as a trip.
          cleanShiftStreak:
            outcome.shortages.condoms > 0 ? 0 : current.cleanShiftStreak + 1,

          // Manual 3.2: they still work, just for less.
          cashCents:
            current.cashCents - outcome.ingredientCents + pimpTakeCents,

          whores: Math.max(
            0,
            current.whores - outcome.departures.whores - outcome.infections.lost,
          ),
          thugs: Math.max(0, current.thugs - outcome.departures.thugs),

          crack:
            current.crack +
            crackProduced -
            outcome.consumption.crack +
            outcome.crackFound,
          condoms: current.condoms - outcome.consumption.condoms,
          medicine: current.medicine - outcome.infections.medicineUsed,
          beer: current.beer - outcome.consumption.beer,

        };

        const result: ProduceCrackResult = {
          ...(supply ? { supply: toPlanDto(supply, ruleset) } : {}),
          productType,
          productName,
          productProduced: crackProduced,
          hideoutBonusProduct: hideoutBonusCrack,
          crackProduced,
          hideoutBonusCrack,
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
          cashEarnedCents: Number(pimpTakeCents),
          hideoutBonusCents: Number(hideoutBonusCents),
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
              productType,
              productName,
              product: crackProduced,
              crack: crackProduced,
              hideoutBonusCrack,
              ingredientCents: Number(outcome.ingredientCents),
              cashCents: Number(pimpTakeCents),
              hideoutBonusCents: Number(hideoutBonusCents),
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
