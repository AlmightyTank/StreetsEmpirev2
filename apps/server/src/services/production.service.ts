import type { PrismaClient } from '@prisma/client';
import { COOK_JOB, PRODUCE_JOB, calculateProduce, cityModifiers, districtCapacities, productRecipes, type Rng } from '@streets/rules-engine';
import type { GameActionResult, ProduceCrackResult, ProductTypeDto } from '@streets/shared';
import { AppError } from '../utils/errors.js';
import { ActionService, assertTurns, fitThugs } from './action.service.js';
import { HeatService } from './heat.service.js';
import { hideoutBackOfficeBonusCents, hideoutWorkshopBonusProduct } from './hideout.service.js';
import { CRACK, ProductInventoryService, streetProductFinds, summarizeProductMovements } from './product-inventory.service.js';
import { toPlanDto, WorkSupplyService } from './work-supply.service.js';

export interface ProduceInput {
  turns: number;
  productType?: ProductTypeDto;
  actionId?: string;
}

/** Names the old placeholder batches showed. Before 0.4.0-D every one of them cooked crack. */
const LEGACY_PRODUCT_NAMES: Record<string, string> = {
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
    const requested = (input.productType ?? CRACK).toUpperCase();

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

        // 0.4.0-D: a product round cooks what was asked for, from its recipes. Older rounds
        // cook crack whatever the batch was called, as they always have.
        const recipes = productRecipes(ruleset);
        const recipe = ruleset.productEconomy ? recipes.find((candidate) => candidate.product === requested) : recipes[0]!;
        if (!recipe) {
          throw AppError.badRequest('UNKNOWN_RECIPE', 'Your crew cannot cook that.', { productType: `Pick one of: ${recipes.map((row) => row.name).join(', ')}.` });
        }
        const productType = ruleset.productEconomy ? recipe.product : requested;
        const productName = ruleset.productEconomy ? recipe.name : LEGACY_PRODUCT_NAMES[requested] ?? 'Product';

        const perRock = recipe.ingredientCentsPerUnit;
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
          ? await WorkSupplyService.plan(tx, roundPlayerId, ruleset, { job: PRODUCE_JOB, workers: active.whores, turns: input.turns, crack: current.crack })
          : undefined;
        if (supply) await WorkSupplyService.consume(tx, roundPlayerId, ruleset, supply);

        // 0.4.0-C: the cooks burn product of their own, from whatever the girls' shift left.
        const cook = ruleset.workSupply?.productPerThugPerTurn
          ? await WorkSupplyService.plan(tx, roundPlayerId, ruleset, { job: COOK_JOB, role: 'thugs', workers: active.thugs, turns: input.turns, crack: current.crack - (supply?.consumed.CRACK ?? 0) })
          : undefined;
        if (cook) await WorkSupplyService.consume(tx, roundPlayerId, ruleset, cook);

        const outcome = calculateProduce({
          supply,
          cook,
          heat: current.heat,
          player: { ...active, whoreHappiness, thugHappiness },
          recipe,
          turns: input.turns,
          ruleset,
          city: cityModifiers(ruleset, player.city.slug),
          clientCapacity: capacities[ruleset.scouting.produceDistrict],
          cashCents: current.cashCents,
          payoutPercent: current.payoutPercent,
          rng,
        });
        const productsFound = streetProductFinds(
          ruleset,
          player.city.slug,
          outcome.crackFound,
          rng ?? Math.random,
        );
        const crackFound = productsFound.find((row) => row.key === CRACK)?.quantity ?? 0;
        const otherFound = Object.fromEntries(
          productsFound.filter((row) => row.key !== CRACK).map((row) => [row.key, row.quantity]),
        );

        const hideoutBonusCents = hideoutBackOfficeBonusCents(outcome.pimpTakeCents, ruleset, current);
        const pimpTakeCents = outcome.pimpTakeCents + hideoutBonusCents;
        const hideoutBonusProduct = hideoutWorkshopBonusProduct(outcome.crackProduced, ruleset, current);
        const productProduced = outcome.crackProduced + hideoutBonusProduct;
        const cookingCrack = recipe.product === CRACK;
        const crackProduced = cookingCrack ? productProduced : 0;
        const hideoutBonusCrack = cookingCrack ? hideoutBonusProduct : 0;
        if (!cookingCrack && productProduced > 0) {
          await ProductInventoryService.adjust(tx, roundPlayerId, ruleset, { [recipe.product]: productProduced });
        }
        if (Object.keys(otherFound).length) {
          await ProductInventoryService.adjust(tx, roundPlayerId, ruleset, otherFound);
        }

        const worked = {
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
            outcome.consumption.crack -
            (cook?.consumed.CRACK ?? 0) +
            crackFound,
          condoms: current.condoms - outcome.consumption.condoms,
          medicine: current.medicine - outcome.infections.medicineUsed,
          beer: current.beer - outcome.consumption.beer,

        };

        // 0.4.0-C: the shift's Heat lands, and a hot crew can be busted.
        const trip = await HeatService.afterTrip(tx, roundPlayerId, ruleset, {
          startHeat: current.heat, plans: [supply, cook], next: worked, rng, now,
          // 0.4.0-D: some cooks draw attention of their own.
          extraHeat: productProduced * recipe.heatPerUnit,
        });
        const next = trip.next;

        const result: ProduceCrackResult = {
          ...(supply ? { supply: toPlanDto(supply, ruleset) } : {}),
          ...(cook ? { cook: toPlanDto(cook, ruleset) } : {}),
          ...(trip.heat ? { heat: trip.heat } : {}),
          productType,
          productName,
          productProduced,
          hideoutBonusProduct,
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

          crackFound,
          ...(ruleset.productEconomy ? { productsFound } : {}),
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
              product: productProduced,
              crack: crackProduced,
              hideoutBonusCrack,
              ingredientCents: Number(outcome.ingredientCents),
              cashCents: Number(pimpTakeCents),
              hideoutBonusCents: Number(hideoutBonusCents),
              crackFound,
              ...(ruleset.productEconomy ? {
                productsFound: productsFound.map((row) => ({ key: row.key, name: row.name, quantity: row.quantity })),
                productMovements: summarizeProductMovements(ruleset, {
                  found: productsFound,
                  produced: { key: recipe.product, quantity: productProduced },
                  consumed: [supply?.consumed, cook?.consumed],
                  seized: trip.heat?.seized,
                }),
              } : {}),
              whoresLeft: outcome.departures.whores,
              thugsLeft: outcome.departures.thugs,
              infected: outcome.infections.infected,
              lostToInfection: outcome.infections.lost,
              ...(trip.heat ? { heat: trip.heat.after, heatAdded: trip.heat.added, busted: trip.heat.busted, fineCents: trip.heat.fineCents } : {}),
            },
          },
        };
      },
    });
  },
};
