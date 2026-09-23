import type { Prisma, PrismaClient, RunTrade } from '@prisma/client';
import type { DistrictKey } from '@streets/rulesets';
import {
  RunError,
  addHeat,
  armEscorts,
  bustChance,
  calculateCityTrade,
  cargoUnits,
  cityEventAt,
  driveMs,
  driveTurns,
  fillMarket,
  findRoutes,
  loadRulesetForRound,
  marketView,
  planDriveOn,
  planHeadHome,
  planLaunch,
  quoteMoved,
  resolveRunTrouble,
  routeHours,
  rulesetForCity,
  runCapacity,
  runPosition,
  runRules,
  saleHeat,
  settleLiveShelf,
  streetWire,
  type Rng,
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
  type WireItemDto,
} from '@streets/shared';
import type { Db } from '../utils/db.js';
import { AppError } from '../utils/errors.js';
import { ActionService, assertTurns, fitThugs } from './action.service.js';
import { CitiesService } from './cities.service.js';
import { PlayerStateService } from './player-state.service.js';
import { RelocationService } from './relocation.service.js';
import { ActivityService } from './activity.service.js';
import { HighMarketService } from './high-market.service.js';
import { hideoutGarageRunLimit, hideoutWeaponPriority } from './hideout.service.js';
import { CRACK, ProductInventoryService, productKeys } from './product-inventory.service.js';
import {
  RUN_INCLUDE,
  awayWorth,
  cargoOf,
  totalAwayWorth,
  marketPrice,
  recordSighting,
  takeFromRun,
  toIncidentDto,
  toStopPlans,
  type LoadedRun,
} from './run-settle.service.js';

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

async function activeRuns(db: Db | PrismaClient, roundPlayerId: string): Promise<LoadedRun[]> {
  return db.run.findMany({
    where: { roundPlayerId, status: 'ACTIVE' },
    include: RUN_INCLUDE,
    orderBy: [{ launchedAt: 'asc' }, { id: 'asc' }],
  });
}

async function activeRun(db: Db | PrismaClient, roundPlayerId: string, runId?: string): Promise<LoadedRun | null> {
  if (runId) {
    const run = await db.run.findUnique({ where: { id: runId }, include: RUN_INCLUDE });
    return run?.roundPlayerId === roundPlayerId && run.status === 'ACTIVE' ? run : null;
  }
  return db.run.findFirst({
    where: { roundPlayerId, status: 'ACTIVE' },
    include: RUN_INCLUDE,
    orderBy: [{ launchedAt: 'asc' }, { id: 'asc' }],
  });
}

async function requireActiveRun(tx: Db, roundPlayerId: string, runId?: string): Promise<LoadedRun> {
  if (!runId) {
    const count = await tx.run.count({ where: { roundPlayerId, status: 'ACTIVE' } });
    if (count > 1) throw AppError.badRequest('RUN_PICK_REQUIRED', 'Pick which run you want to use.');
  }
  const run = await activeRun(tx, roundPlayerId, runId);
  if (!run) throw AppError.conflict('NO_RUN', 'That active run is not available.');
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
    venue: trade.venue === 'market' ? 'market' : 'pip',
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

/** Pip's counter and the high market where a run is, with the player's own shelf there. */
async function liveCounter(db: Db | PrismaClient, roundPlayerId: string, ruleset: Ruleset, seed: string, city: string, now: Date): Promise<NonNullable<RunDto['counter']>> {
  const shelves = await db.cityShelf.findMany({ where: { roundPlayerId, city } });
  const pushes = await HighMarketService.pushes(db, ruleset, seed, city, now);
  const event = cityEventAt(ruleset, seed, city, now);
  return {
    city,
    event: event ? { kind: event.kind, product: event.product, endsAt: event.endsAt.toISOString() } : null,
    products: productKeys(ruleset).map((key) => {
      const row = shelves.find((shelf) => shelf.productKey === key) ?? null;
      const settled = settleLiveShelf(row, ruleset, seed, city, key, now);
      const counter = settled.counter;
      const market = marketPrice(ruleset, seed, city, key, pushes.get(key) ?? 0, now);
      if (!counter) return { key, supply: null, buyCents: null, sellCents: null, stock: 0, nextAt: null, market };
      return { key, supply: counter.supply, buyCents: counter.buyCents, sellCents: counter.sellCents, stock: settled.stock, nextAt: settled.nextAt?.toISOString() ?? null, market };
    }),
  };
}

async function runDto(db: Db | PrismaClient, roundPlayerId: string, ruleset: Ruleset, seed: string, run: LoadedRun, now: Date): Promise<RunDto | null> {
  const stops = toStopPlans(run.stops);
  const position = runPosition(ruleset, stops, now);
  if (position.phase === 'home') return null;
  const trades = await db.runTrade.findMany({ where: { runId: run.id }, orderBy: { createdAt: 'asc' } });
  const incidents = await db.runIncident.findMany({ where: { runId: run.id }, orderBy: { at: 'asc' } });
  return {
    id: run.id,
    launchedAt: run.launchedAt.toISOString(),
    lowRiders: run.lowRiders,
    escortThugs: run.escortThugs,
    cashCents: Number(run.cashCents),
    startCashCents: Number(run.startCashCents),
    beer: run.beer,
    startBeer: run.startBeer,
    capacity: runCapacity(ruleset, run.lowRiders),
    cargo: run.cargo.map((row) => ({ key: row.productKey, quantity: row.quantity, startQuantity: row.startQuantity })),
    guns: { PISTOL: run.pistols, SHOTGUN: run.shotguns, TEK9: run.tek9s, AK47: run.ak47s },
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
    counter: position.phase === 'town' ? await liveCounter(db, roundPlayerId, ruleset, seed, position.city, now) : null,
    trades: trades.map((trade) => toTradeDto(ruleset, trade)),
    incidents: incidents.map((incident) => toIncidentDto(ruleset, incident)),
  };
}

async function lastRunDto(db: Db | PrismaClient, roundPlayerId: string, ruleset: Ruleset): Promise<RunReceiptDto | null> {
  const run = await db.run.findFirst({
    where: { roundPlayerId, status: 'RETURNED' },
    orderBy: { returnedAt: 'desc' },
    include: { ...RUN_INCLUDE, trades: { orderBy: { createdAt: 'asc' } }, incidents: { orderBy: { at: 'asc' } } },
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
    startBeer: run.startBeer,
    beer: run.beer,
    cargo: run.cargo.map((row) => ({ key: row.productKey, startQuantity: row.startQuantity, quantity: row.quantity })),
    turnsSpent: run.turnsSpent,
    trades: run.trades.map((trade) => toTradeDto(ruleset, trade)),
    incidents: run.incidents.map((incident) => toIncidentDto(ruleset, incident)),
  };
}

/** The street wire in words. Never a price, never a number. */
function wireText(ruleset: Ruleset, item: ReturnType<typeof streetWire>[number]): string {
  const city = cityName(ruleset, item.city);
  const product = productName(ruleset, item.product).toLowerCase();
  if (item.kind === 'GLUT') return `A shipment of ${product} landed in ${city}. It is cheap there while it lasts.`;
  if (item.kind === 'DROUGHT') return `The police hit the ${product} suppliers in ${city}. Pip is dry, and the market is paying through the nose.`;
  if (item.supply === 'OUT') return `Pip has run out of ${product} in ${city}.`;
  if (item.supply === 'PLENTIFUL') return `Pip has plenty of ${product} in ${city}.`;
  return `Pip's ${product} in ${city} is back to ${item.supply === 'LOW' ? 'a trickle' : 'normal'}.`;
}

const WIRE_HOURS = 24;

async function wireDto(prisma: PrismaClient, roundId: string, ruleset: Ruleset, seed: string, now: Date): Promise<WireItemDto[]> {
  const since = new Date(now.getTime() - WIRE_HOURS * 3_600_000);
  const market: WireItemDto[] = streetWire(ruleset, seed, since, now).map((item) => ({
    at: item.at.toISOString(),
    city: item.city,
    cityName: cityName(ruleset, item.city),
    product: item.product,
    kind: item.kind,
    supply: item.supply ?? null,
    endsAt: item.endsAt?.toISOString() ?? null,
    text: wireText(ruleset, item),
  }));
  if (!ruleset.turf?.wars) return market;

  const [fights, crackdown] = await Promise.all([
    prisma.turfPush.findMany({
      where: { roundId, status: 'LANDED', captured: true, settledAt: { gte: since } },
      select: {
        settledAt: true,
        attackerAllianceId: true,
        attacker: { select: { displayName: true } },
        turf: { select: { district: true, city: { select: { slug: true } } } },
      },
      orderBy: { settledAt: 'desc' },
      take: 50,
    }),
    ruleset.turf?.crackdown
      ? prisma.turfCrackdown.findUnique({
        where: { roundId },
        include: { city: { select: { slug: true, name: true } } },
      })
      : Promise.resolve(null),
  ]);
  const allianceIds = [...new Set(fights.map((fight) => fight.attackerAllianceId).filter((id): id is string => Boolean(id)))];
  const alliances = allianceIds.length
    ? await prisma.alliance.findMany({ where: { id: { in: allianceIds } }, select: { id: true, tag: true } })
    : [];
  const tags = new Map(alliances.map((alliance) => [alliance.id, alliance.tag]));
  const turf: WireItemDto[] = fights.flatMap((fight) => {
    if (!fight.settledAt) return [];
    const slug = fight.turf.city.slug;
    const district = fight.turf.district as DistrictKey;
    const block = ruleset.cities?.[slug]?.districts?.[district]?.name ?? ruleset.districts[district]?.name ?? fight.turf.district;
    const tag = fight.attackerAllianceId ? tags.get(fight.attackerAllianceId) ?? null : null;
    const holder = tag ? `[${tag}] ${fight.attacker.displayName}` : fight.attacker.displayName;
    return [{
      at: fight.settledAt.toISOString(),
      city: slug,
      cityName: cityName(ruleset, slug),
      product: null,
      kind: 'TURF' as const,
      supply: null,
      endsAt: null,
      text: `${block} in ${cityName(ruleset, slug)} fell to ${holder}.`,
    }];
  });
  const federal: WireItemDto[] = [];
  if (crackdown) {
    if (crackdown.sweepAt > now && crackdown.warningAt <= now && crackdown.warningAt >= since) {
      federal.push({
        at: crackdown.warningAt.toISOString(),
        city: crackdown.city.slug,
        cityName: crackdown.city.name,
        product: null,
        kind: 'CRACKDOWN',
        supply: null,
        endsAt: crackdown.sweepAt.toISOString(),
        text: `Word is the Feds are sweeping ${crackdown.city.name} tomorrow. Turf crews have until then to pull out.`,
      });
    }
    if (crackdown.sweptAt && crackdown.sweepAt <= now && crackdown.sweepAt >= since) {
      federal.push({
        at: crackdown.sweepAt.toISOString(),
        city: crackdown.city.slug,
        cityName: crackdown.city.name,
        product: null,
        kind: 'CRACKDOWN',
        supply: null,
        endsAt: null,
        text: crackdown.thugsPickedUp > 0
          ? `The Feds swept ${crackdown.city.name}. ${crackdown.thugsPickedUp} corner men got picked up across ${crackdown.holdersAffected} crew${crackdown.holdersAffected === 1 ? '' : 's'}.`
          : crackdown.holdersAffected > 0
            ? `The Feds swept ${crackdown.city.name}. ${crackdown.holdersAffected} crew${crackdown.holdersAffected === 1 ? ' was' : 's were'} caught holding corners, but nobody got picked up.`
            : `The Feds swept ${crackdown.city.name}, but every turf crew had already cleared out.`,
      });
    }
  }
  return [...market, ...turf, ...federal].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
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
    // Other cities' counters and Heat lines read the round's own rules, not home's.
    const base = loadRulesetForRound(settled.round);
    const map = await CitiesService.page(prisma, roundPlayerId, now);
    const inventory = await ProductInventoryService.read(prisma, roundPlayerId, ruleset);
    const active = await activeRuns(prisma, roundPlayerId);
    const runDtos = (await Promise.all(active.map((run) => runDto(prisma, roundPlayerId, base, player.roundId, run, now))))
      .filter((run): run is RunDto => Boolean(run));
    const limit = hideoutGarageRunLimit(ruleset, player);
    const travel = ruleset.travel;
    const seed = player.roundId;
    // 0.5.0-F: with the home market open at launch, home shows its wholesale prices too.
    const homeMarketAtLaunch = Boolean(travel?.market && runRules(ruleset)?.homeMarketAtLaunch);
    const homePushes = homeMarketAtLaunch ? await HighMarketService.pushes(prisma, ruleset, seed, player.city.slug, now) : null;
    const cities = homePushes
      ? map.cities.map((city) => (city.isHome && city.counter
        ? { ...city, counter: { ...city.counter, products: city.counter.products.map((entry) => ({ ...entry, market: marketPrice(ruleset, seed, player.city.slug, entry.key, homePushes.get(entry.key) ?? 0, now) })) } }
        : city))
      : map.cities;
    return {
      ...map,
      cities,
      runsEnabled: Boolean(runRules(ruleset)),
      rules: {
        cargoPerLowRider: travel?.cargoPerLowRider ?? 0,
        thugsPerLowRider: ruleset.lowRiderThugCapacity,
        townWindowMinutes: runRules(ruleset)?.townWindowMinutes ?? 0,
        turnsPerDriveHour: travel?.turnsPerDriveHour ?? 0,
        market: travel?.market ? { spread: travel.highMarketSpread, quoteTolerance: travel.market.quoteTolerance } : null,
        homeMarketAtLaunch: Boolean(travel?.market && runRules(ruleset)?.homeMarketAtLaunch),
        runLimit: limit,
        outposts: ruleset.turf?.outposts ? { ...ruleset.turf.outposts } : null,
      },
      home: {
        cashCents: Number(player.cashCents),
        beer: player.beer,
        lowRiders: player.lowRiders,
        fitThugs: fitThugs(player),
        turns: player.turns,
        products: Object.entries(inventory).map(([key, quantity]) => ({ key, quantity })),
      },
      run: runDtos[0] ?? null,
      runs: runDtos,
      lastRun: await lastRunDto(prisma, roundPlayerId, base),
      wire: await wireDto(prisma, player.roundId, base, seed, now),
      relocation: await RelocationService.page(prisma, player, base, settled.round.endsAt, player.heat, now),
    };
  },

  /**
   * The ways to a city from where the player can leave: home when no run is out, or
   * the town the run is in. Turns are what leaving now would cost, the same sum the
   * action charges.
   */
  async routes(prisma: PrismaClient, roundPlayerId: string, to: string, runId?: string, now: Date = new Date()): Promise<TravelRoutesDto> {
    const settled = await PlayerStateService.settle(prisma, roundPlayerId, { markActive: false, now });
    const { ruleset, player } = settled;
    requireRuns(ruleset);
    const home = player.city.slug;
    const run = runId ? await activeRun(prisma, roundPlayerId, runId) : null;
    if (runId && !run) throw AppError.notFound('RUN_NOT_FOUND', 'That active run is not available.');
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
        const activeCount = await tx.run.count({ where: { roundPlayerId, status: 'ACTIVE' } });
        const limit = hideoutGarageRunLimit(ruleset, player);
        if (activeCount >= limit) {
          throw AppError.conflict('RUN_LIMIT', limit === 1
            ? 'You already have a run out. Build the Garage or wait for it to come home.'
            : `Your Garage supports ${limit} active runs, and they are already out.`);
        }
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
        if (input.beer > current.beer) {
          throw AppError.badRequest('NOT_ENOUGH_BEER', `You only have ${current.beer} beer at home.`, { beer: `At most ${current.beer}.` });
        }
        const inventory = await ProductInventoryService.read(tx, roundPlayerId, ruleset);
        /** Out of home stock. What the crew buys on the way out is added to `cargo` below. */
        const fromHome = Object.fromEntries(Object.entries(input.cargo).filter(([, quantity]) => quantity > 0));
        const cargo: Record<string, number> = { ...fromHome };
        const marketTrades: Array<{ productKey: string; quantity: number; unitCents: number; totalCents: bigint }> = [];
        for (const [key, quantity] of Object.entries(fromHome)) {
          if (!(key in inventory)) throw AppError.badRequest('UNKNOWN_PRODUCT', 'That product is not part of this round.');
          if (quantity > inventory[key]!) {
            throw AppError.badRequest('NOT_ENOUGH_PRODUCT', `You only have ${inventory[key]} ${productName(ruleset, key)}.`, { cargo: `Only ${inventory[key]} ${productName(ruleset, key)}.` });
          }
        }
        // 0.5.0-F: buy on the home market as the crew loads up, straight into the trunk and
        // paid out of home cash. Buying only, so nobody sells on their own market.
        const bought = Object.fromEntries(Object.entries(input.market).filter(([, quantity]) => quantity > 0));
        let marketCents = 0n;
        if (Object.keys(bought).length) {
          const rules = ruleset.travel?.market;
          if (!runRules(ruleset)?.homeMarketAtLaunch || !rules) {
            throw AppError.conflict('NO_HOME_MARKET', 'You cannot buy on your own city\'s high market this round.');
          }
          const seed = player.roundId;
          // In catalog order, so two crews loading up at once never take their locks the other way round.
          for (const key of productKeys(ruleset).filter((product) => (bought[product] ?? 0) > 0)) {
            const quantity = bought[key]!;
            const market = await HighMarketService.lock(tx, ruleset, seed, player.city.slug, key, now);
            const view = marketView(ruleset, seed, player.city.slug, key, market.push, now);
            if (!view) throw AppError.badRequest('NO_MARKET_PRICE', `Nobody in ${cityName(ruleset, player.city.slug)} deals ${productName(ruleset, key)} in bulk.`, { market: 'No market for it here.' });
            const fill = fillMarket(view, rules, 'buy', quantity);
            const quoted = input.marketQuotes?.[key];
            if (quoted !== undefined && quoteMoved(rules, 'buy', quoted, fill.firstUnitCents)) {
              throw AppError.conflict('PRICE_MOVED', `The price moved: ${productName(ruleset, key)} now costs $${(fill.firstUnitCents / 100).toLocaleString('en-US')} a unit. Check it and try again.`);
            }
            await HighMarketService.write(tx, market.id, fill.pushAfter, now);
            marketCents += fill.totalCents;
            cargo[key] = (cargo[key] ?? 0) + quantity;
            marketTrades.push({ productKey: key, quantity, unitCents: Math.round(Number(fill.totalCents) / quantity), totalCents: fill.totalCents });
          }
          if (cashCents + marketCents > current.cashCents) {
            throw AppError.badRequest('NOT_ENOUGH_CASH', `The market comes to $${(Number(marketCents) / 100).toLocaleString('en-US')}, and with the cash in the car that is more than you have at home.`, { market: 'More than you have.' });
          }
        }

        const capacity = runCapacity(ruleset, input.lowRiders);
        if (cargoUnits(cargo) + input.beer > capacity) {
          throw AppError.badRequest('TRUNK_FULL', `${input.lowRiders} Low-Rider${input.lowRiders === 1 ? '' : 's'} carry ${capacity} units including beer.`, { cargo: `At most ${capacity} total units.` });
        }

        // Crack leaves on the column with everything else in `next`; other products are rows.
        const rows = Object.fromEntries(Object.entries(fromHome).filter(([key]) => key !== CRACK).map(([key, quantity]) => [key, -quantity]));
        if (Object.keys(rows).length) await ProductInventoryService.adjust(tx, roundPlayerId, ruleset, rows);
        // 0.5.0-E: escorts always ride armed, one gun each, the best first, out of home stock.
        const guns = ruleset.travel?.convoys
          ? armEscorts(ruleset, input.escortThugs, current, hideoutWeaponPriority(ruleset, current))
          : { pistols: 0, shotguns: 0, tek9s: 0, ak47s: 0 };
        const run = await tx.run.create({
          data: {
            roundPlayerId,
            homeCity: player.city.slug,
            lowRiders: input.lowRiders,
            escortThugs: input.escortThugs,
            ...guns,
            cashCents,
            startCashCents: cashCents,
            beer: input.beer,
            startBeer: input.beer,
            turnsSpent: plan.turns,
            launchedAt: now,
            cargo: { create: productKeys(ruleset).filter((key) => (cargo[key] ?? 0) > 0).map((key) => ({ productKey: key, quantity: cargo[key]!, startQuantity: cargo[key]! })) },
          },
        });
        await writeStops(tx, run.id, plan.stops);
        for (const trade of marketTrades) {
          await tx.runTrade.create({
            data: { runId: run.id, city: player.city.slug, productKey: trade.productKey, direction: 'buy', venue: 'market', quantity: trade.quantity, unitCents: trade.unitCents, totalCents: trade.totalCents, createdAt: now },
          });
        }

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
          beer: input.beer,
          cargo,
          market: Object.fromEntries(marketTrades.map((trade) => [trade.productKey, trade.quantity])),
          marketCents: Number(marketCents),
        };
        return {
          next: {
            ...current,
            turns: current.turns - plan.turns,
            cashCents: current.cashCents - cashCents - marketCents,
            beer: current.beer - input.beer,
            lowRiders: current.lowRiders - input.lowRiders,
            thugs: current.thugs - input.escortThugs,
            crack: current.crack - (fromHome[CRACK] ?? 0),
            pistols: current.pistols - guns.pistols,
            shotguns: current.shotguns - guns.shotguns,
            tek9s: current.tek9s - guns.tek9s,
            ak47s: current.ak47s - guns.ak47s,
            awayNetWorthCents: current.awayNetWorthCents
              + awayWorth(ruleset, { cashCents, beer: input.beer, lowRiders: input.lowRiders, escortThugs: input.escortThugs, ...guns }, cargo),
          },
          result,
          ledger: marketTrades.map((trade) => ({
            source: 'RUN_LAUNCH',
            label: `Home market buy · ${productName(ruleset, trade.productKey)}`,
            amountCents: -trade.totalCents,
          })),
          activity: { type: 'RUN_LAUNCHED', payload: { ...result, cities: [cityName(ruleset, input.to)] } },
        };
      },
    });
  },

  /**
   * Buy or sell in the town the run is in, out of the run's wallet and trunk: at Pip's
   * counter, or (0.5.0-C) on the high market, which the whole round shares. Selling
   * draws Heat by the town's police pressure, and every trade risks the town's bust or
   * arrest at the Heat the run walked in with. `rng` is for tests.
   */
  trade(prisma: PrismaClient, roundPlayerId: string, rawInput: unknown, rng?: Rng): Promise<GameActionResult<RunTradeResult>> {
    const input = runTradeSchema.parse(rawInput);
    return ActionService.run<RunTradeResult>(prisma, roundPlayerId, {
      action: 'RUN_TRADE',
      actionId: input.actionId,
      execute: async ({ tx, current, round, now }) => {
        // The round's own rules, not the home city's: the town decides busts and arrests here.
        const base = loadRulesetForRound(round);
        requireRuns(base);
        const seed = round.id;
        const run = await requireActiveRun(tx, roundPlayerId, input.runId);
        const stops = toStopPlans(run.stops);
        const position = runPosition(base, stops, now);
        if (position.phase !== 'town') {
          throw AppError.conflict('NOT_IN_TOWN', position.phase === 'road' ? `The run is still on the road to ${cityName(base, position.city)}.` : 'The run is home.');
        }
        const city = position.city;
        const name = productName(base, input.product);
        if (!productKeys(base).includes(input.product)) throw AppError.badRequest('UNKNOWN_PRODUCT', 'That product is not part of this round.', { product: 'Pick a product.' });
        const cargo = cargoOf(run);
        const capacity = runCapacity(base, run.lowRiders);
        const buying = input.direction === 'buy';
        let unitCents: number;
        let totalCents: bigint;
        let shelfStock = 0;

        if (input.venue === 'market') {
          const rules = base.travel?.market;
          if (!rules) throw AppError.conflict('NO_MARKET', 'There is no high market this round.');
          // Locked after the player, one market per trade: two runs selling here line up.
          const market = await HighMarketService.lock(tx, base, seed, city, input.product, now);
          const view = marketView(base, seed, city, input.product, market.push, now);
          if (!view) throw AppError.badRequest('NO_MARKET_PRICE', `Nobody in ${cityName(base, city)} deals ${name} in bulk.`, { product: 'No market for it here.' });
          const fill = fillMarket(view, rules, input.direction, input.quantity);
          if (input.quoteCents !== undefined && quoteMoved(rules, input.direction, input.quoteCents, fill.firstUnitCents)) {
            throw AppError.conflict('PRICE_MOVED', `The price moved: ${name} now ${buying ? 'costs' : 'pays'} $${(fill.firstUnitCents / 100).toLocaleString('en-US')} a unit. Check it and try again.`);
          }
          if (buying) {
            if (fill.totalCents > run.cashCents) {
              throw AppError.badRequest('NOT_ENOUGH_CASH', `That is $${(Number(fill.totalCents) / 100).toLocaleString('en-US')}, and the run only carries $${(Number(run.cashCents) / 100).toLocaleString('en-US')}.`, { quantity: 'Not enough cash in the car.' });
            }
            const room = Math.max(0, capacity - cargoUnits(cargo));
            if (input.quantity > room) throw AppError.badRequest('TRUNK_FULL', room === 0 ? 'The trunk is full.' : `There is only room for ${room.toLocaleString('en-US')} more.`, { quantity: `At most ${room}.` });
          } else if (input.quantity > (cargo[input.product] ?? 0)) {
            const held = cargo[input.product] ?? 0;
            throw AppError.badRequest('NOT_ENOUGH_PRODUCT', held === 0 ? `There is no ${name} in the trunk.` : `The trunk only has ${held.toLocaleString('en-US')} ${name}.`, { quantity: `At most ${held}.` });
          }
          await HighMarketService.write(tx, market.id, fill.pushAfter, now);
          totalCents = fill.totalCents;
          unitCents = Math.round(Number(fill.totalCents) / input.quantity);
        } else {
          const shelfRow = await tx.cityShelf.findUnique({ where: { roundPlayerId_city_productKey: { roundPlayerId, city, productKey: input.product } } });
          const shelf = settleLiveShelf(shelfRow, base, seed, city, input.product, now);
          let trade;
          try {
            trade = calculateCityTrade({
              ruleset: base, city, product: input.product, direction: input.direction, quantity: input.quantity, counter: shelf.counter,
              runCashCents: run.cashCents, held: cargo[input.product] ?? 0, trunkUnits: cargoUnits(cargo), capacity, shelfStock: shelf.stock,
            });
          } catch (error) { refuse(error); }
          if (shelf.counter) {
            // A sale never touches the shelf, but settling it is still kept, or a parked clock is lost.
            shelfStock = shelf.stock - trade.stockTaken;
            await tx.cityShelf.upsert({
              where: { roundPlayerId_city_productKey: { roundPlayerId, city, productKey: input.product } },
              create: { roundPlayerId, city, productKey: input.product, stock: shelfStock, stockAt: shelf.stockAt },
              update: { stock: shelfStock, stockAt: shelf.stockAt },
            });
          }
          totalCents = trade.totalCents;
          unitCents = trade.unitCents;
        }

        const cashCents = buying ? run.cashCents - totalCents : run.cashCents + totalCents;
        const held = (cargo[input.product] ?? 0) + (buying ? input.quantity : -input.quantity);
        await tx.run.update({ where: { id: run.id }, data: { cashCents } });
        await tx.runCargo.upsert({
          where: { runId_productKey: { runId: run.id, productKey: input.product } },
          create: { runId: run.id, productKey: input.product, quantity: held, startQuantity: 0 },
          update: { quantity: held },
        });
        await tx.runTrade.create({
          data: { runId: run.id, city, productKey: input.product, direction: input.direction, venue: input.venue, quantity: input.quantity, unitCents, totalCents, createdAt: now },
        });

        // The town's police, at the Heat the run walked in with; the sale's own Heat lands after.
        const town = rulesetForCity(base, city);
        let traded = await requireActiveRun(tx, roundPlayerId, input.runId);
        const roll = town.heat
          ? resolveRunTrouble({ heat: current.heat, cashCents: traded.cashCents, cargo: cargoOf(traded), ruleset: town, bustChance: bustChance(current.heat, town), rng: rng ?? Math.random })
          : null;
        const added = !buying ? saleHeat(base, city, totalCents) : 0;
        const heatAfter = town.heat ? addHeat(roll?.kind ? roll.heatAfter : current.heat, added, town.heat) : current.heat;
        let trouble: RunTradeResult['trouble'] = null;
        if (roll?.kind) {
          traded = await takeFromRun(tx, roundPlayerId, base, traded, roll);
          // 0.5.0-E: busted or arrested, the escorts lose every gun they carried.
          const guns = { PISTOL: traded.pistols, SHOTGUN: traded.shotguns, TEK9: traded.tek9s, AK47: traded.ak47s };
          if (Object.values(guns).some((count) => count > 0)) {
            traded = { ...traded, pistols: 0, shotguns: 0, tek9s: 0, ak47s: 0 };
            await tx.run.update({ where: { id: run.id }, data: { pistols: 0, shotguns: 0, tek9s: 0, ak47s: 0 } });
          }
          const seized = { ...roll.seized, ...Object.fromEntries(Object.entries(guns).filter(([, count]) => count > 0)) };
          const incident = await tx.runIncident.create({
            data: { runId: run.id, kind: roll.kind, city, road: null, seized, fineCents: roll.fineCents, at: now },
          });
          trouble = toIncidentDto(base, incident);
          await ActivityService.log(tx, roundPlayerId, 'RUN_INCIDENT', { runId: run.id, ...trouble } as unknown as Prisma.InputJsonValue);
          // An arrest ends the trip: the crew is let go with the empty car and drives home.
          if (roll.kind === 'ARREST') await writeStops(tx, run.id, planHeadHome(base, stops, now));
        }

        // The crew saw the counter and the market as they left them.
        await tx.citySighting.deleteMany({ where: { roundPlayerId, city } });
        await recordSighting(tx, roundPlayerId, base, seed, city, now);

        const nextCargo = cargoOf(traded);
        const awayNetWorthCents = await totalAwayWorth(tx, roundPlayerId, base);
        return {
          next: {
            ...current,
            heat: heatAfter,
            awayNetWorthCents,
          },
          result: {
            city,
            cityName: cityName(base, city),
            product: input.product,
            productName: name,
            direction: input.direction,
            venue: input.venue,
            quantity: input.quantity,
            unitCents,
            totalCents: Number(totalCents),
            runCashCents: Number(traded.cashCents),
            held: nextCargo[input.product] ?? 0,
            trunkUnits: cargoUnits(nextCargo),
            capacity,
            shelfStock,
            heat: town.heat ? { before: current.heat, added, after: heatAfter } : null,
            trouble,
          },
          ledger: [
            {
              source: 'RUN_TRADE',
              label: `${cityName(base, city)} · ${input.venue === 'market' ? 'high market' : 'Pip'} ${buying ? 'buy' : 'sale'} · ${name}`,
              amountCents: buying ? -totalCents : totalCents,
            },
            ...(trouble?.fineCents ? [{
              source: 'RUN_INCIDENT',
              label: `${cityName(base, city)} road fine`,
              amountCents: -BigInt(trouble.fineCents),
            }] : []),
          ],
          questProgress: {
            type: 'RUN_TRADE',
            payload: {
              city,
              product: input.product,
              direction: input.direction,
              venue: input.venue,
              quantity: input.quantity,
              totalCents: Number(totalCents),
            },
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
        const run = await requireActiveRun(tx, roundPlayerId, input.runId);
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
        const run = await requireActiveRun(tx, roundPlayerId, input.runId);
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

