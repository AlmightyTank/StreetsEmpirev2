import type { PrismaClient } from '@prisma/client';
import {
  addHeat,
  bribeCentsPerPoint,
  bustChance,
  heatTakeMultiplier,
  resolveBust,
  tripHeat,
  type Rng,
  type Ruleset,
  type WorkSupplyPlan,
} from '@streets/rules-engine';
import { heatBribeSchema, type GameActionResult, type HeatDto, type TripHeatDto } from '@streets/shared';
import type { Db } from '../utils/db.js';
import { AppError } from '../utils/errors.js';
import { ActionService, type PlayerState } from './action.service.js';
import { NetWorthService } from './net-worth.service.js';
import { CRACK, ProductInventoryService } from './product-inventory.service.js';

export interface HeatBribeResult {
  points: number;
  costCents: number;
  heatBefore: number;
  heatAfter: number;
}

/** The Heat block the player sees, or null on rounds without Heat. */
export function toHeatDto(heat: number, netWorthCents: bigint, ruleset: Ruleset): HeatDto | null {
  const rules = ruleset.heat;
  if (!rules) return null;
  return {
    heat,
    max: rules.max,
    decayPerInterval: rules.decayPerInterval,
    intervalMinutes: ruleset.turns.intervalMinutes,
    dragStartsAt: rules.drag.startsAt,
    bustStartsAt: rules.bust.startsAt,
    takeMultiplier: heatTakeMultiplier(heat, ruleset),
    bustChance: bustChance(heat, ruleset),
    bust: { productSeizedFraction: rules.bust.productSeizedFraction, cashFineFraction: rules.bust.cashFineFraction, heatDrop: rules.bust.heatDrop },
    bribeCentsPerPoint: Number(bribeCentsPerPoint(netWorthCents, rules)),
  };
}

/**
 * 0.4.0-C. Heat after a trip, and bribes to bring it down.
 *
 * Heat itself decays in the action pipeline and in settling, on the turn clock.
 * This service only adds to it, rolls the bust, and takes it off for cash.
 */
export const HeatService = {
  /**
   * Called by Scout and Produce once the trip's own numbers are settled. The
   * bust is rolled at the Heat the trip started with, against what the trip
   * left the player holding; the trip's Heat lands either way.
   */
  async afterTrip(
    tx: Db,
    roundPlayerId: string,
    ruleset: Ruleset,
    input: { startHeat: number; plans: Array<WorkSupplyPlan | undefined>; next: PlayerState; rng?: Rng; extraHeat?: number },
  ): Promise<{ next: PlayerState; heat?: TripHeatDto }> {
    const rules = ruleset.heat;
    if (!rules) return { next: input.next };

    const added = Math.round(tripHeat(input.plans) + (input.extraHeat ?? 0));
    const inventory = await ProductInventoryService.read(tx, roundPlayerId, ruleset);
    const bust = resolveBust({
      heat: input.startHeat,
      cashCents: input.next.cashCents,
      products: { ...inventory, [CRACK]: input.next.crack },
      ruleset,
      rng: input.rng ?? Math.random,
    });

    let next = input.next;
    if (bust.busted) {
      const rows = Object.fromEntries(Object.entries(bust.seized).filter(([key]) => key !== CRACK).map(([key, units]) => [key, -units]));
      if (Object.keys(rows).length) await ProductInventoryService.adjust(tx, roundPlayerId, ruleset, rows);
      next = { ...next, crack: next.crack - (bust.seized[CRACK] ?? 0), cashCents: next.cashCents - bust.fineCents };
    }
    const after = addHeat(input.startHeat, added - (bust.busted ? rules.bust.heatDrop : 0), rules);
    next = { ...next, heat: after };

    return {
      next,
      heat: {
        before: input.startHeat,
        added,
        after,
        max: rules.max,
        takeMultiplier: heatTakeMultiplier(input.startHeat, ruleset),
        bustChance: bust.chance,
        busted: bust.busted,
        seized: bust.seized,
        fineCents: Number(bust.fineCents),
      },
    };
  },

  /** Pay the precinct to take `points` of Heat off. Priced on net worth as the bribe is made. */
  bribe(prisma: PrismaClient, roundPlayerId: string, rawInput: unknown): Promise<GameActionResult<HeatBribeResult>> {
    const input = heatBribeSchema.parse(rawInput);
    return ActionService.run<HeatBribeResult>(prisma, roundPlayerId, {
      action: 'HEAT_BRIBE',
      actionId: input.actionId,
      execute: async ({ tx, current, ruleset, player }) => {
        const rules = ruleset.heat;
        if (!rules) throw AppError.conflict('HEAT_DISABLED', 'There is no Heat in this round.');
        if (current.heat <= 0) throw AppError.badRequest('NO_HEAT', 'Nobody is looking at you right now.');
        if (input.points > current.heat) {
          throw AppError.badRequest('TOO_MANY_POINTS', `You only have ${current.heat} Heat to pay off.`, { points: `At most ${current.heat}.` });
        }
        const products = await ProductInventoryService.read(tx, player.id, ruleset);
        const costCents = bribeCentsPerPoint(NetWorthService.calculate({ ...current, products }, ruleset), rules) * BigInt(input.points);
        if (costCents > current.cashCents) {
          throw AppError.badRequest('NOT_ENOUGH_CASH', 'You cannot cover that bribe.', { points: 'Not enough cash.' });
        }
        const next = { ...current, cashCents: current.cashCents - costCents, heat: current.heat - input.points };
        const result = { points: input.points, costCents: Number(costCents), heatBefore: current.heat, heatAfter: next.heat };
        return { next, result, activity: { type: 'HEAT_BRIBE', payload: result } };
      },
    });
  },
};
