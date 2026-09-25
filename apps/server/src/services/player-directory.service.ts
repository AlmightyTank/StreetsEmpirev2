import type { PrismaClient } from '@prisma/client';
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
const DIRECTORY_LIMIT = 100;

function activityBand(lastActiveAt: Date, now: Date): PlayerActivityBand {
  const age = Math.max(0, now.getTime() - lastActiveAt.getTime());
  if (age <= ONLINE_MS) return 'online';
  if (age <= RECENT_MS) return 'recent';
  if (age <= AWAY_MS) return 'away';
  return 'offline';
}

function queryMatches(
  row: { publicPimpId: number; displayName: string; alliance: { name: string; tag: string } | null },
  rawQuery: string,
): boolean {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return true;

  const numeric = query.match(/^#?(\d+)$/);
  if (numeric && row.publicPimpId === Number(numeric[1])) return true;

  return row.displayName.toLowerCase().includes(query)
    || row.alliance?.name.toLowerCase().includes(query) === true
    || row.alliance?.tag.toLowerCase().includes(query) === true;
}

export const PlayerDirectoryService = {
  async list(
    prisma: PrismaClient,
    ownerId: string,
    input: { view: PlayerDirectoryView; q?: string },
  ): Promise<PlayerDirectoryDto> {
    const owner = await prisma.roundPlayer.findUnique({
      where: { id: ownerId },
      select: {
        id: true,
        roundId: true,
        cityId: true,
        allianceId: true,
        publicPimpId: true,
      },
    });
    if (!owner) throw AppError.notFound('PLAYER_NOT_FOUND', 'You are not in the current round.');

    const now = new Date();
    const [rows, contacts] = await Promise.all([
      prisma.roundPlayer.findMany({
        where: { roundId: owner.roundId, account: { isActive: true } },
        orderBy: [{ netWorthCents: 'desc' }, { publicPimpId: 'asc' }],
        select: {
          id: true,
          publicPimpId: true,
          displayName: true,
          cityId: true,
          allianceId: true,
          netWorthCents: true,
          lastActiveAt: true,
          city: { select: { slug: true, name: true } },
          alliance: { select: { name: true, tag: true } },
        },
      }),
      prisma.playerContact.findMany({
        where: { ownerId: owner.id },
        select: { targetId: true },
      }),
    ]);

    const contactIds = new Set(contacts.map((row) => row.targetId));
    let previousWorth: bigint | null = null;
    let previousRank = 0;
    const ranked = rows.map((row, index) => {
      const nationalRank = previousWorth !== null && row.netWorthCents === previousWorth
        ? previousRank
        : index + 1;
      previousWorth = row.netWorthCents;
      previousRank = nationalRank;
      return { ...row, nationalRank, activity: activityBand(row.lastActiveAt, now) };
    });

    const ownerIndex = ranked.findIndex((row) => row.id === owner.id);
    const activeCutoff = now.getTime() - AWAY_MS;

    let visible = ranked;
    if (input.view === 'city') {
      visible = ranked.filter((row) => row.cityId === owner.cityId);
    } else if (input.view === 'alliance') {
      visible = owner.allianceId
        ? ranked.filter((row) => row.allianceId === owner.allianceId)
        : [];
    } else if (input.view === 'near') {
      visible = ownerIndex < 0
        ? []
        : ranked.slice(Math.max(0, ownerIndex - 15), ownerIndex + 16);
    } else if (input.view === 'active') {
      visible = ranked
        .filter((row) => row.lastActiveAt.getTime() >= activeCutoff)
        .sort((a, b) => b.lastActiveAt.getTime() - a.lastActiveAt.getTime() || a.nationalRank - b.nationalRank);
    }

    const query = input.q?.trim().slice(0, 80) ?? '';
    visible = visible.filter((row) => queryMatches(row, query)).slice(0, DIRECTORY_LIMIT);

    return {
      generatedAt: now.toISOString(),
      view: input.view,
      query,
      counts: {
        all: ranked.length,
        city: ranked.filter((row) => row.cityId === owner.cityId).length,
        alliance: owner.allianceId ? ranked.filter((row) => row.allianceId === owner.allianceId).length : 0,
        active: ranked.filter((row) => row.lastActiveAt.getTime() >= activeCutoff).length,
      },
      contactSlots: {
        used: contacts.length,
        max: CONTACTS_MAX,
      },
      players: visible.map((row) => ({
        publicPimpId: row.publicPimpId,
        displayName: row.displayName,
        alliance: allianceTagDto(row.alliance),
        city: row.city,
        netWorthCents: Number(row.netWorthCents),
        nationalRank: row.nationalRank,
        activity: row.activity,
        isYou: row.id === owner.id,
        isContact: contactIds.has(row.id),
      })),
    };
  },
};
