import type { Prisma, PrismaClient } from '@prisma/client';
import { findRoutes, type Ruleset } from '@streets/rules-engine';
import type { NpcGangMigrationRules } from '@streets/rulesets';

/**
 * Phase K. Where a gang stands in its city against the others it could move to.
 * The decision is pure so it can be tested; the move itself is a normal
 * `RelocationService.move`, which owns every legality check.
 */

export type NpcMigrationReason = 'HOSTILE' | 'CROWDED' | 'QUIET' | 'RICHER';

export interface NpcCityStat {
  slug: string;
  name: string;
  /** Humans active inside `activeHumanHours`. */
  activeHumans: number;
  /** NPC gangs living here, not counting ones already on the road out. */
  npcGangs: number;
  /** NPC gangs on the road here. */
  inbound: number;
  reachable: boolean;
}

/** Stored in `NpcGang.memory.migration` while a gang is packing. */
export interface NpcMigrationPlan {
  to: string;
  toName: string;
  reason: NpcMigrationReason;
  decidedAt: string;
}

/** How many NPC gangs a city can carry: one per `humansPerGang` humans, at least one, capped. */
export function npcGangsAllowed(activeHumans: number, rules: NpcGangMigrationRules, maxPerCity: number): number {
  return Math.max(1, Math.min(maxPerCity, Math.floor(activeHumans / Math.max(1, rules.humansPerGang))));
}

function roomFor(city: NpcCityStat, rules: NpcGangMigrationRules, maxPerCity: number): boolean {
  return city.npcGangs + city.inbound < npcGangsAllowed(city.activeHumans, rules, maxPerCity);
}

/**
 * Why this gang should leave, and where to. Hostile, crowded and quiet cities push a
 * gang out to any city with room and enough humans; otherwise it only moves for a
 * city with clearly more humans. Destinations are scored by humans left over after
 * the NPC gangs already there or on their way.
 */
export function chooseMigration(input: {
  tier: string;
  here: NpcCityStat;
  cities: readonly NpcCityStat[];
  recentLosses: number;
  rules: NpcGangMigrationRules;
  maxPerCity: number;
}): { to: NpcCityStat; reason: NpcMigrationReason } | null {
  const { here, rules, maxPerCity } = input;
  if (!rules.enabled || !rules.tiers.includes(input.tier as NpcGangMigrationRules['tiers'][number])) return null;

  const reason: NpcMigrationReason = input.recentLosses >= rules.hostileLosses
    ? 'HOSTILE'
    : here.npcGangs > npcGangsAllowed(here.activeHumans, rules, maxPerCity)
      ? 'CROWDED'
      : here.activeHumans < rules.quietBelowHumans
        ? 'QUIET'
        : 'RICHER';

  const score = (city: NpcCityStat) => city.activeHumans - (city.npcGangs + city.inbound) * Math.max(1, rules.humansPerGang);
  const best = input.cities
    .filter((city) => city.slug !== here.slug && city.reachable && city.activeHumans >= rules.quietBelowHumans && roomFor(city, rules, maxPerCity))
    .sort((left, right) => score(right) - score(left) || left.slug.localeCompare(right.slug))[0];
  if (!best) return null;
  if (reason === 'RICHER' && best.activeHumans < here.activeHumans + rules.betterByHumans) return null;
  return { to: best, reason };
}

/** Whether `to` can still take one more gang; checked again just before the truck leaves. */
export function destinationOpen(to: NpcCityStat | undefined, rules: NpcGangMigrationRules, maxPerCity: number): boolean {
  return Boolean(to && to.reachable && roomFor(to, rules, maxPerCity));
}

export async function loadNpcCityStats(prisma: PrismaClient, roundId: string, fromSlug: string, ruleset: Ruleset, rules: NpcGangMigrationRules, now: Date): Promise<NpcCityStat[]> {
  const since = new Date(now.getTime() - Math.max(1, rules.activeHumanHours) * 3_600_000);
  const [cities, humans, gangs, moving] = await Promise.all([
    prisma.city.findMany({ where: { isEnabled: true }, select: { id: true, slug: true, name: true } }),
    prisma.roundPlayer.groupBy({
      by: ['cityId'],
      where: { roundId, npcGang: { is: null }, account: { isActive: true }, lastActiveAt: { gte: since } },
      _count: { _all: true },
    }),
    prisma.roundPlayer.groupBy({
      by: ['cityId'],
      where: { roundId, npcGang: { isNot: null }, account: { isActive: true } },
      _count: { _all: true },
    }),
    prisma.relocation.findMany({
      where: { arrivedAt: null, roundPlayer: { roundId, npcGang: { isNot: null } } },
      select: { fromCity: true, toCity: true },
    }),
  ]);
  const count = (rows: Array<{ cityId: string; _count: { _all: number } }>, cityId: string) => rows.find((row) => row.cityId === cityId)?._count._all ?? 0;
  return cities
    .filter((city) => Boolean(ruleset.cities?.[city.slug]))
    .map((city) => ({
      slug: city.slug,
      name: ruleset.cities?.[city.slug]?.name ?? city.name,
      activeHumans: count(humans, city.id),
      npcGangs: Math.max(0, count(gangs, city.id) - moving.filter((move) => move.fromCity === city.slug).length),
      inbound: moving.filter((move) => move.toCity === city.slug).length,
      reachable: city.slug === fromSlug || findRoutes(ruleset, fromSlug, city.slug).length > 0,
    }));
}

/** Fights this crew lost inside the window, as attacker or defender. */
export async function npcLostFights(prisma: PrismaClient, roundPlayerId: string, since: Date): Promise<number> {
  const fights = await prisma.raidBattle.findMany({
    where: { OR: [{ attackerId: roundPlayerId }, { defenderId: roundPlayerId }], createdAt: { gte: since }, voidedAt: null },
    select: { attackerId: true, attackerReport: true },
    take: 50,
  });
  return fights.filter((fight) => {
    const report = fight.attackerReport;
    if (!report || typeof report !== 'object' || Array.isArray(report) || typeof report.won !== 'boolean') return false;
    return fight.attackerId === roundPlayerId ? !report.won : report.won;
  }).length;
}

/** When the last revenge window anyone holds on this crew closes; it cannot move before then. */
export async function npcRevengeOpenUntil(prisma: PrismaClient, roundPlayerId: string, ruleset: Ruleset, now: Date): Promise<Date | null> {
  const hours = ruleset.combat?.strategy?.retaliation.revengeHours ?? 0;
  if (hours <= 0) return null;
  const last = await prisma.raidBattle.findFirst({
    where: { attackerId: roundPlayerId, createdAt: { gte: new Date(now.getTime() - hours * 3_600_000) }, voidedAt: null },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });
  return last ? new Date(last.createdAt.getTime() + hours * 3_600_000) : null;
}

export function storedMigrationPlan(memory: Prisma.JsonValue): NpcMigrationPlan | null {
  if (!memory || typeof memory !== 'object' || Array.isArray(memory)) return null;
  const plan = memory.migration;
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) return null;
  const { to, toName, reason, decidedAt } = plan;
  if (typeof to !== 'string' || typeof toName !== 'string' || typeof decidedAt !== 'string') return null;
  if (reason !== 'HOSTILE' && reason !== 'CROWDED' && reason !== 'QUIET' && reason !== 'RICHER') return null;
  return { to, toName, reason, decidedAt };
}
