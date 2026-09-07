import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { classicOgV01 } from '@streets/rulesets';

const prisma = new PrismaClient();

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
    // 0.1.0: only the starting city is playable and every modifier is 1.00.
    const isEnabled = city.slug === classicOgV01.round.startingCitySlug;

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
  console.log(`  cities:   ${CITIES.length} (playable: ${classicOgV01.round.startingCitySlug})`);
}

async function seedRound() {
  const slug = 'game-001';
  const startsAt = new Date();
  const endsAt = new Date(
    startsAt.getTime() + classicOgV01.round.defaultDurationDays * 24 * 60 * 60 * 1000,
  );

  const round = await prisma.round.upsert({
    where: { slug },
    update: {},
    create: {
      name: 'Game #001',
      slug,
      rulesetId: classicOgV01.meta.id,
      rulesetVersion: classicOgV01.meta.version,
      status: 'ACTIVE',
      startsAt,
      endsAt,
      nextPublicPimpId: classicOgV01.round.publicPimpIdStart,
    },
  });

  console.log(
    `  round:    ${round.name} [${round.status}] ${round.rulesetId}@${round.rulesetVersion}`,
  );
  return round;
}

async function seedNews(roundId: string) {
  const title = 'GAME #001 HAS BEGUN';

  const existing = await prisma.gameNews.findFirst({ where: { roundId, title } });
  if (existing) {
    console.log('  news:     already seeded');
    return;
  }

  await prisma.gameNews.create({
    data: {
      roundId,
      title,
      body: 'Welcome to the first Classic OG round.',
      isPinned: true,
    },
  });
  console.log('  news:     1 announcement');
}

async function main() {
  console.log('Seeding Street Empire...');
  await seedCities();
  const round = await seedRound();
  await seedNews(round.id);
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
