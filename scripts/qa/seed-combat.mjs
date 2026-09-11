import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { classicOgV02 } from '@streets/rulesets';

const prisma = new PrismaClient();
try {
  const rules = classicOgV02;
  const city = await prisma.city.findUnique({ where: { slug: rules.round.startingCitySlug } });
  if (!city?.isEnabled) throw new Error('Run db:seed first to create the starting city.');
  const startsAt = new Date();
  const round = await prisma.round.upsert({
    where: { slug: 'game-002-combat' }, update: {},
    create: { name: 'Game #002 — Cash Raids', slug: 'game-002-combat', rulesetId: rules.meta.id, rulesetVersion: rules.meta.version,
      status: 'ACTIVE', startsAt, endsAt: new Date(startsAt.getTime() + rules.round.defaultDurationDays * 86_400_000), nextPublicPimpId: rules.round.publicPimpIdStart },
  });
  console.log(`${round.name}: ${round.status}, ${round.rulesetId}@${round.rulesetVersion}. Existing rounds and players were preserved.`);
} finally {
  await prisma.$disconnect();
}
