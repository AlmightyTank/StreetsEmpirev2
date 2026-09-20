import type { PrismaClient } from '@prisma/client';
import type { Ruleset } from '@streets/rules-engine';
import type { TerritoryBoardDto } from '@streets/shared';
import type { Db } from '../utils/db.js';

type TurfDb = PrismaClient | Db;

async function activeSegment(db: TurfDb, turfId: string) {
  return db.turfHoldSegment.findFirst({
    where: { turfId, endedAt: null },
    orderBy: { startedAt: 'desc' },
  });
}

async function heldSnapshot(db: TurfDb, turfId: string) {
  return db.turf.findUnique({
    where: { id: turfId },
    select: {
      id: true,
      roundId: true,
      heldSince: true,
      holder: {
        select: {
          id: true,
          publicPimpId: true,
          displayName: true,
          allianceId: true,
          alliance: { select: { name: true, tag: true } },
        },
      },
    },
  });
}

export async function startTurfHold(db: TurfDb, turfId: string, at: Date): Promise<void> {
  const turf = await heldSnapshot(db, turfId);
  if (!turf?.holder) return;
  const current = await activeSegment(db, turfId);
  const allianceId = turf.holder.allianceId ?? null;

  if (current && current.holderId === turf.holder.id && current.allianceId === allianceId) return;
  if (current) {
    await db.turfHoldSegment.update({ where: { id: current.id }, data: { endedAt: at } });
  }

  // If E history was added while a block was already held, heldSince is the best
  // honest backfill available. A membership split always passes an `at` later than it.
  const startedAt = current ? at : turf.heldSince && turf.heldSince < at ? turf.heldSince : at;
  await db.turfHoldSegment.create({
    data: {
      roundId: turf.roundId,
      turfId: turf.id,
      holderId: turf.holder.id,
      holderPublicPimpId: turf.holder.publicPimpId,
      holderName: turf.holder.displayName,
      allianceId,
      allianceName: turf.holder.alliance?.name ?? null,
      allianceTag: turf.holder.alliance?.tag ?? null,
      startedAt,
    },
  });
}

export async function endTurfHold(db: TurfDb, turfId: string, at: Date): Promise<void> {
  const current = await activeSegment(db, turfId);
  if (current) {
    if (current.startedAt < at) {
      await db.turfHoldSegment.update({ where: { id: current.id }, data: { endedAt: at } });
    } else {
      await db.turfHoldSegment.delete({ where: { id: current.id } });
    }
    return;
  }

  // Backfill a hold that began before this history table existed and ends before
  // anyone opened the board.
  const turf = await heldSnapshot(db, turfId);
  if (!turf?.holder || !turf.heldSince || turf.heldSince >= at) return;
  await db.turfHoldSegment.create({
    data: {
      roundId: turf.roundId,
      turfId: turf.id,
      holderId: turf.holder.id,
      holderPublicPimpId: turf.holder.publicPimpId,
      holderName: turf.holder.displayName,
      allianceId: turf.holder.allianceId ?? null,
      allianceName: turf.holder.alliance?.name ?? null,
      allianceTag: turf.holder.alliance?.tag ?? null,
      startedAt: turf.heldSince,
      endedAt: at,
    },
  });
}

/** Close every live segment for a player before their alliance identity changes. */
export async function endPlayerTurfHolds(db: TurfDb, playerId: string, at: Date): Promise<void> {
  const rows = await db.turf.findMany({ where: { holderId: playerId }, select: { id: true } });
  for (const row of rows) await endTurfHold(db, row.id, at);
}

/** Re-open the same held blocks with the player's new alliance snapshot. */
export async function startPlayerTurfHolds(db: TurfDb, playerId: string, at: Date): Promise<void> {
  const rows = await db.turf.findMany({ where: { holderId: playerId }, select: { id: true } });
  for (const row of rows) await startTurfHold(db, row.id, at);
}

/** Seed live blocks that pre-date E's history ledger. Safe to call on every board read. */
async function seedRound(db: TurfDb, roundId: string, at: Date): Promise<void> {
  const rows = await db.turf.findMany({ where: { roundId, holderId: { not: null } }, select: { id: true } });
  for (const row of rows) await startTurfHold(db, row.id, at);
}

function ranks(values: number[]): number[] {
  let previous: number | null = null;
  let rank = 0;
  return values.map((value, index) => {
    if (previous === null || value !== previous) rank = index + 1;
    previous = value;
    return rank;
  });
}

export const TurfHistoryService = {
  async board(
    db: TurfDb,
    roundId: string,
    ruleset: Ruleset,
    viewer: { id: string; allianceId: string | null } | null,
    now = new Date(),
  ): Promise<TerritoryBoardDto | null> {
    if (!ruleset.turf?.territory) return null;
    const round = await db.round.findUniqueOrThrow({
      where: { id: roundId },
      select: { status: true, endsAt: true },
    });
    const asOf = round.status === 'ENDED' || round.status === 'ARCHIVED'
      ? (round.endsAt < now ? round.endsAt : now)
      : now;

    await seedRound(db, roundId, asOf);
    const segments = await db.turfHoldSegment.findMany({
      where: { roundId, startedAt: { lte: asOf } },
      orderBy: [{ startedAt: 'asc' }, { id: 'asc' }],
    });
    const live = await db.turf.groupBy({
      by: ['holderId'],
      where: { roundId, holderId: { not: null } },
      _count: { _all: true },
    });
    const liveByHolder = new Map(live.flatMap((row) => row.holderId ? [[row.holderId, row._count._all] as const] : []));

    const crews = new Map<string, {
      publicPimpId: number; displayName: string; alliance: { name: string; tag: string } | null;
      heldSeconds: number; currentBlocks: number;
    }>();
    const alliances = new Map<string, {
      name: string; tag: string; heldSeconds: number; currentBlocks: number;
    }>();

    for (const segment of segments) {
      const end = segment.endedAt && segment.endedAt < asOf ? segment.endedAt : asOf;
      const seconds = Math.max(0, Math.floor((end.getTime() - segment.startedAt.getTime()) / 1000));
      if (seconds <= 0) continue;

      const crew = crews.get(segment.holderId) ?? {
        publicPimpId: segment.holderPublicPimpId,
        displayName: segment.holderName,
        alliance: segment.allianceName && segment.allianceTag ? { name: segment.allianceName, tag: segment.allianceTag } : null,
        heldSeconds: 0,
        currentBlocks: liveByHolder.get(segment.holderId) ?? 0,
      };
      crew.heldSeconds += seconds;
      crew.publicPimpId = segment.holderPublicPimpId;
      crew.displayName = segment.holderName;
      crew.alliance = segment.allianceName && segment.allianceTag ? { name: segment.allianceName, tag: segment.allianceTag } : crew.alliance;
      crews.set(segment.holderId, crew);

      if (segment.allianceId && segment.allianceName && segment.allianceTag) {
        const alliance = alliances.get(segment.allianceId) ?? {
          name: segment.allianceName,
          tag: segment.allianceTag,
          heldSeconds: 0,
          currentBlocks: 0,
        };
        alliance.heldSeconds += seconds;
        alliance.name = segment.allianceName;
        alliance.tag = segment.allianceTag;
        alliances.set(segment.allianceId, alliance);
      }
    }

    const currentAllianceCounts = await db.turf.findMany({
      where: { roundId, holder: { allianceId: { not: null } } },
      select: { holder: { select: { allianceId: true } } },
    });
    for (const row of currentAllianceCounts) {
      const id = row.holder?.allianceId;
      if (!id) continue;
      const standing = alliances.get(id);
      if (standing) standing.currentBlocks += 1;
    }

    const crewRows = [...crews.entries()]
      .map(([id, value]) => ({ id, ...value }))
      .sort((a, b) => b.heldSeconds - a.heldSeconds || a.publicPimpId - b.publicPimpId);
    const allianceRows = [...alliances.entries()]
      .map(([id, value]) => ({ id, ...value }))
      .sort((a, b) => b.heldSeconds - a.heldSeconds || a.tag.localeCompare(b.tag));
    const crewRanks = ranks(crewRows.map((row) => row.heldSeconds));
    const allianceRanks = ranks(allianceRows.map((row) => row.heldSeconds));

    return {
      enabled: true,
      asOf: asOf.toISOString(),
      crews: crewRows.map((row, index) => ({
        rank: crewRanks[index]!,
        publicPimpId: row.publicPimpId,
        displayName: row.displayName,
        alliance: row.alliance,
        heldSeconds: row.heldSeconds,
        currentBlocks: row.currentBlocks,
        isYou: row.id === viewer?.id,
        hallOfFameLeader: crewRanks[index] === 1,
      })),
      alliances: allianceRows.map((row, index) => ({
        rank: allianceRanks[index]!,
        name: row.name,
        tag: row.tag,
        heldSeconds: row.heldSeconds,
        currentBlocks: row.currentBlocks,
        isYours: row.id === viewer?.allianceId,
        hallOfFameLeader: allianceRanks[index] === 1,
      })),
    };
  },
};
