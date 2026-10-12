import type { Prisma, PrismaClient, Round } from '@prisma/client';
import { loadRulesetForRound } from '@streets/rules-engine';
import type { NpcGangProgressionRules, NpcGangRosterEntry, NpcGangSpawnRules } from '@streets/rulesets';
import { npcRules } from './npc-gang-rules.js';
import { RoundPlayerService } from './round-player.service.js';

/**
 * Real NPC crews. The server spawns ruleset roster crews into live rounds through the
 * same join a new player uses, so each starts with the round's starting stock in the
 * starting city and has to grow by playing. This is allowed in production; dev bots
 * remain a local-only test tool.
 *
 * NPC accounts are system accounts: the username uses a dot, which no human name can,
 * the address is on a reserved `.invalid` domain, and the password hash is not a hash,
 * so nobody can sign in as one and nothing is ever mailed to one.
 */

export const NPC_ACCOUNT_DOMAIN = '@npc.streets-empire.invalid';
const NPC_USERNAME_PREFIX = 'npc.';
const NO_LOGIN = '!npc-system-account-no-login';

export const npcAccountWhere = {
  email: { endsWith: NPC_ACCOUNT_DOMAIN },
} satisfies Prisma.AccountWhereInput;

export function npcAccountUsername(slug: string): string {
  return `${NPC_USERNAME_PREFIX}${slug}`;
}

/** How many crews a round should carry for its active humans. */
export function npcCrewTarget(activeHumans: number, rules: NpcGangSpawnRules, rosterSize: number): number {
  if (!rules.enabled) return 0;
  const wanted = Math.max(rules.minCrews, Math.ceil(Math.max(0, activeHumans) / Math.max(1, rules.humansPerCrew)));
  return Math.max(0, Math.min(rules.maxCrews, rosterSize, wanted));
}

/** The next roster crew not yet in the round, in roster order. */
export function nextRosterCrew(roster: readonly NpcGangRosterEntry[], present: ReadonlySet<string>): NpcGangRosterEntry | null {
  return roster.find((entry) => !present.has(entry.slug)) ?? null;
}

const TIER_ORDER = ['SCRUB', 'STREET', 'VETERAN', 'KINGPIN'] as const;

/**
 * The tier a crew has earned: the highest whose net-worth multiple it has reached since
 * it spawned. Tiers only go up; a crew that collapses breaks up rather than demotes.
 */
export function npcProgressTier(input: { startNetWorthCents: number; netWorthCents: number; currentTier: string; rules: NpcGangProgressionRules }): string {
  const current = Math.max(0, TIER_ORDER.indexOf(input.currentTier as (typeof TIER_ORDER)[number]));
  if (!input.rules.enabled || input.startNetWorthCents <= 0) return TIER_ORDER[current]!;
  const multiple = input.netWorthCents / input.startNetWorthCents;
  const earned = multiple >= input.rules.netWorthMultiple.KINGPIN ? 3
    : multiple >= input.rules.netWorthMultiple.VETERAN ? 2
      : multiple >= input.rules.netWorthMultiple.STREET ? 1
        : 0;
  return TIER_ORDER[Math.max(current, earned)]!;
}

async function spawn(prisma: PrismaClient, round: Round, entry: NpcGangRosterEntry, now: Date): Promise<string> {
  const username = npcAccountUsername(entry.slug);
  const email = `${username}${NPC_ACCOUNT_DOMAIN}`;
  const account = await prisma.account.upsert({
    where: { email },
    update: { isActive: true },
    create: {
      username,
      usernameNormalized: username,
      email,
      passwordHash: NO_LOGIN,
      isActive: true,
      rulesAcceptedAt: now,
      ageConfirmedAt: now,
    },
  });
  // The same join a player makes: starting stock, starting city, opening ranks.
  const player = await RoundPlayerService.join(prisma, round, account);
  await prisma.roundPlayer.update({ where: { id: player.id }, data: { displayName: entry.bossName } });
  await prisma.npcGang.create({
    data: {
      roundPlayerId: player.id,
      archetype: entry.personality,
      tier: 'SCRUB',
      homeCityId: player.cityId,
      aggression: entry.aggression,
      ambition: entry.ambition,
      discipline: entry.discipline,
      // A new crew gets its bearings before its first move.
      nextActionAt: new Date(now.getTime() + 10 * 60_000),
      memory: {
        source: 'roster',
        slug: entry.slug,
        identity: { name: entry.crewName, tag: entry.crewTag },
        startNetWorthCents: Number(player.netWorthCents),
      },
    },
  });
  return entry.slug;
}

export const NpcGangSpawnService = {
  /**
   * Called from each scheduler sweep. For every active round, spawns at most one missing
   * roster crew, no sooner than `spawnEveryMinutes` after the last NPC crew joined, until
   * the round carries its target for the humans playing it. Dev bots count toward it.
   */
  async ensureCrews(prisma: PrismaClient, now = new Date()): Promise<string[]> {
    const rounds = await prisma.round.findMany({ where: { status: 'ACTIVE', endsAt: { gt: now } } });
    const spawned: string[] = [];
    for (const round of rounds) {
      const rules = npcRules(loadRulesetForRound(round));
      if (!rules.enabled || !rules.spawn.enabled || !rules.roster.length) continue;
      const since = new Date(now.getTime() - Math.max(1, rules.spawn.activeHumanHours) * 3_600_000);
      const [activeHumans, gangs] = await Promise.all([
        prisma.roundPlayer.count({ where: { roundId: round.id, npcGang: { is: null }, account: { isActive: true }, lastActiveAt: { gte: since } } }),
        prisma.npcGang.findMany({ where: { roundPlayer: { roundId: round.id } }, select: { memory: true, createdAt: true }, orderBy: { createdAt: 'desc' } }),
      ]);
      if (gangs.length >= npcCrewTarget(activeHumans, rules.spawn, rules.roster.length)) continue;
      if (gangs[0] && now.getTime() - gangs[0].createdAt.getTime() < rules.spawn.spawnEveryMinutes * 60_000) continue;
      const present = new Set(gangs.flatMap((gang) => {
        const memory = gang.memory;
        return memory && typeof memory === 'object' && !Array.isArray(memory) && typeof memory.slug === 'string' ? [memory.slug] : [];
      }));
      // A roster crew whose account already sits in this round (e.g. its gang row was
      // removed by hand) is skipped rather than joined twice.
      const joined = await prisma.roundPlayer.findMany({
        where: { roundId: round.id, account: npcAccountWhere },
        select: { account: { select: { username: true } } },
      });
      for (const row of joined) present.add(row.account.username.slice(NPC_USERNAME_PREFIX.length));
      const entry = nextRosterCrew(rules.roster, present);
      if (!entry) continue;
      try {
        spawned.push(await spawn(prisma, round, entry, now));
      } catch {
        // Registration closed, or another sweep got there first: try again next sweep.
      }
    }
    return spawned;
  },

  /** Admin: spawn the next roster crew now, ignoring the target and the spacing. */
  async spawnNext(prisma: PrismaClient, round: Round, now = new Date()): Promise<string | null> {
    const rules = npcRules(loadRulesetForRound(round));
    const joined = await prisma.roundPlayer.findMany({
      where: { roundId: round.id, account: npcAccountWhere },
      select: { account: { select: { username: true } } },
    });
    const present = new Set(joined.map((row) => row.account.username.slice(NPC_USERNAME_PREFIX.length)));
    const entry = nextRosterCrew(rules.roster, present);
    return entry ? spawn(prisma, round, entry, now) : null;
  },
};
