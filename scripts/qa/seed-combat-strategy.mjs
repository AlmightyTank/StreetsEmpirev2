import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { classicOgV02D } from '@streets/rulesets';

const prisma = new PrismaClient();
try {
  const rules = classicOgV02D;
  const city = await prisma.city.findUnique({ where: { slug: rules.round.startingCitySlug } });
  if (!city?.isEnabled) throw new Error('Run db:seed first to create the starting city.');
  const startsAt = new Date();
  const round = await prisma.round.upsert({
    where: { slug: 'game-004-strategy' },
    update: {
      name: 'Game #004 - Strategy Raids',
      rulesetId: rules.meta.id,
      rulesetVersion: rules.meta.version,
      status: 'ACTIVE',
      startsAt,
      endsAt: new Date(startsAt.getTime() + rules.round.defaultDurationDays * 86_400_000),
    },
    create: {
      name: 'Game #004 - Strategy Raids',
      slug: 'game-004-strategy',
      rulesetId: rules.meta.id,
      rulesetVersion: rules.meta.version,
      status: 'ACTIVE',
      startsAt,
      endsAt: new Date(startsAt.getTime() + rules.round.defaultDurationDays * 86_400_000),
      nextPublicPimpId: rules.round.publicPimpIdStart,
    },
  });
  console.log(`${round.name}: ${round.status}, ${round.rulesetId}@${round.rulesetVersion}. It is now the latest active local round.`);
} finally {
  await prisma.$disconnect();
}
