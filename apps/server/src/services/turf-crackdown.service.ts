import type { Prisma, PrismaClient, Round } from '@prisma/client';
import { hashParts, rulesetForCity, type Ruleset } from '@streets/rules-engine';
import { lockRound, type Db } from '../utils/db.js';
import { PlayerStateService } from './player-state.service.js';
import {
  cornerGunWorthCents,
  gunsFromTurf,
  releaseCornerGuns,
  subtractCornerGuns,
  turfGunData,
  TurfService,
} from './turf.service.js';

const HOUR_MS = 3_600_000;

export interface TurfCrackdownHolderResult {
  roundPlayerId: string;
  publicPimpId: number;
  displayName: string;
  blocks: number;
  pickedUp: number;
  heatAdded: number;
}

function schedule(round: Pick<Round, 'startsAt' | 'endsAt'>, ruleset: Ruleset) {
  const rules = ruleset.turf?.crackdown;
  if (!rules) return null;
  const sweepAt = new Date(Math.max(
    round.startsAt.getTime(),
    round.endsAt.getTime() - rules.hoursBeforeRoundEnd * HOUR_MS,
  ));
  const warningAt = new Date(Math.max(
    round.startsAt.getTime(),
    sweepAt.getTime() - rules.warningHours * HOUR_MS,
  ));
  return { warningAt, sweepAt };
}

function targetCitySlug(roundId: string, ruleset: Ruleset): string | null {
  const cities = Object.keys(ruleset.cities ?? {});
  if (!cities.length) return null;
  return cities[hashParts(roundId, ruleset.meta.id, 'turf-crackdown-city') % cities.length] ?? null;
}

async function ensureEvent(tx: Db, round: Round, ruleset: Ruleset) {
  const times = schedule(round, ruleset);
  const slug = targetCitySlug(round.id, ruleset);
  if (!times || !slug) return null;

  const existing = await tx.turfCrackdown.findUnique({
    where: { roundId: round.id },
    include: { city: { select: { slug: true, name: true } } },
  });
  if (existing) return existing;

  const city = await tx.city.findUnique({ where: { slug }, select: { id: true, slug: true, name: true } });
  if (!city) return null;
  return tx.turfCrackdown.create({
    data: {
      roundId: round.id,
      cityId: city.id,
      warningAt: times.warningAt,
      sweepAt: times.sweepAt,
    },
    include: { city: { select: { slug: true, name: true } } },
  });
}

function pickupCount(cornerThugs: number, ruleset: Ruleset): number {
  const rules = ruleset.turf?.crackdown;
  if (!rules || cornerThugs <= rules.minimumCornerSurvivors) return 0;
  const wanted = Math.max(1, Math.floor(cornerThugs * rules.pickupShare));
  return Math.min(
    wanted,
    rules.maxPickedUpPerBlock,
    cornerThugs - rules.minimumCornerSurvivors,
  );
}

export const TurfCrackdownService = {
  schedule,
  targetCitySlug,
  pickupCount,

  /**
   * Apply a due sweep inside the caller's transaction. A unique round event plus
   * the round row lock makes retries harmless.
   */
  async settleInTransaction(tx: Db, round: Round, ruleset: Ruleset, now = new Date()) {
    const rules = ruleset.turf?.crackdown;
    if (!rules || !ruleset.turf?.holding || round.status !== 'ACTIVE') return null;

    const event = await ensureEvent(tx, round, ruleset);
    if (!event || event.sweptAt || event.sweepAt > now) return event;

    await TurfService.ensureRound(tx, round.id, ruleset);

    // Settle every current holder to the event clock first: supply walkouts,
    // pending turf credit, Heat decay and net worth are all current before Feds hit.
    const holderRows = await tx.turf.findMany({
      where: { roundId: round.id, cityId: event.cityId, holderId: { not: null }, cornerThugs: { gt: 0 } },
      select: { holderId: true },
      orderBy: { holderId: 'asc' },
    });
    const holderIds = [...new Set(holderRows.map((row) => row.holderId).filter((id): id is string => Boolean(id)))].sort();
    for (const holderId of holderIds) {
      await PlayerStateService.settleInTransaction(tx, holderId, { now: event.sweepAt, markActive: false });
    }

    const blocks = await tx.turf.findMany({
      where: { roundId: round.id, cityId: event.cityId, holderId: { not: null }, cornerThugs: { gt: 0 } },
      include: {
        holder: {
          select: {
            id: true,
            publicPimpId: true,
            displayName: true,
            city: { select: { slug: true } },
          },
        },
      },
      orderBy: [{ holderId: 'asc' }, { district: 'asc' }],
    });

    const byHolder = new Map<string, {
      publicPimpId: number;
      displayName: string;
      citySlug: string;
      blocks: number;
      pickedUp: number;
      seizedWorth: bigint;
    }>();

    for (const block of blocks) {
      if (!block.holder) continue;
      const pickedUp = pickupCount(block.cornerThugs, ruleset);
      const current = byHolder.get(block.holder.id) ?? {
        publicPimpId: block.holder.publicPimpId,
        displayName: block.holder.displayName,
        citySlug: block.holder.city.slug,
        blocks: 0,
        pickedUp: 0,
        seizedWorth: 0n,
      };
      // Heat is for holding the corner when the sweep lands, even if the
      // minimum-survivor rule means this particular block loses no thugs.
      current.blocks += 1;

      if (pickedUp > 0) {
        const before = gunsFromTurf(block);
        const seized = releaseCornerGuns(before, pickedUp);
        const after = subtractCornerGuns(before, seized);
        await tx.turf.update({
          where: { id: block.id },
          data: {
            cornerThugs: block.cornerThugs - pickedUp,
            ...turfGunData(after),
          },
        });
        current.pickedUp += pickedUp;
        current.seizedWorth += cornerGunWorthCents(ruleset, seized);
      }
      byHolder.set(block.holder.id, current);
    }

    const results: TurfCrackdownHolderResult[] = [];
    for (const [holderId, loss] of [...byHolder.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      const player = await tx.roundPlayer.findUniqueOrThrow({
        where: { id: holderId },
        select: {
          heat: true,
          thugs: true,
          postedThugs: true,
          postedNetWorthCents: true,
          netWorthCents: true,
        },
      });
      const living = rulesetForCity(ruleset, loss.citySlug);
      const requestedHeat = rules.heatPerHeldBlock * loss.blocks;
      const heat = Math.min(living.heat?.max ?? 100, player.heat + requestedHeat);
      const heatAdded = Math.max(0, heat - player.heat);
      const thugWorth = BigInt(loss.pickedUp) * BigInt(ruleset.economy.netWorth.perThugCents);
      const lostWorth = thugWorth + loss.seizedWorth;

      await tx.roundPlayer.update({
        where: { id: holderId },
        data: {
          heat,
          thugs: Math.max(0, player.thugs - loss.pickedUp),
          postedThugs: Math.max(0, player.postedThugs - loss.pickedUp),
          postedNetWorthCents: player.postedNetWorthCents > loss.seizedWorth
            ? player.postedNetWorthCents - loss.seizedWorth
            : 0n,
          netWorthCents: player.netWorthCents > lostWorth ? player.netWorthCents - lostWorth : 0n,
        },
      });

      results.push({
        roundPlayerId: holderId,
        publicPimpId: loss.publicPimpId,
        displayName: loss.displayName,
        blocks: loss.blocks,
        pickedUp: loss.pickedUp,
        heatAdded,
      });
    }

    const thugsPickedUp = results.reduce((sum, row) => sum + row.pickedUp, 0);
    return tx.turfCrackdown.update({
      where: { id: event.id },
      data: {
        sweptAt: event.sweepAt,
        holdersAffected: results.length,
        thugsPickedUp,
        results: results as unknown as Prisma.InputJsonValue,
      },
      include: { city: { select: { slug: true, name: true } } },
    });
  },

  async settleDue(prisma: PrismaClient, round: Round, ruleset: Ruleset, now = new Date()) {
    if (!ruleset.turf?.crackdown || round.status !== 'ACTIVE') return null;
    return prisma.$transaction(async (tx) => {
      await lockRound(tx, round.id);
      const fresh = await tx.round.findUnique({ where: { id: round.id } });
      if (!fresh) return null;
      return TurfCrackdownService.settleInTransaction(tx, fresh, ruleset, now);
    }, { maxWait: 10_000, timeout: 60_000 });
  },
};
