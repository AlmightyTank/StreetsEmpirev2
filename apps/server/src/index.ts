import { purgeExpiredSessions } from './auth/sessions.js';
import { buildApp } from './app.js';
import { env } from './config/env.js';
import { IdempotencyService } from './services/idempotency.service.js';

const app = await buildApp();

try {
  const [purgedSessions, purgedActions] = await Promise.all([
    purgeExpiredSessions(app.prisma),
    IdempotencyService.purgeExpired(app.prisma),
  ]);
  if (purgedSessions > 0) app.log.info(`purged ${purgedSessions} expired session(s)`);
  if (purgedActions > 0) app.log.info(`purged ${purgedActions} expired action(s)`);

  await app.listen({ host: env.HOST, port: env.PORT });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => {
    app.log.info(`${signal} received, shutting down`);
    await app.close();
    process.exit(0);
  });
}
