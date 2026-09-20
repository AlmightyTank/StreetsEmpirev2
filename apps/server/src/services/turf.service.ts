import type { PrismaClient } from '@prisma/client';
import { localsAfter, localsThugs, presenceAfter, turfBlocks, type Ruleset } from '@streets/rules-engine';
import type { CityTurfDto, TurfBlockDto } from '@streets/shared';
import type { Db } from '../utils/db.js';

type TurfDb = PrismaClient | Db;

function districtName(ruleset: Ruleset, citySlug: string, district: string): string {
  const key = district as keyof typeof ruleset.districts;
  return ruleset.cities?.[citySlug]?.districts?.[key]?.name
    ?? ruleset.districts[key]?.name
    ?? district;
}

function hoursSince(at: Date, now: Date): number {
  return Math.max(0, (now.getTime() - at.getTime()) / 3_600_000);
}

/**
 * 0.6.0-A. Turf is read-only for players in A, but the rows exist from the round's
 * first read so the map, later presence, and B's claim actions all see the same blocks.
 */
export const TurfService = {
  async ensureRound(db: TurfDb, roundId: string, ruleset: Ruleset): Promise<void> {
    const blocks = turfBlocks(ruleset);
    if (!blocks.length) return;

    const slugs = [...new Set(blocks.map((block) => block.citySlug))];
    const cities = await db.city.findMany({ where: { slug: { in: slugs } }, select: { id: true, slug: true } });
    const cityBySlug = new Map(cities.map((city) => [city.slug, city.id]));

    await db.turf.createMany({
      skipDuplicates: true,
      data: blocks.flatMap((block) => {
        const cityId = cityBySlug.get(block.citySlug);
        return cityId
          ? [{
              roundId,
              cityId,
              district: block.district,
              localsThugs: localsThugs(ruleset, block),
            }]
          : [];
      }),
    });
  },

  /**
   * 0.6.0-B. Scout presence is earned where the crew lives right now. The old value
   * fades first, then the new trip is added, so many small trips and one long trip
   * age the same way once time passes.
   */
  async addPresence(
    db: TurfDb,
    input: {
      roundPlayerId: string;
      roundId: string;
      cityId: string;
      district: string;
      turns: number;
      ruleset: Ruleset;
      now?: Date;
    },
  ): Promise<number> {
    if (!input.ruleset.turf || input.turns <= 0) return 0;

    const now = input.now ?? new Date();
    await TurfService.ensureRound(db, input.roundId, input.ruleset);

    const where = {
      roundPlayerId_cityId_district: {
        roundPlayerId: input.roundPlayerId,
        cityId: input.cityId,
        district: input.district,
      },
    };
    const existing = await db.turfPresence.findUnique({ where });
    const faded = existing
      ? presenceAfter(input.ruleset, existing.turns, hoursSince(existing.at, now))
      : 0;
    const turns = faded + input.turns;

    await db.turfPresence.upsert({
      where,
      create: {
        roundPlayerId: input.roundPlayerId,
        cityId: input.cityId,
        district: input.district,
        turns,
        at: now,
      },
      update: { turns, at: now },
    });

    return turns;
  },

  async byCity(db: TurfDb, roundPlayerId: string, ruleset: Ruleset, now = new Date()): Promise<Map<string, CityTurfDto> | null> {
    if (!ruleset.turf) return null;

    const player = await db.roundPlayer.findUniqueOrThrow({
      where: { id: roundPlayerId },
      select: { id: true, roundId: true },
    });
    await TurfService.ensureRound(db, player.roundId, ruleset);

    const [rows, presenceRows] = await Promise.all([
      db.turf.findMany({
        where: { roundId: player.roundId },
        include: {
          city: { select: { slug: true } },
          holder: {
            select: {
              publicPimpId: true,
              displayName: true,
              alliance: { select: { name: true, tag: true } },
            },
          },
        },
        orderBy: [{ city: { sortOrder: 'asc' } }, { district: 'asc' }],
      }),
      db.turfPresence.findMany({
        where: { roundPlayerId: player.id },
        include: { city: { select: { slug: true } } },
      }),
    ]);

    const presence = new Map(presenceRows.map((row) => [
      `${row.city.slug}:${row.district}`,
      presenceAfter(ruleset, row.turns, hoursSince(row.at, now)),
    ]));

    const byCity = new Map<string, CityTurfDto>();
    for (const row of rows) {
      const citySlug = row.city.slug;
      const block = { citySlug, district: row.district as TurfBlockDto['district'] };
      const blocks = byCity.get(citySlug)?.blocks ?? [];
      const fullLocals = localsThugs(ruleset, block);
      blocks.push({
        city: citySlug,
        district: block.district,
        districtName: districtName(ruleset, citySlug, row.district),
        holder: row.holder
          ? {
              publicPimpId: row.holder.publicPimpId,
              displayName: row.holder.displayName,
              alliance: row.holder.alliance ? { name: row.holder.alliance.name, tag: row.holder.alliance.tag } : null,
            }
          : null,
        cornerThugs: row.cornerThugs,
        localsThugs: Math.round(localsAfter(ruleset, block, row.localsThugs, hoursSince(row.localsAt, now))),
        localsFullThugs: fullLocals,
        heldSince: row.heldSince?.toISOString() ?? null,
        shieldUntil: row.shieldUntil?.toISOString() ?? null,
        presenceTurns: presence.get(`${citySlug}:${row.district}`) ?? 0,
      });
      byCity.set(citySlug, { enabled: true, blocks });
    }

    return byCity;
  },
};
