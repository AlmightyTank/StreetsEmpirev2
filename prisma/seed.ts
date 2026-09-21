import 'dotenv/config';
import { PrismaClient, type Round } from '@prisma/client';
import { classicOgV01, classicOgV02D, classicOgV05F, type Ruleset } from '@streets/rulesets';
// The panel and the seed create the same bots from one definition. Changing the
// roster in the service changes it here too.
import { DEV_TEST_RIVALS, seedDevBots } from '../apps/server/src/services/dev-bots.service.js';

const prisma = new PrismaClient();
const CURRENT_RULESET = classicOgV05F;
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


/** Section 12. 0.5.0: every city is open. Their characters live in the ruleset; the table is names and order. */
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
    // Everyone still starts in New York City, and every city is somewhere to go.
    const isEnabled = true;

    await prisma.city.upsert({
      where: { slug: city.slug },
      update: { name: city.name, sortOrder: city.sortOrder, isEnabled },
      create: {
        slug: city.slug,
        name: city.name,
        sortOrder: city.sortOrder,
        isEnabled,
      },
    });
  }
  console.log(`  cities:   ${CITIES.length} (starting: ${CURRENT_RULESET.round.startingCitySlug})`);
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
    name: 'Game #018 - Travel',
    slug: 'game-018-travel',
    ruleset: CURRENT_RULESET,
    startsAt: now,
    refreshCurrent: true,
  });
}

type SeedNewsInput = {
  roundId?: string | null;
  title: string;
  body: string;
  isPinned?: boolean;
  publishedAt?: Date;
  discordPostedAt?: Date | null;
};

async function seedNews(input: SeedNewsInput) {
  const { roundId = null, title, body, isPinned = true, publishedAt, discordPostedAt } = input;
  const existing = await prisma.gameNews.findFirst({ where: { roundId, title } });
  const data = {
    body,
    isPinned,
    ...(publishedAt ? { publishedAt } : {}),
    ...(discordPostedAt !== undefined ? { discordPostedAt } : {}),
  };

  if (existing) {
    await prisma.gameNews.update({
      where: { id: existing.id },
      data,
    });
    console.log(`  news:     updated (${title})`);
    return;
  }

  await prisma.gameNews.create({
    data: {
      roundId,
      title,
      ...data,
    },
  });
  console.log(`  news:     ${title}`);
}

async function seedReleaseNews(publicRoundId: string, now: Date) {
  const hour = 60 * 60 * 1000;
  const posts = [
    {
      roundId: publicRoundId,
      title: '0.5.0-F TRAVEL RELEASE',
      publishedAt: new Date(now.getTime() - 96 * hour),
      body: shouldSeedRivals
        ? `Travel is live and this local seed includes active dev crews to hunt. Runs near a city can be tailed and hit from the Travel page, so use the Convoys panel to practice spotting, chasing and defending road money.\n\nThe full 0.5.0 release opens eight cities, lets crews load cash and product from home, buy wholesale while leaving town, move house for a fee and choose routes where city prices make the trip worth the risk.\n\nSeattle and Miami casino pressure, Miami's ecstasy market, shared high-market movement, road stops, arrests, escorts, Lookouts and convoy hits are all part of the travel season balance.`
        : `Travel is live. Eight cities are open, runs can load cash and product from home, and crews can buy wholesale while leaving town before chasing better prices across the map.\n\nThis release also tunes the city economy: Seattle and Miami casinos pay less, Miami keeps ecstasy tight, shared high markets move when crews buy, road stops and arrests matter, and convoys can now be found and hit from the Travel page.\n\nThe release gate runs travel, product and full-round simulations so mixed travel play has to beat street-only play before a travel season ships.`,
    },
    {
      title: '0.6.0-F TURF RELEASE',
      publishedAt: new Date(now.getTime() - 72 * hour),
      body: `Turf turns every city into territory. Forty blocks can be claimed, held, taxed, reinforced and fought over. Holding a block pays, but posted crew and guns are away from home when raids come.\n\nTurf wars land after a warning window, Lookouts can spot danger, allies can answer city calls, and successful pushes become public street history. Outposts let runs supply blocks away from home, alliances can control cities, and the federal crackdown gives late-season territory a shakeup.\n\nThe full 0.6.0 release is gated by turf simulations, phone and touch layout checks, Discord and Street Wire events, and database-backed release tests.`,
    },
    {
      title: '0.7.0-A HIDEOUT FOUNDATION',
      publishedAt: new Date(now.getTime() - 48 * hour),
      body: `The Hideout is becoming the crew's seasonal headquarters. The first 0.7.0 pass adds the new ruleset and DTO contract, level-three progress requirements, specialization metadata, a headquarters summary and product-aware Workshop naming.\n\nThis is foundation work rather than a balance spike: older rounds stay compatible, every room still upgrades correctly, and the new dashboard is built to explain cash, crew, security, products, wounds, turf, runs and Heat in one place.\n\nNext hideout updates build toward protected storage, better Lookouts, Workshop and Garage improvements, a Back Office ledger, recovery and armory views, and meaningful specializations.`,
    },
    {
      title: 'PUBLIC WEBSITE REFRESH',
      publishedAt: new Date(now.getTime() - 24 * hour),
      body: `streetsempire.dev now works as the public season hub. Players and guests can check live status, rankings, city markets, turf control, games history, Hall of Fame, statistics, news, guides, search and community links without needing to be signed into the game client.\n\nThe old game landing page has been retired in favor of a direct sign-in flow, while the public website carries discovery and season context with the StreetsEmpire look, logo and app icons.\n\nThe next pass is about keeping this hub stocked with useful player-facing information: release notes, season notes, strategy context and current game visibility.`,
    },
  ];

  for (const post of posts) {
    await seedNews({
      ...post,
      isPinned: true,
      discordPostedAt: post.publishedAt,
    });
  }
}

async function main() {
  console.log('Seeding StreetsEmpire...');
  assertSafeDevBotSeed();
  const now = new Date();
  await seedCities();
  const classicRound = await seedClassicRound(now);
  await seedNews({ roundId: classicRound.id, title: 'GAME #001 HAS BEGUN', body: 'Welcome to the first Classic OG round.' });
  await seedStrategyRound(now);
  const publicRound = await seedCurrentPublicRound(new Date(now.getTime() + 1_000));

  // A reused dev database may still have an older announcement pinned. F replaces them.
  await prisma.gameNews.deleteMany({ where: { roundId: publicRound.id, title: { in: ['0.5.0-B ON THE ROAD', '0.5.0-C HIGH MARKET & RISK', '0.5.0-D MOVING HOUSE', '0.5.0-E CONVOYS', '0.5.0 TRAVEL'] } } });
  await seedReleaseNews(publicRound.id, now);

  if (shouldSeedRivals) {
    const seeded = await seedDevBots(prisma, publicRound, CURRENT_RULESET, new Date(now.getTime() + 1_000), DEV_TEST_RIVALS, { activeAccounts: true });
    console.log(`  dev bots: ${seeded} seeded for ${publicRound.name}`);
  } else {
    console.log('  dev bots: skipped (set SEED_DEV_BOTS=1 to create active local raid targets)');
  }
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
