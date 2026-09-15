import 'dotenv/config';
import { PrismaClient, type Round } from '@prisma/client';
import { calculateNetWorthCents, calculateThugHappiness, calculateWhoreHappiness, startingStock } from '@streets/rules-engine';
import { classicOgV01, classicOgV02D, classicOgV03B, type Ruleset, type SeededRivalRule, type StartingPlayer } from '@streets/rulesets';

const prisma = new PrismaClient();
const CURRENT_RULESET = classicOgV03B;
const shouldSeedRivals = process.env.SEED_DEV_BOTS === '1' || process.env.SEED_RIVALS === '1';
const allowUnsafeDevBots = process.env.ALLOW_DEV_BOTS === 'I_UNDERSTAND';

function isLocalDatabase(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname);
  } catch {
    return false;
  }
}

function assertSafeDevBotSeed(): void {
  if (!shouldSeedRivals) return;
  if (process.env.NODE_ENV === 'production' && !allowUnsafeDevBots) {
    throw new Error('Refusing to seed dev bots with NODE_ENV=production. Set ALLOW_DEV_BOTS=I_UNDERSTAND only for a deliberate one-off test.');
  }
  if (!isLocalDatabase(process.env.DATABASE_URL) && !allowUnsafeDevBots) {
    throw new Error('Refusing to seed dev bots into a non-local DATABASE_URL. Set ALLOW_DEV_BOTS=I_UNDERSTAND only if this is an isolated test database.');
  }
}


const DEV_TEST_RIVALS = [
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

/** Section 12. Travel is not player-facing yet, but the map exists from day one. */
const CITIES = [
  { slug: 'new-york-city', name: 'New York City', sortOrder: 1 },
  { slug: 'detroit', name: 'Detroit', sortOrder: 2 },
  { slug: 'miami-beach', name: 'Miami Beach', sortOrder: 3 },
  { slug: 'seattle', name: 'Seattle', sortOrder: 4 },
  { slug: 'beverly-hills', name: 'Beverly Hills', sortOrder: 5 },
  { slug: 'las-vegas', name: 'Las Vegas', sortOrder: 6 },
  { slug: 'los-angeles', name: 'Los Angeles', sortOrder: 7 },
  { slug: 'atlanta', name: 'Atlanta', sortOrder: 8 },
] as const;

async function seedCities() {
  for (const city of CITIES) {
    // 0.3.0-B still starts in New York City. Other cities stay staged for travel.
    const isEnabled = city.slug === CURRENT_RULESET.round.startingCitySlug;

    await prisma.city.upsert({
      where: { slug: city.slug },
      update: { name: city.name, sortOrder: city.sortOrder, isEnabled },
      create: {
        slug: city.slug,
        name: city.name,
        sortOrder: city.sortOrder,
        isEnabled,
        scoutModifier: 1.0,
        incomeModifier: 1.0,
        crackModifier: 1.0,
      },
    });
  }
  console.log(`  cities:   ${CITIES.length} (playable: ${CURRENT_RULESET.round.startingCitySlug})`);
}

async function upsertRound(options: { name: string; slug: string; ruleset: Ruleset; startsAt: Date; refreshCurrent?: boolean }): Promise<Round> {
  const { name, slug, ruleset, startsAt, refreshCurrent = false } = options;
  const endsAt = new Date(startsAt.getTime() + ruleset.round.defaultDurationDays * 24 * 60 * 60 * 1000);

  const round = await prisma.round.upsert({
    where: { slug },
    update: refreshCurrent
      ? {
          name,
          rulesetId: ruleset.meta.id,
          rulesetVersion: ruleset.meta.version,
          status: 'ACTIVE',
          startsAt,
          endsAt,
        }
      : {},
    create: {
      name,
      slug,
      rulesetId: ruleset.meta.id,
      rulesetVersion: ruleset.meta.version,
      status: 'ACTIVE',
      startsAt,
      endsAt,
      nextPublicPimpId: ruleset.round.publicPimpIdStart,
    },
  });

  console.log(
    `  round:    ${round.name} [${round.status}] ${round.rulesetId}@${round.rulesetVersion}`,
  );
  return round;
}

async function seedClassicRound(now: Date) {
  return upsertRound({
    name: 'Game #001',
    slug: 'game-001',
    ruleset: classicOgV01,
    startsAt: new Date(now.getTime() - 120_000),
  });
}

async function seedStrategyRound(now: Date) {
  return upsertRound({
    name: 'Game #004 - Strategy Raids',
    slug: 'game-004-strategy',
    ruleset: classicOgV02D,
    startsAt: new Date(now.getTime() - 60_000),
  });
}

async function seedCurrentPublicRound(now: Date) {
  return upsertRound({
    name: 'Game #010 - Admin',
    slug: 'game-010-admin',
    ruleset: CURRENT_RULESET,
    startsAt: now,
    refreshCurrent: true,
  });
}

async function seedNews(roundId: string, title: string, body: string) {
  const existing = await prisma.gameNews.findFirst({ where: { roundId, title } });
  if (existing) {
    await prisma.gameNews.update({
      where: { id: existing.id },
      data: { body, isPinned: true },
    });
    console.log(`  news:     updated (${title})`);
    return;
  }

  await prisma.gameNews.create({
    data: {
      roundId,
      title,
      body,
      isPinned: true,
    },
  });
  console.log(`  news:     ${title}`);
}

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

async function refreshRoundRanks(roundId: string) {
  const players = await prisma.roundPlayer.findMany({
    where: { roundId },
    select: { id: true, cityId: true, netWorthCents: true, publicPimpId: true },
    orderBy: [{ netWorthCents: 'desc' }, { publicPimpId: 'asc' }],
  });

  const localSeen = new Map<string, { count: number; rank: number; worth: bigint | null }>();
  let nationalRank = 0;
  let nationalWorth: bigint | null = null;

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
        localRankSinceAt: new Date(),
        nationalRankSinceAt: new Date(),
        dailyRankSnapshotAt: new Date(),
      },
    });
  }
}

async function seedRivals(round: Round, ruleset: Ruleset, now: Date, rivals: readonly SeededRivalRule[] = ruleset.round.seededRivals ?? [], options: { activeAccounts?: boolean; label?: string } = {}) {
  if (!rivals.length) return;
  if (!shouldSeedRivals) {
    console.log('  dev bots: skipped (set SEED_DEV_BOTS=1 to create active local raid targets)');
    return;
  }

  const activeAccounts = options.activeAccounts ?? false;
  const label = options.label ?? 'rivals';

  const city = await prisma.city.findUnique({ where: { slug: ruleset.round.startingCitySlug } });
  if (!city?.isEnabled) throw new Error(`Starting city ${ruleset.round.startingCitySlug} is not enabled.`);

  let nextAvailablePublicPimpId = (await prisma.roundPlayer.aggregate({
    where: { roundId: round.id },
    _max: { publicPimpId: true },
  }))._max.publicPimpId ?? (ruleset.round.publicPimpIdStart - 1);
  nextAvailablePublicPimpId += 1;

  for (const rival of rivals) {
    const username = `seed-rival-${rival.slug}`;
    const email = `${username}@streets.local`;
    const account = await prisma.account.upsert({
      where: { email },
      update: {
        username,
        usernameNormalized: username,
        isActive: activeAccounts,
      },
      create: {
        username,
        usernameNormalized: username,
        email,
        passwordHash: 'seeded-local-rival-account',
        isActive: activeAccounts,
      },
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
      await prisma.raidBattle.deleteMany({
        where: { OR: [{ attackerId: existing.id }, { defenderId: existing.id }] },
      });
      await prisma.combatIntel.deleteMany({
        where: { OR: [{ observerId: existing.id }, { targetId: existing.id }] },
      });
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

  const highestPlayer = await prisma.roundPlayer.aggregate({
    where: { roundId: round.id },
    _max: { publicPimpId: true },
  });
  await prisma.round.update({
    where: { id: round.id },
    data: { nextPublicPimpId: { set: (highestPlayer._max.publicPimpId ?? (ruleset.round.publicPimpIdStart - 1)) + 1 } },
  });
  await refreshRoundRanks(round.id);
  console.log(`  ${label}: ${rivals.length} seeded for ${round.name}`);
}

async function main() {
  console.log('Seeding Street Empire...');
  assertSafeDevBotSeed();
  const now = new Date();
  await seedCities();
  const classicRound = await seedClassicRound(now);
  await seedNews(classicRound.id, 'GAME #001 HAS BEGUN', 'Welcome to the first Classic OG round.');
  await seedStrategyRound(now);
  const publicRound = await seedCurrentPublicRound(new Date(now.getTime() + 1_000));
  await seedNews(
    publicRound.id,
    '0.3.0-B ADMIN TOOLS',
    shouldSeedRivals
      ? 'The current B seed has active local dev bots enabled. Admins can now schedule, open, start, end and archive rounds from the admin panel, and every admin action is audited.'
      : 'The 0.3.0-B round keeps 0.3.0-A balance. Admins now run seasons from the admin panel instead of the seed, and every admin action is audited.',
  );
  await seedRivals(publicRound, CURRENT_RULESET, new Date(now.getTime() + 1_000), DEV_TEST_RIVALS, { activeAccounts: true, label: 'dev bots' });
  console.log('Done.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
