import type { Prisma, PrismaClient } from '@prisma/client';
import { loadRulesetForRound } from '@streets/rules-engine';
import type { AdminNpcTelemetryDto, AdminNpcTelemetryWindow } from '@streets/shared';
import { NPC_BOUNTY_SOURCE } from './npc-gang-rewards.js';
import { npcPersonality } from './npc-gang-personality.js';
import { npcRules } from './npc-gang-rules.js';
import { rate, storedTelemetry, sumTelemetry, telemetryDay } from './npc-gang-telemetry.js';
import { RoundService } from './round.service.js';

/**
 * Phase P. How NPC gangs actually behaved over a window: attack rate per active human,
 * win rates by city, tier and personality, what moved between humans and NPC crews,
 * bounties paid, and the scheduler's own counters (blocked reasons, dogpile skips).
 * Battle numbers come from raid battles; counters come from gang memory.
 */

const MAX_BATTLES = 5_000;

function report(value: Prisma.JsonValue): { won: boolean | null; cash: number; crack: number; kind: string | null } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { won: null, cash: 0, crack: 0, kind: null };
  return {
    won: typeof value.won === 'boolean' ? value.won : null,
    cash: typeof value.cashChangeCents === 'number' ? value.cashChangeCents : 0,
    crack: typeof value.crackChange === 'number' ? value.crackChange : 0,
    kind: typeof value.kind === 'string' ? value.kind : null,
  };
}

type Tally = { hits: number; won: number };

function bump(map: Map<string, Tally & { cash: number }>, key: string, won: boolean, cash = 0): void {
  const row = map.get(key) ?? { hits: 0, won: 0, cash: 0 };
  row.hits += 1;
  row.won += won ? 1 : 0;
  row.cash += cash;
  map.set(key, row);
}

function windowStart(window: AdminNpcTelemetryWindow, now: Date, roundStart: Date | null): Date {
  if (window === '24h') return new Date(now.getTime() - 24 * 3_600_000);
  if (window === '7d') return new Date(now.getTime() - 7 * 24 * 3_600_000);
  return roundStart ?? new Date(now.getTime() - 28 * 24 * 3_600_000);
}

export const NpcGangTelemetryService = {
  async report(prisma: PrismaClient, window: AdminNpcTelemetryWindow, now = new Date()): Promise<AdminNpcTelemetryDto> {
    const round = await RoundService.getCurrent(prisma, now);
    const from = windowStart(window, now, round?.startsAt ?? null);
    const days = Math.max(1 / 24, (now.getTime() - from.getTime()) / (24 * 3_600_000));
    const inRound = round ? { roundId: round.id } : { roundId: '' };
    const gangRules = round ? npcRules(loadRulesetForRound(round)) : null;

    const [npcHits, humanHits, activeHumans, gangs, bounties] = await Promise.all([
      prisma.raidBattle.findMany({
        where: { createdAt: { gte: from }, voidedAt: null, attacker: { ...inRound, npcGang: { isNot: null } }, defender: { npcGang: { is: null } } },
        select: { kind: true, attackerReport: true, attacker: { select: { city: { select: { name: true } }, npcGang: { select: { tier: true, archetype: true } } } } },
        orderBy: { createdAt: 'desc' },
        take: MAX_BATTLES,
      }),
      prisma.raidBattle.findMany({
        where: { createdAt: { gte: from }, voidedAt: null, attacker: { ...inRound, npcGang: { is: null } }, defender: { npcGang: { isNot: null } } },
        select: { attackerReport: true },
        orderBy: { createdAt: 'desc' },
        take: MAX_BATTLES,
      }),
      prisma.roundPlayer.count({ where: { ...inRound, npcGang: { is: null }, account: { isActive: true }, lastActiveAt: { gte: from } } }),
      prisma.npcGang.findMany({ where: { roundPlayer: inRound }, select: { memory: true } }),
      prisma.economyLedgerEntry.aggregate({
        where: { source: NPC_BOUNTY_SOURCE, createdAt: { gte: from }, roundPlayer: inRound },
        _count: { _all: true },
        _sum: { amountCents: true },
      }),
    ]);

    const byCity = new Map<string, Tally & { cash: number }>();
    const byTier = new Map<string, Tally & { cash: number }>();
    const byPersonality = new Map<string, Tally & { cash: number }>();
    const byKind: Record<string, number> = {};
    let won = 0;
    let cashFromHumans = 0;
    let productFromHumans = 0;
    for (const battle of npcHits) {
      const row = report(battle.attackerReport);
      const win = row.won === true;
      const kind = row.kind ?? battle.kind;
      byKind[kind] = (byKind[kind] ?? 0) + 1;
      won += win ? 1 : 0;
      const cash = Math.max(0, row.cash);
      cashFromHumans += cash;
      productFromHumans += Math.max(0, row.crack);
      bump(byCity, battle.attacker.city.name, win, cash);
      const gang = battle.attacker.npcGang;
      if (gang) {
        bump(byTier, gang.tier, win);
        bump(byPersonality, gangRules ? npcPersonality(gangRules, gang.archetype).personality.label : gang.archetype, win);
      }
    }

    let humanWon = 0;
    let cashFromNpcs = 0;
    let productFromNpcs = 0;
    for (const battle of humanHits) {
      const row = report(battle.attackerReport);
      humanWon += row.won === true ? 1 : 0;
      cashFromNpcs += Math.max(0, row.cash);
      productFromNpcs += Math.max(0, row.crack);
    }

    const counters = sumTelemetry(gangs.map((gang) => storedTelemetry(gang.memory)), telemetryDay(from), telemetryDay(now));
    const totalOutcomes = Object.values(counters.outcomes).reduce((sum, value) => sum + value, 0);
    const dogpile = counters.skips.DOGPILE ?? 0;
    const table = (map: Map<string, Tally & { cash: number }>) => [...map.entries()]
      .sort((left, right) => right[1].hits - left[1].hits || left[0].localeCompare(right[0]));

    return {
      window,
      roundName: round?.name ?? null,
      from: from.toISOString(),
      to: now.toISOString(),
      days: Math.round(days * 100) / 100,
      activeHumans,
      gangs: gangs.length,
      hits: {
        total: npcHits.length,
        won,
        winRate: rate(won, npcHits.length),
        perActiveHumanPerDay: activeHumans > 0 ? Math.round((npcHits.length / activeHumans / days) * 1000) / 1000 : null,
        byKind,
      },
      humanHits: { total: humanHits.length, won: humanWon, winRate: rate(humanWon, humanHits.length) },
      drain: {
        cashFromHumansCents: cashFromHumans,
        productFromHumans,
        cashFromNpcsCents: cashFromNpcs,
        productFromNpcs,
        bounties: bounties._count._all,
        bountiesCents: Number(bounties._sum.amountCents ?? 0n),
      },
      byCity: table(byCity).map(([city, row]) => ({ city, hits: row.hits, won: row.won, winRate: rate(row.won, row.hits), cashFromHumansCents: row.cash })),
      byTier: table(byTier).map(([tier, row]) => ({ tier, hits: row.hits, won: row.won, winRate: rate(row.won, row.hits) })),
      byPersonality: table(byPersonality).map(([personality, row]) => ({ personality, hits: row.hits, won: row.won, winRate: rate(row.won, row.hits) })),
      outcomes: counters.outcomes,
      blocked: counters.blocked,
      skips: counters.skips,
      rates: {
        blocked: rate(counters.outcomes.BLOCKED ?? 0, totalOutcomes),
        layLow: rate(counters.outcomes.LAY_LOW ?? 0, totalOutcomes),
        dogpileSkips: rate(dogpile, dogpile + npcHits.length),
      },
    };
  },
};
