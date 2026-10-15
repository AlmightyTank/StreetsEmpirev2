import type { Prisma } from '@prisma/client';
import type { PublicLegacyEntryDto } from '@streets/shared';
import type { Db } from '../utils/db.js';
import { AppError } from '../utils/errors.js';

interface LegacyPlayerSource {
  id: string;
  accountId: string;
  displayName: string;
  nationalRank: number | null;
  localRank: number | null;
  netWorthCents: bigint;
}

interface LegacyEventSource {
  id: string;
  kind: string;
  visibility: string;
  actors: unknown;
  summary: Prisma.JsonValue;
  happenedAt: Date;
}

interface LegacyNewsSource {
  id: string;
  title: string;
  cityMemoryEventId: string | null;
}

interface LegacyBuildSource {
  round: { id: string; name: string };
  players: LegacyPlayerSource[];
  events: LegacyEventSource[];
  news: LegacyNewsSource[];
  awardedAt: Date;
}

export interface LegacyEntrySeed {
  accountId: string;
  sourceRoundId: string;
  kind: string;
  title: string;
  summary: Prisma.InputJsonValue;
  coverNewsId?: string;
  idempotencyKey: string;
  awardedAt: Date;
}

function actorIds(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
}

function eventTitle(kind: string): string {
  if (kind === 'takeover') return 'The city changed hands';
  if (kind === 'war_win') return 'Block war victory';
  if (kind === 'operation_complete') return 'Operation on the books';
  return 'A mark on the city';
}

/** Pure snapshot builder, exported so the qualifying rules stay directly testable. */
export function buildLegacyEntrySeeds(source: LegacyBuildSource): LegacyEntrySeed[] {
  const playerById = new Map(source.players.map((player) => [player.id, player]));
  const eventById = new Map(source.events.map((event) => [event.id, event]));
  const seeds: LegacyEntrySeed[] = [];

  for (const player of source.players) {
    if (player.nationalRank === null || player.nationalRank > 10) continue;
    seeds.push({
      accountId: player.accountId,
      sourceRoundId: source.round.id,
      kind: 'season_finish',
      title: player.nationalRank === 1 ? `${source.round.name} champion` : `${source.round.name} national #${player.nationalRank}`,
      summary: {
        displayName: player.displayName,
        nationalRank: player.nationalRank,
        localRank: player.localRank,
        finalNetWorthCents: player.netWorthCents.toString(),
      },
      idempotencyKey: `legacy:${source.round.id}:finish:${player.accountId}`,
      awardedAt: source.awardedAt,
    });
  }

  for (const event of source.events) {
    if (event.visibility !== 'public' || !['takeover', 'war_win', 'operation_complete'].includes(event.kind)) continue;
    for (const roundPlayerId of new Set(actorIds(event.actors))) {
      const player = playerById.get(roundPlayerId);
      if (!player) continue;
      seeds.push({
        accountId: player.accountId,
        sourceRoundId: source.round.id,
        kind: 'city_event',
        title: eventTitle(event.kind),
        summary: {
          eventId: event.id,
          eventKind: event.kind,
          happenedAt: event.happenedAt.toISOString(),
          detail: event.summary as Prisma.InputJsonValue,
        },
        idempotencyKey: `legacy:${source.round.id}:event:${event.id}:${player.accountId}`,
        awardedAt: source.awardedAt,
      });
    }
  }

  for (const issue of source.news) {
    if (!issue.cityMemoryEventId) continue;
    const event = eventById.get(issue.cityMemoryEventId);
    if (!event) continue;
    for (const roundPlayerId of new Set(actorIds(event.actors))) {
      const player = playerById.get(roundPlayerId);
      if (!player) continue;
      seeds.push({
        accountId: player.accountId,
        sourceRoundId: source.round.id,
        kind: 'daily_cover',
        title: `Streets Daily: ${issue.title}`,
        summary: { eventId: event.id, eventKind: event.kind },
        coverNewsId: issue.id,
        idempotencyKey: `legacy:${source.round.id}:cover:${issue.id}:${player.accountId}`,
        awardedAt: source.awardedAt,
      });
    }
  }

  return seeds;
}

function toDto(row: {
  id: string;
  kind: string;
  title: string;
  summary: Prisma.JsonValue;
  coverNewsId: string | null;
  awardedAt: Date;
  sourceRound: { id: string; name: string; slug: string; endsAt: Date };
}, featuredLegacyEntryId: string | null): PublicLegacyEntryDto {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    summary: row.summary,
    coverNewsId: row.coverNewsId,
    awardedAt: row.awardedAt.toISOString(),
    featured: row.id === featuredLegacyEntryId,
    round: {
      id: row.sourceRound.id,
      name: row.sourceRound.name,
      slug: row.sourceRound.slug,
      endedAt: row.sourceRound.endsAt.toISOString(),
    },
  };
}

export const EmpireLegacyService = {
  async snapshotRound(tx: Db, roundId: string, awardedAt: Date): Promise<number> {
    const round = await tx.round.findUnique({ where: { id: roundId }, select: { id: true, name: true } });
    if (!round) throw AppError.notFound('ROUND_NOT_FOUND', 'That round does not exist.');
    const [players, events, news] = await Promise.all([
      tx.roundPlayer.findMany({
        where: { roundId },
        select: { id: true, accountId: true, displayName: true, nationalRank: true, localRank: true, netWorthCents: true },
      }),
      tx.cityMemoryEvent.findMany({
        where: { roundId },
        select: { id: true, kind: true, visibility: true, actors: true, summary: true, happenedAt: true },
      }),
      tx.gameNews.findMany({
        where: { roundId, autoGenerated: true, cityMemoryEventId: { not: null }, publishedAt: { lte: awardedAt } },
        select: { id: true, title: true, cityMemoryEventId: true },
      }),
    ]);
    const seeds = buildLegacyEntrySeeds({ round, players, events, news, awardedAt });
    if (!seeds.length) return 0;
    const result = await tx.legacyEntry.createMany({ data: seeds, skipDuplicates: true });
    return result.count;
  },

  async list(db: Db, accountId: string): Promise<PublicLegacyEntryDto[]> {
    const [rows, profile] = await Promise.all([
      db.legacyEntry.findMany({
        where: { accountId },
        include: { sourceRound: { select: { id: true, name: true, slug: true, endsAt: true } } },
        orderBy: [{ awardedAt: 'desc' }, { id: 'asc' }],
        take: 100,
      }),
      db.accountProfile.findUnique({ where: { accountId }, select: { featuredLegacyEntryId: true } }),
    ]);
    return rows.map((row) => toDto(row, profile?.featuredLegacyEntryId ?? null));
  },

  async feature(db: Db, accountId: string, entryId: string | null): Promise<PublicLegacyEntryDto[]> {
    if (entryId) {
      const owned = await db.legacyEntry.findFirst({ where: { id: entryId, accountId }, select: { id: true } });
      if (!owned) throw AppError.notFound('LEGACY_ENTRY_NOT_FOUND', 'That legacy receipt is not yours.');
    }
    await db.accountProfile.upsert({
      where: { accountId },
      create: { accountId, featuredLegacyEntryId: entryId },
      update: { featuredLegacyEntryId: entryId },
    });
    return EmpireLegacyService.list(db, accountId);
  },
};
