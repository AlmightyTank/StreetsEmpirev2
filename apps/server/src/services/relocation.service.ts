import type { Prisma, PrismaClient, RoundPlayer } from '@prisma/client';
import {
  checkMove,
  findRoutes,
  heatThere,
  loadRulesetForRound,
  relocationRules,
  rulesetForCity,
  type MoveCheck,
  type Ruleset,
} from '@streets/rules-engine';
import { relocationSchema, type GameActionResult, type RelocationDto, type RelocationResult, type RelocationTurfPlanDto } from '@streets/shared';
import { lockRoundPlayer, type Db } from '../utils/db.js';
import { AppError } from '../utils/errors.js';
import { ActionService } from './action.service.js';
import { ActivityService } from './activity.service.js';
import { ProductInventoryService } from './product-inventory.service.js';
import {
  TurfService,
  addCornerGuns,
  cornerGunWorthCents,
  gunsFromTurf,
  localsReclaimAt,
  outpostBoxWorthCents,
  turfGunData,
  type CornerGuns,
} from './turf.service.js';
import { recordTerritoryControlChange, territoryControlForCity } from './turf-territory.service.js';

const cityName = (ruleset: Ruleset, slug: string) => ruleset.cities?.[slug]?.name ?? slug;

const EMPTY_GUNS: CornerGuns = { pistols: 0, shotguns: 0, tek9s: 0, ak47s: 0 };
const districtName = (ruleset: Ruleset, city: string, district: string) =>
  ruleset.cities?.[city]?.districts?.[district as keyof Ruleset['districts']]?.name
  ?? ruleset.districts[district as keyof Ruleset['districts']]?.name
  ?? district;

async function heldTurf(db: Db | PrismaClient, playerId: string) {
  return db.turf.findMany({
    where: { holderId: playerId },
    include: { city: { select: { id: true, slug: true } }, outpost: true },
    orderBy: [{ heldSince: 'asc' }, { district: 'asc' }],
  });
}

function turfPlan(
  rows: Awaited<ReturnType<typeof heldTurf>>,
  ruleset: Ruleset,
  fromCity: string,
  toCity: string,
): RelocationTurfPlanDto {
  if (!ruleset.turf?.outposts) return { toHome: [], toOutposts: [], released: [] };
  const destination = rows.filter((row) => row.city.slug === toCity);
  const oldHome = rows.filter((row) => row.city.slug === fromCity);
  const alreadyAwayElsewhere = rows.filter((row) => row.city.slug !== fromCity && row.city.slug !== toCity).length;
  const room = Math.max(0, ruleset.turf.caps.blocksPerCrewAway - alreadyAwayElsewhere);
  const keep = oldHome.slice(0, room);
  const release = oldHome.slice(room);
  const dto = (city: string, row: (typeof rows)[number]) => ({
    district: row.district as RelocationTurfPlanDto['toHome'][number]['district'],
    districtName: districtName(ruleset, city, row.district),
  });
  return {
    toHome: destination.map((row) => dto(toCity, row)),
    toOutposts: keep.map((row) => dto(fromCity, row)),
    released: release.map((row) => dto(fromCity, row)),
  };
}

async function finishMove(tx: Db, roundPlayerId: string, move: { id: string; fromCity: string; toCity: string; arrivesAt: Date }): Promise<RelocationTurfPlanDto> {
  const loaded = await tx.roundPlayer.findUniqueOrThrow({
    where: { id: roundPlayerId },
    include: { city: true, round: true },
  });
  const base = loadRulesetForRound(loaded.round);
  const destination = await tx.city.findUniqueOrThrow({ where: { slug: move.toCity }, select: { id: true } });

  // Settle the old arrangement exactly at arrival before deciding which blocks convert.
  if (base.turf?.holding) {
    await TurfService.settlePlayer(tx, roundPlayerId, rulesetForCity(base, move.fromCity), move.arrivesAt);
  }
  const player = await tx.roundPlayer.findUniqueOrThrow({ where: { id: roundPlayerId } });
  const rows = await heldTurf(tx, roundPlayerId);
  const plan = turfPlan(rows, base, move.fromCity, move.toCity);

  let boxCash = 0n;
  let boxBeer = 0;
  const boxProducts: Record<string, number> = {};
  let returnedThugs = 0;
  let returnedGuns: CornerGuns = { ...EMPTY_GUNS };

  if (base.turf?.outposts) {
    const oldCityControl = plan.released.length
      ? await territoryControlForCity(tx, loaded.round.id, loaded.cityId, base)
      : null;
    const homeDistricts = new Set(plan.toHome.map((entry) => entry.district));
    const keepDistricts = new Set(plan.toOutposts.map((entry) => entry.district));
    const releaseDistricts = new Set(plan.released.map((entry) => entry.district));

    for (const row of rows) {
      if (row.city.slug === move.toCity && homeDistricts.has(row.district as any)) {
        if (row.outpost) {
          boxCash += row.outpost.cashCents;
          boxBeer += row.outpost.beer;
          for (const [key, quantity] of Object.entries(row.outpost.products as Record<string, number>)) {
            boxProducts[key] = (boxProducts[key] ?? 0) + quantity;
          }
          await tx.turfOutpost.delete({ where: { id: row.outpost.id } });
        }
        await tx.turf.update({ where: { id: row.id }, data: { upkeepAt: move.arrivesAt } });
      } else if (row.city.slug === move.fromCity && keepDistricts.has(row.district as any)) {
        await tx.turfOutpost.upsert({
          where: { turfId: row.id },
          create: { turfId: row.id, ownerId: roundPlayerId },
          update: { ownerId: roundPlayerId },
        });
        await tx.turf.update({ where: { id: row.id }, data: { upkeepAt: move.arrivesAt } });
      } else if (row.city.slug === move.fromCity && releaseDistricts.has(row.district as any)) {
        returnedThugs += row.cornerThugs;
        returnedGuns = addCornerGuns(returnedGuns, gunsFromTurf(row));
        if (row.outpost) await tx.turfOutpost.delete({ where: { id: row.outpost.id } });
        await tx.turf.update({
          where: { id: row.id },
          data: {
            holderId: null,
            cornerThugs: 0,
            ...turfGunData(EMPTY_GUNS),
            heldSince: null,
            shieldUntil: null,
            upkeepAt: move.arrivesAt,
            localsThugs: 0,
            localsAt: move.arrivesAt,
            localsReclaimAt: localsReclaimAt(base, move.arrivesAt),
          },
        });
      }
    }
    if (plan.released.length) {
      await recordTerritoryControlChange(tx, {
        roundId: loaded.round.id,
        cityId: loaded.cityId,
        ruleset: base,
        before: oldCityControl,
        at: move.arrivesAt,
      });
    }
  }

  if (Object.values(boxProducts).some((quantity) => quantity > 0)) {
    await ProductInventoryService.adjust(tx, roundPlayerId, base, boxProducts);
  }

  const postedWorthReturned = cornerGunWorthCents(base, returnedGuns);
  const remainingBoxes = await tx.turfOutpost.findMany({
    where: { ownerId: roundPlayerId },
    select: { cashCents: true, beer: true, products: true },
  });
  const outpostNetWorthCents = remainingBoxes.reduce(
    (sum, box) => sum + outpostBoxWorthCents(base, {
      cashCents: box.cashCents,
      beer: box.beer,
      products: box.products as Record<string, number>,
    }),
    0n,
  );

  await tx.roundPlayer.update({
    where: { id: roundPlayerId },
    data: {
      cityId: destination.id,
      movingUntil: null,
      cashCents: player.cashCents + boxCash,
      beer: player.beer + boxBeer,
      postedThugs: Math.max(0, player.postedThugs - returnedThugs),
      postedNetWorthCents: player.postedNetWorthCents >= postedWorthReturned
        ? player.postedNetWorthCents - postedWorthReturned
        : 0n,
      outpostNetWorthCents,
      pistols: player.pistols + returnedGuns.pistols,
      shotguns: player.shotguns + returnedGuns.shotguns,
      tek9s: player.tek9s + returnedGuns.tek9s,
      ak47s: player.ak47s + returnedGuns.ak47s,
    },
  });
  await tx.relocation.update({ where: { id: move.id }, data: { arrivedAt: move.arrivesAt } });
  await ActivityService.log(tx, roundPlayerId, 'RELOCATED', {
    from: move.fromCity,
    to: move.toCity,
    arrivedAt: move.arrivesAt.toISOString(),
    turfPlan: plan,
  } as unknown as Prisma.InputJsonValue);
  return plan;
}

/** When the last revenge window anyone holds on this player closes, if one is still open. */
async function revengeOpenUntil(db: Db | PrismaClient, ruleset: Ruleset, playerId: string, now: Date): Promise<Date | null> {
  const hours = ruleset.combat?.strategy?.retaliation.revengeHours ?? 0;
  if (hours <= 0) return null;
  const since = new Date(now.getTime() - hours * 3_600_000);
  const last = await db.raidBattle.findFirst({
    where: { attackerId: playerId, createdAt: { gte: since }, voidedAt: null },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });
  return last ? new Date(last.createdAt.getTime() + hours * 3_600_000) : null;
}

/** Everything `checkMove` needs from the database, for a player as they stand. */
async function moveInputs(db: Db | PrismaClient, ruleset: Ruleset, player: RoundPlayer, now: Date) {
  const [lastMove, run, revenge] = await Promise.all([
    db.relocation.findFirst({ where: { roundPlayerId: player.id }, orderBy: { startedAt: 'desc' }, select: { startedAt: true } }),
    db.run.findFirst({ where: { roundPlayerId: player.id, status: 'ACTIVE' }, select: { id: true } }),
    revengeOpenUntil(db, ruleset, player.id, now),
  ]);
  return { lastMoveAt: lastMove?.startedAt ?? null, runOut: Boolean(run), revengeOpenUntil: revenge };
}

async function turfMoveBlock(db: Db | PrismaClient, ruleset: Ruleset, playerId: string): Promise<{ code: string; reason: string } | null> {
  if (!ruleset.turf?.holding) return null;
  const [held, activeFight] = await Promise.all([
    db.turf.count({ where: { holderId: playerId } }),
    ruleset.turf.wars
      ? db.turfPush.count({
          where: {
            status: 'PENDING',
            OR: [
              { attackerId: playerId },
              { defenderId: playerId },
              { backups: { some: { playerId } } },
            ],
          },
        })
      : 0,
  ]);
  if (activeFight > 0) {
    return { code: 'TURF_FIGHT_ACTIVE', reason: 'Finish your pending turf fight before moving to another city.' };
  }
  if (held > 0 && !ruleset.turf.outposts) {
    return { code: 'TURF_MOVE_BLOCKED', reason: 'Pull your turf before moving in this ruleset.' };
  }
  return null;
}

function refusal(check: MoveCheck): AppError {
  const code = check.code ?? 'MOVE_BLOCKED';
  const message = check.blockedReason ?? 'You cannot move right now.';
  return code === 'UNKNOWN_CITY' || code === 'ALREADY_HOME' || code === 'NOT_ENOUGH_CASH'
    ? AppError.badRequest(code, message, { to: message })
    : AppError.conflict(code, message);
}

/**
 * 0.5.0-D. Moving the whole operation to another city.
 *
 * A move is a Relocation row and `RoundPlayer.movingUntil`. The player's `cityId`
 * changes only when the truck arrives, so until then they are still a target, ranked
 * and listed in the old city, and a move can never be used to slip out of a fight.
 * Arrival settles lazily: the player's own settle brings them in, and `settleDue` brings
 * in anyone due before a city-wide list is read.
 */
export const RelocationService = {
  /** Bring a player's move in if it has arrived. Called under their lock, before they are read. */
  async settleOwn(tx: Db, roundPlayerId: string, now: Date): Promise<void> {
    const move = await tx.relocation.findFirst({ where: { roundPlayerId, arrivedAt: null, arrivesAt: { lte: now } } });
    if (!move) return;
    await finishMove(tx, roundPlayerId, move);
  },

  /**
   * Bring in every move in a round that has arrived, before a city-wide list (targets,
   * local ranks, the city feed) is read. Rows another transaction holds are skipped,
   * never waited on: that player is being settled right now anyway, and a list read a
   * moment early is fine. So this can run anywhere without a deadlock.
   */
  async settleDue(db: Db | PrismaClient, roundId: string, now: Date): Promise<void> {
    const due = await db.relocation.findMany({
      where: { arrivedAt: null, arrivesAt: { lte: now }, roundPlayer: { roundId } },
      select: { id: true, roundPlayerId: true },
      orderBy: { arrivesAt: 'asc' },
      take: 100,
    });
    const settleOne = async (tx: Db, candidate: { id: string; roundPlayerId: string }) => {
      await lockRoundPlayer(tx, candidate.roundPlayerId);
      const move = await tx.relocation.findUnique({ where: { id: candidate.id } });
      if (!move || move.arrivedAt || move.arrivesAt > now) return;
      await finishMove(tx, candidate.roundPlayerId, move);
    };
    for (const candidate of due) {
      if ('$transaction' in db) {
        await db.$transaction((tx) => settleOne(tx, candidate), { timeout: 15_000, maxWait: 10_000 });
      } else {
        // Round-finalization already owns this transaction, so reuse its lock scope.
        await settleOne(db, candidate);
      }
    }
  },

  /** What the move screen shows: the fee, the time on the road, what stops a move, and what Heat means in every city. */
  async page(db: Db | PrismaClient, player: RoundPlayer & { city: { slug: string } }, ruleset: Ruleset, roundEndsAt: Date, heat: number, now: Date): Promise<RelocationDto | null> {
    const rules = relocationRules(ruleset);
    if (!rules) return null;
    const home = player.city.slug;
    const [inputs, turfBlock, pending] = await Promise.all([
      moveInputs(db, ruleset, player, now),
      turfMoveBlock(db, ruleset, player.id),
      db.relocation.findFirst({ where: { roundPlayerId: player.id, arrivedAt: null }, orderBy: { startedAt: 'desc' } }),
    ]);
    const base = { from: home, now, netWorthCents: player.netWorthCents, cashCents: player.cashCents, roundEndsAt, movingUntil: player.movingUntil, lockedUntil: player.lockedUntil, ...inputs };
    const held = await heldTurf(db, player.id);
    const turfPlans = Object.fromEntries(
      Object.keys(ruleset.cities ?? {}).filter((slug) => slug !== home)
        .map((slug) => [slug, turfPlan(held, ruleset, home, slug)]),
    );
    const here = heatThere(ruleset, heat, home);
    // Any city but home shows the same general reason; the per-city ones (no road) are rare.
    const general = checkMove(ruleset, { ...base, to: Object.keys(ruleset.cities ?? {}).find((slug) => slug !== home) ?? home });
    return {
      feeCents: Number(general.feeCents),
      feeFloorCents: rules.feeFloorCents,
      feeNetWorthFraction: rules.feeNetWorthFraction,
      downtimeMinutes: rules.downtimeMinutes,
      cooldownHours: rules.cooldownHours,
      cooldownUntil: general.cooldownUntil?.toISOString() ?? null,
      cutoffAt: general.cutoffAt.toISOString(),
      blockedReason: turfBlock?.reason ?? general.blockedReason,
      blockedCode: turfBlock?.code ?? general.code,
      blockedUntil: general.blockedUntil?.toISOString() ?? null,
      moving: pending ? { from: pending.fromCity, fromName: cityName(ruleset, pending.fromCity), to: pending.toCity, toName: cityName(ruleset, pending.toCity), startedAt: pending.startedAt.toISOString(), arrivesAt: pending.arrivesAt.toISOString() } : null,
      heat,
      here,
      destinations: Object.keys(ruleset.cities ?? {}).filter((slug) => slug !== home).map((slug) => ({
        slug,
        name: cityName(ruleset, slug),
        heat: heatThere(ruleset, heat, slug),
        reachable: findRoutes(ruleset, home, slug).length > 0,
      })),
      turfPlans,
    };
  },

  /**
   * Start a move: the fee leaves home cash, and the truck is on the road until
   * `arrivesAt`. Nothing else the player owns changes; it all arrives with them.
   */
  move(prisma: PrismaClient, roundPlayerId: string, rawInput: unknown): Promise<GameActionResult<RelocationResult>> {
    const input = relocationSchema.parse(rawInput);
    return ActionService.run<RelocationResult>(prisma, roundPlayerId, {
      action: 'RELOCATE',
      actionId: input.actionId,
      execute: async ({ tx, current, player, round, now }) => {
        // The round's rules for the check: the destination's own rules apply on arrival.
        const base = loadRulesetForRound(round);
        const [inputs, turfBlock, held] = await Promise.all([
          moveInputs(tx, base, player, now),
          turfMoveBlock(tx, base, roundPlayerId),
          heldTurf(tx, roundPlayerId),
        ]);
        if (turfBlock) throw AppError.conflict(turfBlock.code, turfBlock.reason);
        const check = checkMove(base, {
          from: player.city.slug, to: input.to, now, netWorthCents: player.netWorthCents, cashCents: current.cashCents,
          roundEndsAt: round.endsAt, movingUntil: player.movingUntil, lockedUntil: player.lockedUntil, ...inputs,
        });
        if (check.blockedReason) throw refusal(check);
        const to = await tx.city.findUnique({ where: { slug: input.to }, select: { isEnabled: true } });
        if (!to?.isEnabled) throw AppError.badRequest('UNKNOWN_CITY', 'That city is not on the map.', { to: 'Pick a city.' });

        await tx.relocation.create({
          data: { roundPlayerId, fromCity: player.city.slug, toCity: input.to, feeCents: check.feeCents, startedAt: now, arrivesAt: check.arrivesAt },
        });
        const result: RelocationResult = {
          from: player.city.slug,
          fromName: cityName(base, player.city.slug),
          to: input.to,
          toName: cityName(base, input.to),
          feeCents: Number(check.feeCents),
          arrivesAt: check.arrivesAt.toISOString(),
          turfPlan: turfPlan(held, base, player.city.slug, input.to),
        };
        return {
          next: { ...current, cashCents: current.cashCents - check.feeCents, movingUntil: check.arrivesAt },
          result,
          activity: { type: 'RELOCATION_STARTED', payload: result as unknown as Prisma.InputJsonValue },
        };
      },
    });
  },
};
