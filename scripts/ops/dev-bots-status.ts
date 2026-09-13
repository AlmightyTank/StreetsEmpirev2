import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const currentRound = await prisma.round.findFirst({
    where: { status: { in: ['ACTIVE', 'REGISTRATION'] } },
    orderBy: [{ status: 'asc' }, { startsAt: 'desc' }],
    select: { id: true, name: true, slug: true, rulesetId: true, rulesetVersion: true },
  });

  const accounts = await prisma.account.findMany({
    where: {
      username: { startsWith: 'seed-rival-' },
      email: { endsWith: '@streets.local' },
    },
    select: {
      username: true,
      email: true,
      isActive: true,
      roundPlayers: {
        select: {
          roundId: true,
          displayName: true,
          publicPimpId: true,
        },
      },
    },
    orderBy: { username: 'asc' },
  });

  console.log(`Database: ${process.env.DATABASE_URL ? 'configured' : 'missing DATABASE_URL'}`);
  if (!currentRound) {
    console.log('Current round: none');
  } else {
    console.log(`Current round: ${currentRound.name} (${currentRound.rulesetId}@${currentRound.rulesetVersion})`);
  }

  if (!accounts.length) {
    console.log('Dev bots: none found');
    console.log('Add local bots: npm run db:seed:dev-bots');
    return;
  }

  const currentPlayers = currentRound
    ? accounts.flatMap((account) => account.roundPlayers.filter((player) => player.roundId === currentRound.id).map((player) => ({ account, player })))
    : [];

  console.log(`Dev bot accounts: ${accounts.length}`);
  console.log(`Dev bots in current round: ${currentPlayers.length}`);
  for (const { account, player } of currentPlayers) {
    console.log(`- ${player.displayName} (#${player.publicPimpId}) via ${account.username} ${account.isActive ? 'active' : 'inactive'}`);
  }
  console.log('Remove dev bots: npm run db:cleanup:seed-rivals');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
