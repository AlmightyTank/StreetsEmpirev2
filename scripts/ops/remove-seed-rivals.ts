import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const accounts = await prisma.account.findMany({
    where: {
      username: { startsWith: 'seed-rival-' },
      email: { endsWith: '@streets.local' },
    },
    select: {
      id: true,
      username: true,
      email: true,
      roundPlayers: { select: { id: true, displayName: true, publicPimpId: true } },
    },
  });

  if (accounts.length === 0) {
    console.log('No seeded rival/dev bot accounts found.');
    return;
  }

  for (const account of accounts) {
    const players = account.roundPlayers
      .map((player) => `${player.displayName} (#${player.publicPimpId})`)
      .join(', ');
    console.log(`Removing ${account.username} <${account.email}>${players ? `: ${players}` : ''}`);
  }

  const result = await prisma.account.deleteMany({
    where: {
      id: { in: accounts.map((account) => account.id) },
      username: { startsWith: 'seed-rival-' },
      email: { endsWith: '@streets.local' },
    },
  });

  console.log(`Removed ${result.count} seeded rival/dev bot account(s).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
