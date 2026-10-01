import { Prisma, type PrismaClient } from '@prisma/client';
import {
  CONTACTS_MAX,
  type PlayerActivityBand,
  type PlayerDirectoryDto,
  type PlayerDirectoryView,
} from '@streets/shared';
import { AppError } from '../utils/errors.js';
import { allianceTagDto } from './alliance.service.js';

const ONLINE_MS = 5 * 60 * 1000;
const RECENT_MS = 60 * 60 * 1000;
const AWAY_MS = 24 * 60 * 60 * 1000;
const PAGE_SIZE = 40;
const NEAR_RANK_RADIUS = 15;
const ENCOUNTER_SOURCE_LIMIT = 125;
const ENCOUNTER_LIMIT = 250;

const directorySelect = {
  id: true,
  publicPimpId: true,
  displayName: true,
  cityId: true,
  allianceId: true,
  netWorthCents: true,
  lastActiveAt: true,
  city: { select: { slug: true, name: true } },
  alliance: { select: { name: true, tag: true } },
  account: { select: { profile: { select: { crewName: true } } } },
} satisfies Prisma.RoundPlayerSelect;

type DirectoryRow = Prisma.RoundPlayerGetPayload<{ select: typeof directorySelect }>;

function activityBand(lastActiveAt: Date, now: Date): PlayerActivityBand {
  const age = Math.max(0, now.getTime() - lastActiveAt.getTime());
  if (age <= ONLINE_MS) return 'online';
  if (age <= RECENT_MS) return 'recent';
  if (age <= AWAY_MS) return 'away';
  return 'offline';
}

function queryMatches(
  row: Pick<DirectoryRow, 'publicPimpId' | 'displayName' | 'alliance' | 'account'>,
  rawQuery: string,
): boolean {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return true;

  const numeric = query.match(/^#?(\d+)$/);
  if (numeric?.[1] && row.publicPimpId === Number(numeric[1])) return true;

  return row.displayName.toLowerCase().includes(query)
    || row.account.profile?.crewName?.toLowerCase().includes(query) === true
    || row.alliance?.name.toLowerCase().includes(query) === true
    || row.alliance?.tag.toLowerCase().includes(query) === true;
}

function searchWhere(query: string): Prisma.RoundPlayerWhereInput | null {
  const cleaned = query.trim();
  if (!cleaned) return null;

  const numeric = cleaned.match(/^#?(\d+)$/);
  const publicPimpId = numeric?.[1] ? Number(numeric[1]) : null;

  return {
    OR: [
      { displayName: { contains: cleaned, mode: 'insensitive' } },
      // 0.9.0-F. Crew names are account-level identity, searchable once set.
      { account: { profile: { crewName: { contains: cleaned, mode: 'insensitive' } } } },
      { alliance: { name: { contains: cleaned, mode: 'insensitive' } } },
      { alliance: { tag: { contains: cleaned, mode: 'insensitive' } } },
      ...(publicPimpId !== null ? [{ publicPimpId }] : []),
    ],
  };
}

function withSearch(
  base: Prisma.RoundPlayerWhereInput,
  query: string,
): Prisma.RoundPlayerWhereInput {
  const search = searchWhere(query);
  return search ? { AND: [base, search] } : base;
}

async function recentlyEncountered(
  prisma: PrismaClient,
  ownerId: string,
): Promise<Array<{ id: string; at: Date }>> {
  const [battles, turfPushes, convoyTails, recon] = await Promise.all([
    prisma.raidBattle.findMany({
      where: {
        voidedAt: null,
        OR: [{ attackerId: ownerId }, { defenderId: ownerId }],
      },
      orderBy: { createdAt: 'desc' },
      take: ENCOUNTER_SOURCE_LIMIT,
      select: { attackerId: true, defenderId: true, createdAt: true },
    }),
    prisma.turfPush.findMany({
      where: { OR: [{ attackerId: ownerId }, { defenderId: ownerId }] },
      orderBy: { startedAt: 'desc' },
      take: ENCOUNTER_SOURCE_LIMIT,
      select: { attackerId: true, defenderId: true, startedAt: true },
    }),
    prisma.convoyTail.findMany({
      where: { OR: [{ attackerId: ownerId }, { ownerId }] },
      orderBy: { startedAt: 'desc' },
      take: ENCOUNTER_SOURCE_LIMIT,
      select: { attackerId: true, ownerId: true, startedAt: true },
    }),
    prisma.combatIntel.findMany({
      // Only recon this player performed counts. Being secretly reconned never reveals the observer.
      where: { observerId: ownerId },
      orderBy: { updatedAt: 'desc' },
      take: ENCOUNTER_SOURCE_LIMIT,
      select: { targetId: true, updatedAt: true },
    }),
  ]);

  const latest = new Map<string, Date>();
  const remember = (id: string, at: Date) => {
    if (id === ownerId) return;
    const previous = latest.get(id);
    if (!previous || previous < at) latest.set(id, at);
  };

  for (const row of battles) {
    remember(row.attackerId === ownerId ? row.defenderId : row.attackerId, row.createdAt);
  }
  for (const row of turfPushes) {
    remember(row.attackerId === ownerId ? row.defenderId : row.attackerId, row.startedAt);
  }
  for (const row of convoyTails) {
    remember(row.attackerId === ownerId ? row.ownerId : row.attackerId, row.startedAt);
  }
  for (const row of recon) remember(row.targetId, row.updatedAt);

  return [...latest.entries()]
    .map(([id, at]) => ({ id, at }))
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, ENCOUNTER_LIMIT);
}

async function ranksForRows(
  prisma: PrismaClient,
  roundId: string,
  rows: DirectoryRow[],
): Promise<Map<string, number>> {
  if (!rows.length) return new Map();

  // Rank only the requested rows, but calculate the window over every active player
  // in the round so search/city/encounter views still receive national rank.
  const ranked = await prisma.$queryRaw<Array<{ id: string; nationalRank: number }>>(Prisma.sql`
    SELECT ranked.id, ranked."nationalRank"
    FROM (
      SELECT
        rp.id,
        RANK() OVER (ORDER BY rp."netWorthCents" DESC)::int AS "nationalRank"
      FROM "RoundPlayer" rp
      INNER JOIN "Account" account ON account.id = rp."accountId"
      WHERE rp."roundId" = ${roundId}
        AND account."isActive" = true
    ) ranked
    WHERE ranked.id IN (${Prisma.join(rows.map((row) => row.id))})
  `);

  return new Map(ranked.map((row) => [row.id, row.nationalRank] as const));
}

function pagination(page: number, total: number) {
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), totalPages);
  return {
    page: safePage,
    pageSize: PAGE_SIZE,
    total,
    totalPages,
    skip: (safePage - 1) * PAGE_SIZE,
  };
}

export const PlayerDirectoryService = {
  async list(
    prisma: PrismaClient,
    ownerId: string,
    input: { view: PlayerDirectoryView; q?: string; page?: number },
  ): Promise<PlayerDirectoryDto> {
    const owner = await prisma.roundPlayer.findUnique({
      where: { id: ownerId },
      select: {
        id: true,
        roundId: true,
        cityId: true,
        allianceId: true,
        publicPimpId: true,
        netWorthCents: true,
      },
    });
    if (!owner) throw AppError.notFound('PLAYER_NOT_FOUND', 'You are not in the current round.');

    const now = new Date();
    const activeCutoff = new Date(now.getTime() - AWAY_MS);
    const query = input.q?.trim().slice(0, 80) ?? '';

    const [contacts, encounters, ownerPosition, allCount, cityCount, allianceCount, activeCount] = await Promise.all([
      prisma.playerContact.findMany({
        where: { ownerId: owner.id },
        select: { targetId: true },
      }),
      recentlyEncountered(prisma, owner.id),
      prisma.roundPlayer.count({
        where: {
          roundId: owner.roundId,
          account: { isActive: true },
          OR: [
            { netWorthCents: { gt: owner.netWorthCents } },
            { netWorthCents: owner.netWorthCents, publicPimpId: { lt: owner.publicPimpId } },
          ],
        },
      }),
      prisma.roundPlayer.count({
        where: { roundId: owner.roundId, account: { isActive: true } },
      }),
      prisma.roundPlayer.count({
        where: { roundId: owner.roundId, cityId: owner.cityId, account: { isActive: true } },
      }),
      owner.allianceId
        ? prisma.roundPlayer.count({
            where: { roundId: owner.roundId, allianceId: owner.allianceId, account: { isActive: true } },
          })
        : Promise.resolve(0),
      prisma.roundPlayer.count({
        where: { roundId: owner.roundId, lastActiveAt: { gte: activeCutoff }, account: { isActive: true } },
      }),
    ]);

    const encounterIds = encounters.map((row) => row.id);
    const encounterAt = new Map(encounters.map((row) => [row.id, row.at] as const));
    const encounterCount = encounterIds.length
      ? await prisma.roundPlayer.count({
          where: { id: { in: encounterIds }, roundId: owner.roundId, account: { isActive: true } },
        })
      : 0;

    const nearStart = Math.max(0, ownerPosition - NEAR_RANK_RADIUS);
    const nearCount = Math.min(
      NEAR_RANK_RADIUS * 2 + 1,
      Math.max(0, allCount - nearStart),
    );

    let rows: DirectoryRow[] = [];
    let currentPage = 1;
    let total = 0;
    let totalPages = 1;

    if (input.view === 'near') {
      const nearRows = await prisma.roundPlayer.findMany({
        where: { roundId: owner.roundId, account: { isActive: true } },
        orderBy: [{ netWorthCents: 'desc' }, { publicPimpId: 'asc' }],
        skip: nearStart,
        take: nearCount,
        select: directorySelect,
      });
      rows = nearRows.filter((row) => queryMatches(row, query));
      total = rows.length;
    } else if (input.view === 'encountered') {
      if (encounterIds.length) {
        const matched = await prisma.roundPlayer.findMany({
          where: withSearch({
            id: { in: encounterIds },
            roundId: owner.roundId,
            account: { isActive: true },
          }, query),
          select: directorySelect,
        });
        matched.sort((a, b) =>
          (encounterAt.get(b.id)?.getTime() ?? 0) - (encounterAt.get(a.id)?.getTime() ?? 0));
        total = matched.length;
        const page = pagination(input.page ?? 1, total);
        currentPage = page.page;
        totalPages = page.totalPages;
        rows = matched.slice(page.skip, page.skip + PAGE_SIZE);
      }
    } else {
      const base: Prisma.RoundPlayerWhereInput =
        input.view === 'city'
          ? { roundId: owner.roundId, cityId: owner.cityId, account: { isActive: true } }
          : input.view === 'alliance'
            ? owner.allianceId
              ? { roundId: owner.roundId, allianceId: owner.allianceId, account: { isActive: true } }
              : { id: { in: [] } }
            : input.view === 'active'
              ? { roundId: owner.roundId, lastActiveAt: { gte: activeCutoff }, account: { isActive: true } }
              : { roundId: owner.roundId, account: { isActive: true } };

      const where = withSearch(base, query);
      total = await prisma.roundPlayer.count({ where });
      const page = pagination(input.page ?? 1, total);
      currentPage = page.page;
      totalPages = page.totalPages;
      rows = await prisma.roundPlayer.findMany({
        where,
        orderBy: [{ netWorthCents: 'desc' }, { publicPimpId: 'asc' }],
        skip: page.skip,
        take: PAGE_SIZE,
        select: directorySelect,
      });
    }

    const rankByWorth = await ranksForRows(prisma, owner.roundId, rows);
    const contactIds = new Set(contacts.map((row) => row.targetId));

    return {
      generatedAt: now.toISOString(),
      view: input.view,
      query,
      pagination: {
        page: currentPage,
        pageSize: PAGE_SIZE,
        total,
        totalPages,
      },
      counts: {
        all: allCount,
        city: cityCount,
        alliance: allianceCount,
        near: nearCount,
        encountered: encounterCount,
        active: activeCount,
      },
      contactSlots: {
        used: contacts.length,
        max: CONTACTS_MAX,
      },
      players: rows.map((row) => ({
        publicPimpId: row.publicPimpId,
        displayName: row.displayName,
        crewName: row.account.profile?.crewName ?? null,
        alliance: allianceTagDto(row.alliance),
        city: row.city,
        netWorthCents: Number(row.netWorthCents),
        nationalRank: rankByWorth.get(row.id) ?? 1,
        activity: activityBand(row.lastActiveAt, now),
        isYou: row.id === owner.id,
        isContact: contactIds.has(row.id),
      })),
    };
  },
};
