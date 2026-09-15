import type { PrismaClient, Round } from '@prisma/client';
import { calculateNetWorthCents, calculateThugHappiness, calculateWhoreHappiness, startingStock } from '@streets/rules-engine';
import type { Ruleset, SeededRivalRule, StartingPlayer } from '@streets/rulesets';

/**
 * Local test bots, ported from prisma/seed.ts so the admin panel can add and
 * remove them. The seed script keeps its own copy for the CLI; both write the
 * same seed-rival-* accounts on @streets.local.
 */
export const DEV_BOT_USERNAME_PREFIX = 'seed-rival-';
export const DEV_BOT_EMAIL_DOMAIN = '@streets.local';

export const DEV_TEST_RIVALS = [
  {
    slug: 'razor-ray',
    displayName: 'Razor Ray',
    publicPimpId: 1000,
    note: 'Even starter target for cash raids and basic reports.',
    startingPlayer: { cashCents: 3_000_000, whores: 12, thugs: 10, pistols: 10, beer: 10, crack: 180, condoms: 180, medicine: 2 },
  },
  {
    slug: 'cashbox-carlo',
    displayName: 'Cashbox Carlo',
    publicPimpId: 1001,
    note: 'Cash-heavy target with enough stash to make recon and loot worth testing.',
    startingPlayer: { cashCents: 8_000_000, whores: 28, thugs: 8, pistols: 8, beer: 8, crack: 700, condoms: 500, medicine: 4 },
  },
  {
    slug: 'iron-maya',
    displayName: 'Iron Maya',
    publicPimpId: 1002,
    note: 'Stronger defender with rides for testing drive-bys and steal-a-ride.',
    startingPlayer: { cashCents: 4_000_000, whores: 20, thugs: 16, pistols: 16, shotguns: 5, beer: 16, crack: 400, condoms: 300, medicine: 8, lowRiders: 2 },
  },
  {
    slug: 'low-morale-lou',
    displayName: 'Low Morale Lou',
    publicPimpId: 1003,
    note: 'Unhappy crew for lure testing: no beer, no guns, low payout and thin shelves.',
    startingPlayer: { cashCents: 2_500_000, whores: 20, thugs: 17, pistols: 0, beer: 0, crack: 20, condoms: 10, payoutPercent: 10, medicine: 1, lowRiders: 1 },
  },
] as const satisfies readonly SeededRivalRule[];

export function isLocalDatabaseUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(new URL(url).hostname);
  } catch {
    return false;
  }
}

/** Why dev bots are refused here, or null when they are allowed. The panel has no override. */
export function devBotsBlockedReason(input: { isProduction: boolean; databaseUrl: string | undefined }): string | null {
  if (input.isProduction) return 'Dev bots are refused in production.';
  if (!isLocalDatabaseUrl(input.databaseUrl)) return 'Dev bots are refused against a non-local database.';
  return null;
}

export const devBotAccountWhere = {
  username: { startsWith: DEV_BOT_USERNAME_PREFIX },
  email: { endsWith: DEV_BOT_EMAIL_DOMAIN },
};

function materializeStart(ruleset: Ruleset, overrides: Partial<StartingPlayer>): StartingPlayer {
  return { ...ruleset.round.startingPlayer, ...overrides };
}

function resourceSeed(start: StartingPlayer) {
  return {
    whores: start.whores,
    thugs: start.thugs,
    woundedThugs: 0,
    condoms: start.condoms,
    medicine: start.medicine,
    crack: start.crack,
    beer: start.beer,
    pistols: start.pistols,
    shotguns: start.shotguns,
    tek9s: start.tek9s,
    ak47s: start.ak47s,
    lowRiders: start.lowRiders,
    payoutPercent: start.payoutPercent,
    cashCents: BigInt(start.cashCents),
  };
}

async function refreshRoundRanks(prisma: PrismaClient, roundId: string): Promise<void> {
  const players = await prisma.roundPlayer.findMany({
    where: { roundId },
    select: { id: true, cityId: true, netWorthCents: true, publicPimpId: true },
    orderBy: [{ netWorthCents: 'desc' }, { publicPimpId: 'asc' }],
  });

  const localSeen = new Map<string, { count: number; rank: number; worth: bigint | null }>();
  let nationalRank = 0;
  let nationalWorth: bigint | null = null;
  const now = new Date();

  for (const [index, player] of players.entries()) {
    if (nationalWorth === null || player.netWorthCents !== nationalWorth) {
      nationalRank = index + 1;
      nationalWorth = player.netWorthCents;
    }
    const local = localSeen.get(player.cityId) ?? { count: 0, rank: 0, worth: null };
    local.count += 1;
    if (local.worth === null || player.netWorthCents !== local.worth) {
      local.rank = local.count;
      local.worth = player.netWorthCents;
    }
    localSeen.set(player.cityId, local);

    await prisma.roundPlayer.update({
      where: { id: player.id },
      data: {
        nationalRank,
        localRank: local.rank,
        dailyStartingNationalRank: nationalRank,
        dailyStartingLocalRank: local.rank,
        localRankSinceAt: now,
        nationalRankSinceAt: now,
        dailyRankSnapshotAt: now,
      },
    });
  }
}

/** Create or reset the bots in a round with fresh starting resources. Returns how many were seeded. */
export async function seedDevBots(
  prisma: PrismaClient,
  round: Round,
  ruleset: Ruleset,
  now: Date,
  rivals: readonly SeededRivalRule[] = DEV_TEST_RIVALS,
  options: { activeAccounts?: boolean } = {},
): Promise<number> {
  if (!rivals.length) return 0;
  const activeAccounts = options.activeAccounts ?? true;

  const city = await prisma.city.findUnique({ where: { slug: ruleset.round.startingCitySlug } });
  if (!city?.isEnabled) throw new Error(`Starting city ${ruleset.round.startingCitySlug} is not enabled.`);

  let nextAvailablePublicPimpId = ((await prisma.roundPlayer.aggregate({
    where: { roundId: round.id },
    _max: { publicPimpId: true },
  }))._max.publicPimpId ?? (ruleset.round.publicPimpIdStart - 1)) + 1;

  for (const rival of rivals) {
    const username = `${DEV_BOT_USERNAME_PREFIX}${rival.slug}`;
    const email = `${username}${DEV_BOT_EMAIL_DOMAIN}`;
    const account = await prisma.account.upsert({
      where: { email },
      update: { username, usernameNormalized: username, isActive: activeAccounts },
      create: { username, usernameNormalized: username, email, passwordHash: 'seeded-local-rival-account', isActive: activeAccounts },
    });

    const existing = await prisma.roundPlayer.findUnique({
      where: { roundId_accountId: { roundId: round.id, accountId: account.id } },
      select: { id: true, publicPimpId: true },
    });
    let publicPimpId = existing?.publicPimpId ?? rival.publicPimpId;
    if (!existing) {
      const taken = await prisma.roundPlayer.findUnique({
        where: { roundId_publicPimpId: { roundId: round.id, publicPimpId } },
        select: { id: true },
      });
      if (taken) publicPimpId = nextAvailablePublicPimpId;
      nextAvailablePublicPimpId = Math.max(nextAvailablePublicPimpId, publicPimpId + 1);
    }

    if (existing) {
      await prisma.raidBattle.deleteMany({ where: { OR: [{ attackerId: existing.id }, { defenderId: existing.id }] } });
      await prisma.combatIntel.deleteMany({ where: { OR: [{ observerId: existing.id }, { targetId: existing.id }] } });
      await prisma.combatInjury.deleteMany({ where: { roundPlayerId: existing.id } });
    }

    const start = materializeStart(ruleset, rival.startingPlayer);
    const resources = resourceSeed(start);
    const whoreHappiness = calculateWhoreHappiness(resources, ruleset);
    const thugHappiness = calculateThugHappiness(resources, ruleset);
    const netWorthCents = calculateNetWorthCents(resources, ruleset);
    const stock = startingStock(ruleset, now);

    await prisma.roundPlayer.upsert({
      where: { roundId_accountId: { roundId: round.id, accountId: account.id } },
      update: {
        publicPimpId,
        displayName: rival.displayName,
        cityId: city.id,
        ...resources,
        turns: start.turns,
        lastTurnCalculationAt: now,
        lastActiveAt: now,
        lastAwayBonusAt: null,
        raidProtectedUntil: null,
        raidCooldownUntil: null,
        lastRaidedAt: null,
        whoreHappiness,
        thugHappiness,
        netWorthCents,
        ...stock,
      },
      create: {
        roundId: round.id,
        accountId: account.id,
        publicPimpId,
        displayName: rival.displayName,
        cityId: city.id,
        ...resources,
        turns: start.turns,
        lastTurnCalculationAt: now,
        lastActiveAt: now,
        whoreHappiness,
        thugHappiness,
        netWorthCents,
        ...stock,
      },
    });
  }

  const highestPlayer = await prisma.roundPlayer.aggregate({ where: { roundId: round.id }, _max: { publicPimpId: true } });
  await prisma.round.update({
    where: { id: round.id },
    data: { nextPublicPimpId: { set: (highestPlayer._max.publicPimpId ?? (ruleset.round.publicPimpIdStart - 1)) + 1 } },
  });
  await refreshRoundRanks(prisma, round.id);
  return rivals.length;
}

/** Delete every dev bot account (and, through cascades, their round players). Returns how many were removed. */
export async function removeDevBots(prisma: PrismaClient): Promise<number> {
  const { count } = await prisma.account.deleteMany({ where: devBotAccountWhere });
  return count;
}
