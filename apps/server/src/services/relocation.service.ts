import type { Prisma, PrismaClient, RoundPlayer } from '@prisma/client';
import {
  checkMove,
  findRoutes,
  heatThere,
  loadRulesetForRound,
  relocationRules,
  type MoveCheck,
  type Ruleset,
} from '@streets/rules-engine';
import { relocationSchema, type GameActionResult, type RelocationDto, type RelocationResult } from '@streets/shared';
import type { Db } from '../utils/db.js';
import { AppError } from '../utils/errors.js';
import { ActionService } from './action.service.js';
import { ActivityService } from './activity.service.js';

const cityName = (ruleset: Ruleset, slug: string) => ruleset.cities?.[slug]?.name ?? slug;

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
  if (held > 0) {
    return { code: 'TURF_MOVE_BLOCKED', reason: 'Pull your home turf before moving. Outposts arrive in 0.6.0-D.' };
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
    const city = await tx.city.findUniqueOrThrow({ where: { slug: move.toCity }, select: { id: true } });
    await tx.roundPlayer.update({ where: { id: roundPlayerId }, data: { cityId: city.id, movingUntil: null } });
    await tx.relocation.update({ where: { id: move.id }, data: { arrivedAt: move.arrivesAt } });
    await ActivityService.log(tx, roundPlayerId, 'RELOCATED', { from: move.fromCity, to: move.toCity, arrivedAt: move.arrivesAt.toISOString() });
  },

  /**
   * Bring in every move in a round that has arrived, before a city-wide list (targets,
   * local ranks, the city feed) is read. Rows another transaction holds are skipped,
   * never waited on: that player is being settled right now anyway, and a list read a
   * moment early is fine. So this can run anywhere without a deadlock.
   */
  async settleDue(db: Db | PrismaClient, roundId: string, now: Date): Promise<void> {
    await db.$executeRaw`
      WITH due AS (
        SELECT r."id", r."roundPlayerId", r."toCity", r."arrivesAt"
        FROM "Relocation" r
        JOIN "RoundPlayer" p ON p."id" = r."roundPlayerId"
        WHERE r."arrivedAt" IS NULL AND r."arrivesAt" <= ${now} AND p."roundId" = ${roundId}
        FOR UPDATE OF r, p SKIP LOCKED
      ), moved AS (
        UPDATE "RoundPlayer" p SET "cityId" = c."id", "movingUntil" = NULL
        FROM due JOIN "City" c ON c."slug" = due."toCity"
        WHERE p."id" = due."roundPlayerId"
        RETURNING p."id"
      )
      UPDATE "Relocation" r SET "arrivedAt" = due."arrivesAt"
      FROM due WHERE r."id" = due."id"`;
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
        const [inputs, turfBlock] = await Promise.all([
          moveInputs(tx, base, player, now),
          turfMoveBlock(tx, base, roundPlayerId),
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
