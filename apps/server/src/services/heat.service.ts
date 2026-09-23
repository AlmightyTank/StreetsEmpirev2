import type { PrismaClient } from '@prisma/client';
import {
  addHeat,
  arrestChance,
  bribeCentsPerPoint,
  bustChance,
  heatTakeMultiplier,
  resolveArrest,
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
import { SingleUseFavorService } from './single-use-favor.service.js';

export interface HeatBribeResult {
  points: number;
  costCents: number;
  heatBefore: number;
  heatAfter: number;
  favorKey?: string;
}

/** The Heat block the player sees, or null on rounds without Heat. The ruleset is the player's own city's. */
export function toHeatDto(heat: number, netWorthCents: bigint, ruleset: Ruleset, lockedUntil: Date | null = null, now: Date = new Date()): HeatDto | null {
  const rules = ruleset.heat;
  if (!rules) return null;
  const arrest = rules.arrest;
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
    arrest: arrest
      ? {
          startsAt: arrest.startsAt,
          chance: arrestChance(heat, ruleset),
          productSeizedFraction: arrest.productSeizedFraction,
          cashFineFraction: arrest.cashFineFraction,
          heatDrop: arrest.heatDrop,
          downtimeMinutes: arrest.downtimeMinutes,
        }
      : null,
    lockedUntil: lockedUntil && lockedUntil.getTime() > now.getTime() ? lockedUntil.toISOString() : null,
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
   * Called by Scout and Produce once the trip's own numbers are settled. An
   * arrest (0.5.0-C) and then a bust are rolled at the Heat the trip started
   * with, against what the trip left the player holding; the trip's Heat lands
   * either way. An arrest takes the bust's place, and locks the player up.
   */
  async afterTrip(
    tx: Db,
    roundPlayerId: string,
    ruleset: Ruleset,
    input: { startHeat: number; plans: Array<WorkSupplyPlan | undefined>; next: PlayerState; rng?: Rng; extraHeat?: number; now?: Date },
  ): Promise<{ next: PlayerState; heat?: TripHeatDto }> {
    const rules = ruleset.heat;
    if (!rules) return { next: input.next };

    const added = Math.round(tripHeat(input.plans) + (input.extraHeat ?? 0));
    const inventory = await ProductInventoryService.read(tx, roundPlayerId, ruleset);
    const products = { ...inventory, [CRACK]: input.next.crack };
    const rng = input.rng ?? Math.random;
    // The arrest rolls first, and only where one is possible, so older rounds roll as they did.
    const arrest = resolveArrest({ heat: input.startHeat, cashCents: input.next.cashCents, products, ruleset, rng });
    const bust = arrest.arrested
      ? { busted: false, chance: 0, seized: {} as Record<string, number>, fineCents: 0n }
      : resolveBust({ heat: input.startHeat, cashCents: input.next.cashCents, products, ruleset, rng });
    const taken = arrest.arrested ? arrest : bust.busted ? bust : null;

    let next = input.next;
    if (taken) {
      const rows = Object.fromEntries(Object.entries(taken.seized).filter(([key]) => key !== CRACK).map(([key, units]) => [key, -units]));
      if (Object.keys(rows).length) await ProductInventoryService.adjust(tx, roundPlayerId, ruleset, rows);
      next = { ...next, crack: next.crack - (taken.seized[CRACK] ?? 0), cashCents: next.cashCents - taken.fineCents };
    }
    const drop = arrest.arrested ? rules.arrest!.heatDrop : bust.busted ? rules.bust.heatDrop : 0;
    const after = addHeat(input.startHeat, added - drop, rules);
    const lockedUntil = arrest.arrested ? new Date((input.now ?? new Date()).getTime() + arrest.downtimeMinutes * 60_000) : null;
    next = { ...next, heat: after, ...(lockedUntil ? { lockedUntil } : {}) };

    return {
      next,
      heat: {
        before: input.startHeat,
        added,
        after,
        max: rules.max,
        takeMultiplier: heatTakeMultiplier(input.startHeat, ruleset),
        bustChance: bustChance(input.startHeat, ruleset),
        busted: bust.busted,
        ...(rules.arrest ? { arrested: arrest.arrested, arrestChance: arrest.chance, lockedUntil: lockedUntil?.toISOString() ?? null } : {}),
        seized: taken?.seized ?? {},
        fineCents: Number(taken?.fineCents ?? 0n),
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
        const freeBribe = await SingleUseFavorService.matching(
          tx,
          roundPlayerId,
          ruleset,
          'FREE_HEAT_BRIBE',
        );
        const products = freeBribe
          ? null
          : await ProductInventoryService.read(tx, player.id, ruleset);
        const costCents = freeBribe
          ? 0n
          : bribeCentsPerPoint(
              NetWorthService.calculate({ ...current, products: products! }, ruleset),
              rules,
            ) * BigInt(input.points);
        if (costCents > current.cashCents) {
          throw AppError.badRequest('NOT_ENOUGH_CASH', 'You cannot cover that bribe.', { points: 'Not enough cash.' });
        }
        const next = { ...current, cashCents: current.cashCents - costCents, heat: current.heat - input.points };
        if (freeBribe) await SingleUseFavorService.consume(tx, freeBribe.id);
        const result: HeatBribeResult = {
          points: input.points,
          costCents: Number(costCents),
          heatBefore: current.heat,
          heatAfter: next.heat,
          ...(freeBribe ? { favorKey: freeBribe.key } : {}),
        };
        return { next, result, activity: { type: 'HEAT_BRIBE', payload: result } };
      },
    });
  },
};
