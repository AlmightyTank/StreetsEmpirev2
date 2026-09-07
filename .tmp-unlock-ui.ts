import { randomUUID } from 'node:crypto';
import { buildApp } from './apps/server/src/app.js';
import { classicOgV01 } from './packages/rulesets/src/index.js';
import { RoundService } from './apps/server/src/services/round.service.js';

const app = await buildApp();
try {
  if (process.argv[2] === 'cleanup' || process.argv[2] === 'preview') {
    const account = await app.prisma.account.findUniqueOrThrow({ where: { id: process.argv[3] } });
    if (!account.username.startsWith('unlock_ui_') || !account.email.endsWith('@example.invalid')) throw new Error('Not a UI fixture');
    if (process.argv[2] === 'preview') {
      await app.prisma.roundPlayer.updateMany({ where: { accountId: account.id }, data: {
        tek9Unlocked: false, ak47Unlocked: false, streetWorkTurns: 30, thugs: 5,
      } });
      console.log('UI fixture ready for locked layout check');
    } else {
      await app.prisma.account.delete({ where: { id: account.id } });
      console.log('UI fixture removed');
    }
  } else {
    const name = `unlock_ui_${randomUUID().slice(0, 6)}`;
    const password = randomUUID();
    const response = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { username: name, email: `${name}@example.invalid`, password } });
    const accountId = response.json().account.id;
    const round = await RoundService.requireCurrent(app.prisma);
    const city = await app.prisma.city.findUniqueOrThrow({ where: { slug: classicOgV01.round.startingCitySlug } });
    await app.prisma.roundPlayer.create({ data: {
      ...classicOgV01.round.startingPlayer, cashCents: 10_000_000n, thugs: 25,
      streetWorkTurns: 150, crack: 200,
      accountId, roundId: round.id, cityId: city.id, displayName: name,
      publicPimpId: -Math.floor(Math.random() * 2_000_000_000) - 1,
    } });
    console.log(JSON.stringify({ accountId, name, password }));
    const differences = await app.prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) AS count FROM "RoundPlayer" p
      JOIN (SELECT "roundPlayerId", SUM((payload->>'turns')::numeric) AS turns
            FROM "PlayerActivity" WHERE type = 'WORK_STREETS' AND (payload->>'turns') ~ '^[0-9]+$'
            GROUP BY "roundPlayerId") h ON h."roundPlayerId" = p.id
      WHERE p."streetWorkTurns" <> LEAST(2147483647, h.turns)`;
    console.log('Existing history mismatches:', Number(differences[0]?.count ?? 0));
  }
} finally { await app.close(); }
