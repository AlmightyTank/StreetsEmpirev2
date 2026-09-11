import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { calculateNetWorthCents, calculateThugHappiness, calculateWhoreHappiness, startingStock } from '@streets/rules-engine';
import { classicOgV02E } from '@streets/rulesets';

const prisma = new PrismaClient();
const rules = classicOgV02E;

function materializeStart(overrides) {
  return { ...rules.round.startingPlayer, ...overrides };
}

function resourceSeed(start) {
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

async function refreshRoundRanks(roundId) {
  const players = await prisma.roundPlayer.findMany({
    where: { roundId },
    select: { id: true, cityId: true, netWorthCents: true, publicPimpId: true },
    orderBy: [{ netWorthCents: 'desc' }, { publicPimpId: 'asc' }],
  });
  const localSeen = new Map();
  let nationalRank = 0;
  let nationalWorth = null;
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
      data: { nationalRank, localRank: local.rank, dailyStartingNationalRank: nationalRank, dailyStartingLocalRank: local.rank, localRankSinceAt: new Date(), nationalRankSinceAt: new Date(), dailyRankSnapshotAt: new Date() },
    });
  }
}

try {
  const city = await prisma.city.findUnique({ where: { slug: rules.round.startingCitySlug } });
  if (!city?.isEnabled) throw new Error('Run db:seed first to create the starting city.');
  const startsAt = new Date();
  const round = await prisma.round.upsert({
    where: { slug: 'game-005-raid-onboarding' },
    update: {
      name: 'Game #005 - Raid Onboarding',
      rulesetId: rules.meta.id,
      rulesetVersion: rules.meta.version,
      status: 'ACTIVE',
      startsAt,
      endsAt: new Date(startsAt.getTime() + rules.round.defaultDurationDays * 86_400_000),
    },
    create: {
      name: 'Game #005 - Raid Onboarding',
      slug: 'game-005-raid-onboarding',
      rulesetId: rules.meta.id,
      rulesetVersion: rules.meta.version,
      status: 'ACTIVE',
      startsAt,
      endsAt: new Date(startsAt.getTime() + rules.round.defaultDurationDays * 86_400_000),
      nextPublicPimpId: rules.round.publicPimpIdStart,
    },
  });

  let maxPublicPimpId = rules.round.publicPimpIdStart - 1;
  for (const rival of rules.round.seededRivals ?? []) {
    maxPublicPimpId = Math.max(maxPublicPimpId, rival.publicPimpId);
    const username = `seed-rival-${rival.slug}`;
    const account = await prisma.account.upsert({
      where: { email: `${username}@streets.local` },
      update: { username, usernameNormalized: username, isActive: false },
      create: { username, usernameNormalized: username, email: `${username}@streets.local`, passwordHash: 'seeded-local-rival-account', isActive: false },
    });
    const existing = await prisma.roundPlayer.findUnique({ where: { roundId_accountId: { roundId: round.id, accountId: account.id } }, select: { id: true } });
    if (existing) {
      await prisma.raidBattle.deleteMany({ where: { OR: [{ attackerId: existing.id }, { defenderId: existing.id }] } });
      await prisma.combatIntel.deleteMany({ where: { OR: [{ observerId: existing.id }, { targetId: existing.id }] } });
      await prisma.combatInjury.deleteMany({ where: { roundPlayerId: existing.id } });
    }
    const start = materializeStart(rival.startingPlayer);
    const resources = resourceSeed(start);
    await prisma.roundPlayer.upsert({
      where: { roundId_accountId: { roundId: round.id, accountId: account.id } },
      update: { publicPimpId: rival.publicPimpId, displayName: rival.displayName, cityId: city.id, ...resources, turns: start.turns, lastTurnCalculationAt: startsAt, lastActiveAt: startsAt, lastAwayBonusAt: null, raidProtectedUntil: null, raidCooldownUntil: null, lastRaidedAt: null, whoreHappiness: calculateWhoreHappiness(resources, rules), thugHappiness: calculateThugHappiness(resources, rules), netWorthCents: calculateNetWorthCents(resources, rules), ...startingStock(rules, startsAt) },
      create: { roundId: round.id, accountId: account.id, publicPimpId: rival.publicPimpId, displayName: rival.displayName, cityId: city.id, ...resources, turns: start.turns, lastTurnCalculationAt: startsAt, lastActiveAt: startsAt, whoreHappiness: calculateWhoreHappiness(resources, rules), thugHappiness: calculateThugHappiness(resources, rules), netWorthCents: calculateNetWorthCents(resources, rules), ...startingStock(rules, startsAt) },
    });
  }
  await prisma.round.update({ where: { id: round.id }, data: { nextPublicPimpId: { set: maxPublicPimpId + 1 } } });
  await refreshRoundRanks(round.id);
  console.log(`${round.name}: ${round.status}, ${round.rulesetId}@${round.rulesetVersion}. Seeded ${(rules.round.seededRivals ?? []).length} local rivals.`);
} finally {
  await prisma.$disconnect();
}
