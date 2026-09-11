import 'dotenv/config';
import { PrismaClient, type Round } from '@prisma/client';
import { classicOgV01, classicOgV02D, type Ruleset } from '@streets/rulesets';

const prisma = new PrismaClient();
const CURRENT_RULESET = classicOgV02D;

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
    // 0.2.0-D still starts in New York City. Other cities stay staged for travel.
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
    startsAt: new Date(now.getTime() - 60_000),
  });
}

async function seedCurrentStrategyRound(now: Date) {
  return upsertRound({
    name: 'Game #004 - Strategy Raids',
    slug: 'game-004-strategy',
    ruleset: CURRENT_RULESET,
    startsAt: now,
    refreshCurrent: true,
  });
}

async function seedNews(roundId: string, title: string, body: string) {
  const existing = await prisma.gameNews.findFirst({ where: { roundId, title } });
  if (existing) {
    console.log(`  news:     already seeded (${title})`);
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

async function main() {
  console.log('Seeding Street Empire...');
  const now = new Date();
  await seedCities();
  const classicRound = await seedClassicRound(now);
  await seedNews(classicRound.id, 'GAME #001 HAS BEGUN', 'Welcome to the first Classic OG round.');
  const strategyRound = await seedCurrentStrategyRound(new Date(now.getTime() + 1_000));
  await seedNews(
    strategyRound.id,
    '0.2.0-D STRATEGY RAIDS ARE LIVE',
    'The current development round opens raids immediately with recon intel, persistent wounds, medicine treatment and 24-hour revenge windows.',
  );
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
