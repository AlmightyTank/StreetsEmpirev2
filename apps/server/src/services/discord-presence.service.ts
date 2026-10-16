import type { PrismaClient } from '@prisma/client';
import { formatCentsCompact, type DiscordPresenceHighlightsDto } from '@streets/shared';
import { RoundService } from './round.service.js';

type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : {};
}

function positiveNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function displayableCents(value: bigint): number {
  return Number(value > BigInt(Number.MAX_SAFE_INTEGER) ? BigInt(Number.MAX_SAFE_INTEGER) : value);
}

/**
 * Builds public copy from anonymous gameplay facts. Inputs intentionally contain no
 * player columns so a later formatter change cannot accidentally reveal a player.
 */
export function buildAnonymousPresenceHighlights(input: {
  slotMetadata: unknown[];
  jackpotPoolCents: bigint | null;
  openSportsbookBets: number;
  openSportsbookStakeCents: bigint;
  raidReports: unknown[];
  scoutPayloads: unknown[];
}): DiscordPresenceHighlightsDto {
  const highlights: DiscordPresenceHighlightsDto['highlights'] = [];

  const jackpotAward = Math.max(0, ...input.slotMetadata.map((value) => positiveNumber(object(value).jackpotAwardCents)));
  if (jackpotAward > 0) {
    highlights.push({ kind: 'jackpot', message: `🎰 A ${formatCentsCompact(jackpotAward)} jackpot just hit` });
  } else if (input.jackpotPoolCents && input.jackpotPoolCents > 0n) {
    highlights.push({ kind: 'jackpot', message: `🎰 Casino jackpot: ${formatCentsCompact(displayableCents(input.jackpotPoolCents))} and climbing` });
  }

  if (input.openSportsbookBets > 0 && input.openSportsbookStakeCents > 0n) {
    const tickets = `${input.openSportsbookBets} open bet${input.openSportsbookBets === 1 ? '' : 's'}`;
    highlights.push({ kind: 'sportsbook', message: `🏆 ${formatCentsCompact(displayableCents(input.openSportsbookStakeCents))} riding on ${tickets}` });
  }

  const raidLoot = Math.max(0, ...input.raidReports.map((value) => positiveNumber(object(value).cashChangeCents)));
  if (raidLoot > 0) {
    highlights.push({ kind: 'raid', message: `💥 A recent raid scored ${formatCentsCompact(raidLoot)} in loot` });
  }

  const scout = input.scoutPayloads
    .map((value) => {
      const payload = object(value);
      const cashCents = positiveNumber(payload.cashCents);
      const recruits = positiveNumber(payload.whores) + positiveNumber(payload.thugs);
      return { cashCents, recruits, score: cashCents + recruits * 10_000 };
    })
    .sort((a, b) => b.score - a.score)[0];
  if (scout && scout.score > 0) {
    const result = [scout.cashCents > 0 ? formatCentsCompact(scout.cashCents) : '', scout.recruits > 0 ? `${scout.recruits} recruits` : '']
      .filter(Boolean).join(' + ');
    highlights.push({ kind: 'scout', message: `🔎 A recent scout run found ${result}` });
  }

  return { highlights };
}

export const DiscordPresenceService = {
  async highlights(prisma: PrismaClient, now = new Date()): Promise<DiscordPresenceHighlightsDto> {
    const round = await RoundService.getCurrent(prisma, now);
    if (!round || round.status !== 'ACTIVE') return { highlights: [] };

    const since = new Date(now.getTime() - 24 * 60 * 60_000);
    const [slots, jackpot, sportsbook, raids, scouts] = await Promise.all([
      prisma.casinoLedgerEntry.findMany({
        where: { roundPlayer: { roundId: round.id }, kind: 'SLOT_SPIN', createdAt: { gte: since } },
        orderBy: { createdAt: 'desc' }, take: 100, select: { metadata: true },
      }),
      prisma.casinoJackpot.findFirst({
        where: { roundId: round.id }, orderBy: { poolCents: 'desc' }, select: { poolCents: true },
      }),
      prisma.sportsbookBet.aggregate({
        where: { roundPlayer: { roundId: round.id }, status: 'OPEN' },
        _count: { _all: true }, _sum: { stakeCents: true },
      }),
      prisma.raidBattle.findMany({
        where: { attacker: { roundId: round.id }, kind: 'RAID', voidedAt: null, createdAt: { gte: since } },
        orderBy: { createdAt: 'desc' }, take: 100, select: { attackerReport: true },
      }),
      prisma.playerActivity.findMany({
        where: { roundPlayer: { roundId: round.id }, type: 'SCOUT', createdAt: { gte: since } },
        orderBy: { createdAt: 'desc' }, take: 100, select: { payload: true },
      }),
    ]);

    return buildAnonymousPresenceHighlights({
      slotMetadata: slots.map((row) => row.metadata),
      jackpotPoolCents: jackpot?.poolCents ?? null,
      openSportsbookBets: sportsbook._count._all,
      openSportsbookStakeCents: sportsbook._sum.stakeCents ?? 0n,
      raidReports: raids.map((row) => row.attackerReport),
      scoutPayloads: scouts.map((row) => row.payload),
    });
  },
};
