import type { PrismaClient, RunTrade } from '@prisma/client';
import {
  RunError,
  calculateCityTrade,
  cargoUnits,
  cityCounter,
  driveMs,
  driveTurns,
  findRoutes,
  planDriveOn,
  planHeadHome,
  planLaunch,
  routeHours,
  runCapacity,
  runNetWorthCents,
  runPosition,
  runRules,
  settleCityShelf,
  type Ruleset,
  type RunStopPlan,
} from '@streets/rules-engine';
import {
  runDriveOnSchema,
  runHeadHomeSchema,
  runLaunchSchema,
  runTradeSchema,
  type GameActionResult,
  type RunDto,
  type RunLaunchResult,
  type RunMoveResult,
  type RunReceiptDto,
  type RunTradeDto,
  type RunTradeResult,
  type TravelDto,
  type TravelRoutesDto,
} from '@streets/shared';
import type { Db } from '../utils/db.js';
import { AppError } from '../utils/errors.js';
import { ActionService, assertTurns, fitThugs } from './action.service.js';
import { CitiesService } from './cities.service.js';
import { PlayerStateService } from './player-state.service.js';
import { CRACK, ProductInventoryService, productKeys } from './product-inventory.service.js';
import { RUN_INCLUDE, cargoOf, recordSighting, toStopPlans, type LoadedRun } from './run-settle.service.js';

/** Engine refusals become player-facing errors, pointing at the field that caused them. */
function refuse(error: unknown): never {
  if (error instanceof RunError) throw AppError.badRequest(error.code, error.message, error.field ? { [error.field]: error.message } : undefined);
  throw error;
}

function requireRuns(ruleset: Ruleset): void {
  if (!runRules(ruleset)) throw AppError.conflict('RUNS_DISABLED', 'Nobody drives out of town this round.');
}

const cityName = (ruleset: Ruleset, slug: string) => ruleset.cities?.[slug]?.name ?? slug;
const productName = (ruleset: Ruleset, key: string) => ruleset.products?.[key]?.name ?? (key === CRACK ? 'Crack' : key);

async function activeRun(db: Db | PrismaClient, roundPlayerId: string): Promise<LoadedRun | null> {
  return db.run.findFirst({ where: { roundPlayerId, status: 'ACTIVE' }, include: RUN_INCLUDE });
}

async function requireActiveRun(tx: Db, roundPlayerId: string): Promise<LoadedRun> {
  const run = await activeRun(tx, roundPlayerId);
  if (!run) throw AppError.conflict('NO_RUN', 'You have no run out.');
  return run;
}

/** Replace a run's stops with a new plan. Stops are few, so they are rewritten whole. */
async function writeStops(tx: Db, runId: string, stops: readonly RunStopPlan[]): Promise<void> {
  await tx.runStop.deleteMany({ where: { runId } });
  await tx.runStop.createMany({
    data: stops.map((stop, order) => ({ runId, order, city: stop.city, route: stop.route, departAt: stop.departAt, arriveAt: stop.arriveAt, leaveAt: stop.leaveAt })),
  });
}

function toTradeDto(ruleset: Ruleset, trade: RunTrade): RunTradeDto {
  return {
    city: trade.city,
    cityName: cityName(ruleset, trade.city),
    product: trade.productKey,
    direction: trade.direction as 'buy' | 'sell',
    quantity: trade.quantity,
    unitCents: trade.unitCents,
    totalCents: Number(trade.totalCents),
    at: trade.createdAt.toISOString(),
  };
}

function stopsDto(ruleset: Ruleset, stops: readonly RunStopPlan[]): RunDto['stops'] {
  const last = stops.length - 1;
  return stops.map((stop, index) => ({
    city: stop.city,
    cityName: cityName(ruleset, stop.city),
    isHome: index === last,
    route: stop.route.map((slug) => ({ slug, name: cityName(ruleset, slug) })),
    departAt: stop.departAt.toISOString(),
    arriveAt: stop.arriveAt.toISOString(),
    leaveAt: stop.leaveAt?.toISOString() ?? null,
  }));
}

/** Pip's counter where a run is, with the player's own shelf there. */
async function liveCounter(db: Db | PrismaClient, roundPlayerId: string, ruleset: Ruleset, city: string, now: Date): Promise<NonNullable<RunDto['counter']>> {
  const shelves = await db.cityShelf.findMany({ where: { roundPlayerId, city } });
  return {
    city,
    products: productKeys(ruleset).map((key) => {
      const counter = cityCounter(ruleset, city, key);
      if (!counter) return { key, supply: null, buyCents: null, sellCents: null, stock: 0, nextAt: null };
      const row = shelves.find((shelf) => shelf.productKey === key) ?? null;
      const settled = settleCityShelf(row, counter, now);
      return { key, supply: counter.supply, buyCents: counter.buyCents, sellCents: counter.sellCents, stock: settled.stock, nextAt: settled.nextAt?.toISOString() ?? null };
    }),
  };
}

async function runDto(db: Db | PrismaClient, roundPlayerId: string, ruleset: Ruleset, run: LoadedRun, now: Date): Promise<RunDto | null> {
  const stops = toStopPlans(run.stops);
  const position = runPosition(ruleset, stops, now);
  if (position.phase === 'home') return null;
  const trades = await db.runTrade.findMany({ where: { runId: run.id }, orderBy: { createdAt: 'asc' } });
  return {
    id: run.id,
    launchedAt: run.launchedAt.toISOString(),
    lowRiders: run.lowRiders,
    escortThugs: run.escortThugs,
    cashCents: Number(run.cashCents),
    startCashCents: Number(run.startCashCents),
    capacity: runCapacity(ruleset, run.lowRiders),
    cargo: run.cargo.map((row) => ({ key: row.productKey, quantity: row.quantity, startQuantity: row.startQuantity })),
    turnsSpent: run.turnsSpent,
    stops: stopsDto(ruleset, stops),
    position: {
      phase: position.phase,
      stopIndex: position.stopIndex,
      city: position.city,
      cityName: cityName(ruleset, position.city),
      from: position.from,
      fromName: cityName(ruleset, position.from),
      progress: position.progress,
      road: position.road,
      until: position.until.toISOString(),
    },
    counter: position.phase === 'town' ? await liveCounter(db, roundPlayerId, ruleset, position.city, now) : null,
    trades: trades.map((trade) => toTradeDto(ruleset, trade)),
  };
}

async function lastRunDto(db: Db | PrismaClient, roundPlayerId: string, ruleset: Ruleset): Promise<RunReceiptDto | null> {
  const run = await db.run.findFirst({
    where: { roundPlayerId, status: 'RETURNED' },
    orderBy: { returnedAt: 'desc' },
    include: { ...RUN_INCLUDE, trades: { orderBy: { createdAt: 'asc' } } },
  });
  if (!run || !run.returnedAt) return null;
  const visited = [...new Set(run.stops.slice(0, -1).map((stop) => stop.city))];
  return {
    id: run.id,
    launchedAt: run.launchedAt.toISOString(),
    returnedAt: run.returnedAt.toISOString(),
    cities: visited.map((slug) => ({ slug, name: cityName(ruleset, slug) })),
    lowRiders: run.lowRiders,
    escortThugs: run.escortThugs,
    startCashCents: Number(run.startCashCents),
    cashCents: Number(run.cashCents),
    cargo: run.cargo.map((row) => ({ key: row.productKey, startQuantity: row.startQuantity, quantity: row.quantity })),
    turnsSpent: run.turnsSpent,
    trades: run.trades.map((trade) => toTradeDto(ruleset, trade)),
  };
}

/** A run's away net worth, from its wallet, cars, escorts and trunk. */
function awayWorth(ruleset: Ruleset, run: { cashCents: bigint; lowRiders: number; escortThugs: number }, cargo: Record<string, number>): bigint {
  return runNetWorthCents(ruleset, { cashCents: run.cashCents, lowRiders: run.lowRiders, escortThugs: run.escortThugs, cargo });
}

/**
 * 0.5.0-B. Runs: load up at home, drive the real roads, trade at Pip's counter in
 * other cities out of the run's own wallet and trunk, and come home. Every change is
 * a game action, so it is locked, idempotent and leaves a before and after.
 */
export const TravelService = {
  async page(prisma: PrismaClient, roundPlayerId: string, now: Date = new Date()): Promise<TravelDto> {
    const settled = await PlayerStateService.settle(prisma, roundPlayerId, { markActive: false, now });
    const { ruleset, player } = settled;
    const map = await CitiesService.page(prisma, roundPlayerId);
    const inventory = await ProductInventoryService.read(prisma, roundPlayerId, ruleset);
    const run = await activeRun(prisma, roundPlayerId);
    const travel = ruleset.travel;
    return {
      ...map,
      runsEnabled: Boolean(runRules(ruleset)),
      rules: {
        cargoPerLowRider: travel?.cargoPerLowRider ?? 0,
        thugsPerLowRider: ruleset.lowRiderThugCapacity,
        townWindowMinutes: runRules(ruleset)?.townWindowMinutes ?? 0,
        turnsPerDriveHour: travel?.turnsPerDriveHour ?? 0,
      },
      home: {
        cashCents: Number(player.cashCents),
        lowRiders: player.lowRiders,
        fitThugs: fitThugs(player),
        turns: player.turns,
        products: Object.entries(inventory).map(([key, quantity]) => ({ key, quantity })),
      },
      run: run ? await runDto(prisma, roundPlayerId, ruleset, run, now) : null,
      lastRun: await lastRunDto(prisma, roundPlayerId, ruleset),
    };
  },

  /**
   * The ways to a city from where the player can leave: home when no run is out, or
   * the town the run is in. Turns are what leaving now would cost, the same sum the
   * action charges.
   */
  async routes(prisma: PrismaClient, roundPlayerId: string, to: string, now: Date = new Date()): Promise<TravelRoutesDto> {
    const settled = await PlayerStateService.settle(prisma, roundPlayerId, { markActive: false, now });
    const { ruleset, player } = settled;
    requireRuns(ruleset);
    const home = player.city.slug;
    const run = await activeRun(prisma, roundPlayerId);
    let from = home;
    let paidHome = 0;
    if (run) {
      const stops = toStopPlans(run.stops);
      const position = runPosition(ruleset, stops, now);
      if (position.phase !== 'town') throw AppError.conflict('NOT_IN_TOWN', 'The run can only change course from a town.');
      from = position.city;
      paidHome = routeHours(ruleset, stops[stops.length - 1]!.route);
    }
    if (!ruleset.cities?.[to]) throw AppError.badRequest('UNKNOWN_CITY', 'That city is not on the map.', { to: 'Pick a city.' });
    const back = to === home ? null : findRoutes(ruleset, to, home)[0];
    return {
      from,
      to,
      routes: findRoutes(ruleset, from, to).map((route, index) => ({
        index,
        cities: route.cities.map((slug) => ({ slug, name: cityName(ruleset, slug) })),
        passesThrough: route.passesThrough,
        driveHours: route.driveHours,
        gameMinutes: route.gameMinutes,
        turns: back ? Math.max(0, driveTurns(ruleset, route.driveHours + back.driveHours) - driveTurns(ruleset, paidHome)) : 0,
        police: route.police,
        arriveAt: new Date(now.getTime() + driveMs(ruleset, route.driveHours)).toISOString(),
      })),
    };
  },

  /** Load a run up at home and send it: cars, escorts, cash and cargo leave home stock together. */
  launch(prisma: PrismaClient, roundPlayerId: string, rawInput: unknown): Promise<GameActionResult<RunLaunchResult>> {
    const input = runLaunchSchema.parse(rawInput);
    return ActionService.run<RunLaunchResult>(prisma, roundPlayerId, {
      action: 'RUN_LAUNCH',
      actionId: input.actionId,
      execute: async ({ tx, current, ruleset, player, now }) => {
        requireRuns(ruleset);
        if (await activeRun(tx, roundPlayerId)) throw AppError.conflict('RUN_OUT', 'You already have a run out. Wait for it to come home.');
        let plan;
        try {
          plan = planLaunch(ruleset, { home: player.city.slug, to: input.to, routeIndex: input.route, now });
        } catch (error) { refuse(error); }
        assertTurns(current.turns, plan.turns);

        if (input.lowRiders > current.lowRiders) {
          throw AppError.badRequest('NOT_ENOUGH_LOW_RIDERS', `You have ${current.lowRiders} Low-Rider${current.lowRiders === 1 ? '' : 's'} at home.`, { lowRiders: `At most ${current.lowRiders}.` });
        }
        const seats = input.lowRiders * ruleset.lowRiderThugCapacity;
        const fit = fitThugs(current);
        if (input.escortThugs > Math.min(fit, seats)) {
          const why = input.escortThugs > seats ? `${input.lowRiders} Low-Rider${input.lowRiders === 1 ? '' : 's'} seat ${seats} thugs.` : `You have ${fit} fit thugs at home.`;
          throw AppError.badRequest('TOO_MANY_ESCORTS', why, { escortThugs: why });
        }
        const cashCents = BigInt(input.cashCents);
        if (cashCents > current.cashCents) {
          throw AppError.badRequest('NOT_ENOUGH_CASH', 'You cannot take more cash than you have.', { cashCents: 'More than you have.' });
        }
        const inventory = await ProductInventoryService.read(tx, roundPlayerId, ruleset);
        const cargo = Object.fromEntries(Object.entries(input.cargo).filter(([, quantity]) => quantity > 0));
        for (const [key, quantity] of Object.entries(cargo)) {
          if (!(key in inventory)) throw AppError.badRequest('UNKNOWN_PRODUCT', 'That product is not part of this round.');
          if (quantity > inventory[key]!) {
            throw AppError.badRequest('NOT_ENOUGH_PRODUCT', `You only have ${inventory[key]} ${productName(ruleset, key)}.`, { cargo: `Only ${inventory[key]} ${productName(ruleset, key)}.` });
          }
        }
        const capacity = runCapacity(ruleset, input.lowRiders);
        if (cargoUnits(cargo) > capacity) {
          throw AppError.badRequest('TRUNK_FULL', `${input.lowRiders} Low-Rider${input.lowRiders === 1 ? '' : 's'} carry ${capacity} units.`, { cargo: `At most ${capacity} units.` });
        }

        // Crack leaves on the column with everything else in `next`; other products are rows.
        const rows = Object.fromEntries(Object.entries(cargo).filter(([key]) => key !== CRACK).map(([key, quantity]) => [key, -quantity]));
        if (Object.keys(rows).length) await ProductInventoryService.adjust(tx, roundPlayerId, ruleset, rows);
        const run = await tx.run.create({
          data: {
            roundPlayerId,
            homeCity: player.city.slug,
            lowRiders: input.lowRiders,
            escortThugs: input.escortThugs,
            cashCents,
            startCashCents: cashCents,
            turnsSpent: plan.turns,
            launchedAt: now,
            cargo: { create: productKeys(ruleset).filter((key) => (cargo[key] ?? 0) > 0).map((key) => ({ productKey: key, quantity: cargo[key]!, startQuantity: cargo[key]! })) },
          },
        });
        await writeStops(tx, run.id, plan.stops);

        const [out, home] = plan.stops;
        const result: RunLaunchResult = {
          runId: run.id,
          city: input.to,
          cityName: cityName(ruleset, input.to),
          route: plan.route.cities,
          arriveAt: out!.arriveAt.toISOString(),
          leaveAt: out!.leaveAt!.toISOString(),
          backAt: home!.arriveAt.toISOString(),
          turns: plan.turns,
          lowRiders: input.lowRiders,
          escortThugs: input.escortThugs,
          cashCents: input.cashCents,
          cargo,
        };
        return {
          next: {
            ...current,
            turns: current.turns - plan.turns,
            cashCents: current.cashCents - cashCents,
            lowRiders: current.lowRiders - input.lowRiders,
            thugs: current.thugs - input.escortThugs,
            crack: current.crack - (cargo[CRACK] ?? 0),
            awayNetWorthCents: awayWorth(ruleset, { cashCents, lowRiders: input.lowRiders, escortThugs: input.escortThugs }, cargo),
          },
          result,
          activity: { type: 'RUN_LAUNCHED', payload: { ...result, cities: [cityName(ruleset, input.to)] } },
        };
      },
    });
  },

  /** Buy or sell at Pip's counter in the town the run is in, out of the run's wallet and trunk. */
  trade(prisma: PrismaClient, roundPlayerId: string, rawInput: unknown): Promise<GameActionResult<RunTradeResult>> {
    const input = runTradeSchema.parse(rawInput);
    return ActionService.run<RunTradeResult>(prisma, roundPlayerId, {
      action: 'RUN_TRADE',
      actionId: input.actionId,
      execute: async ({ tx, current, ruleset, now }) => {
        requireRuns(ruleset);
        const run = await requireActiveRun(tx, roundPlayerId);
        const position = runPosition(ruleset, toStopPlans(run.stops), now);
        if (position.phase !== 'town') {
          throw AppError.conflict('NOT_IN_TOWN', position.phase === 'road' ? `The run is still on the road to ${cityName(ruleset, position.city)}.` : 'The run is home.');
        }
        const city = position.city;
        const counter = cityCounter(ruleset, city, input.product);
        const shelfRow = await tx.cityShelf.findUnique({ where: { roundPlayerId_city_productKey: { roundPlayerId, city, productKey: input.product } } });
        const shelf = counter ? settleCityShelf(shelfRow, counter, now) : null;
        const cargo = cargoOf(run);
        const capacity = runCapacity(ruleset, run.lowRiders);
        let trade;
        try {
          trade = calculateCityTrade({
            ruleset, city, product: input.product, direction: input.direction, quantity: input.quantity,
            runCashCents: run.cashCents, held: cargo[input.product] ?? 0, trunkUnits: cargoUnits(cargo), capacity, shelfStock: shelf?.stock ?? 0,
          });
        } catch (error) { refuse(error); }

        const cashCents = run.cashCents + trade.cashChangeCents;
        const held = (cargo[input.product] ?? 0) + trade.quantityChange;
        await tx.run.update({ where: { id: run.id }, data: { cashCents } });
        await tx.runCargo.upsert({
          where: { runId_productKey: { runId: run.id, productKey: input.product } },
          create: { runId: run.id, productKey: input.product, quantity: held, startQuantity: 0 },
          update: { quantity: held },
        });
        if (shelf && counter) {
          // A sale never touches the shelf, but settling it is still kept, or a parked clock is lost.
          const stock = shelf.stock - trade.stockTaken;
          await tx.cityShelf.upsert({
            where: { roundPlayerId_city_productKey: { roundPlayerId, city, productKey: input.product } },
            create: { roundPlayerId, city, productKey: input.product, stock, stockAt: shelf.stockAt },
            update: { stock, stockAt: shelf.stockAt },
          });
        }
        await tx.runTrade.create({
          data: { runId: run.id, city, productKey: input.product, direction: input.direction, quantity: trade.quantity, unitCents: trade.unitCents, totalCents: trade.totalCents, createdAt: now },
        });
        // The crew saw the counter as it was left.
        await tx.citySighting.deleteMany({ where: { roundPlayerId, city } });
        await recordSighting(tx, roundPlayerId, ruleset, city, now);

        const nextCargo = { ...cargo, [input.product]: held };
        return {
          next: { ...current, awayNetWorthCents: awayWorth(ruleset, { cashCents, lowRiders: run.lowRiders, escortThugs: run.escortThugs }, nextCargo) },
          result: {
            city,
            cityName: cityName(ruleset, city),
            product: input.product,
            productName: productName(ruleset, input.product),
            direction: input.direction,
            quantity: trade.quantity,
            unitCents: trade.unitCents,
            totalCents: Number(trade.totalCents),
            runCashCents: Number(cashCents),
            held,
            trunkUnits: cargoUnits(nextCargo),
            capacity,
            shelfStock: shelf ? shelf.stock - trade.stockTaken : 0,
          },
        };
      },
    });
  },

  /** Leave town for another city, then home from there. Pays only for the extra road. */
  driveOn(prisma: PrismaClient, roundPlayerId: string, rawInput: unknown): Promise<GameActionResult<RunMoveResult>> {
    const input = runDriveOnSchema.parse(rawInput);
    return ActionService.run<RunMoveResult>(prisma, roundPlayerId, {
      action: 'RUN_DRIVE_ON',
      actionId: input.actionId,
      execute: async ({ tx, current, ruleset, now }) => {
        requireRuns(ruleset);
        const run = await requireActiveRun(tx, roundPlayerId);
        let plan;
        try {
          plan = planDriveOn(ruleset, toStopPlans(run.stops), now, { home: run.homeCity, to: input.to, routeIndex: input.route });
        } catch (error) { refuse(error); }
        assertTurns(current.turns, plan.turns);
        await writeStops(tx, run.id, plan.stops);
        await tx.run.update({ where: { id: run.id }, data: { turnsSpent: run.turnsSpent + plan.turns } });
        const next = plan.stops[plan.stops.length - 2]!;
        return {
          next: { ...current, turns: current.turns - plan.turns },
          result: { city: input.to, cityName: cityName(ruleset, input.to), arriveAt: next.arriveAt.toISOString(), turns: plan.turns },
        };
      },
    });
  },

  /** Close the town window now and drive home. The drive is already paid for. */
  headHome(prisma: PrismaClient, roundPlayerId: string, rawInput: unknown): Promise<GameActionResult<RunMoveResult>> {
    const input = runHeadHomeSchema.parse(rawInput);
    return ActionService.run<RunMoveResult>(prisma, roundPlayerId, {
      action: 'RUN_HEAD_HOME',
      actionId: input.actionId,
      execute: async ({ tx, current, ruleset, now }) => {
        requireRuns(ruleset);
        const run = await requireActiveRun(tx, roundPlayerId);
        let stops;
        try {
          stops = planHeadHome(ruleset, toStopPlans(run.stops), now);
        } catch (error) { refuse(error); }
        await writeStops(tx, run.id, stops);
        const home = stops[stops.length - 1]!;
        return {
          next: current,
          result: { city: home.city, cityName: cityName(ruleset, home.city), arriveAt: home.arriveAt.toISOString(), turns: 0 },
        };
      },
    });
  },
};

