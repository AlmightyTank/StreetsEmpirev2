import { purgeExpiredSessions } from './auth/sessions.js';
import { buildApp } from './app.js';
import { env } from './config/env.js';
import { IdempotencyService } from './services/idempotency.service.js';
import { NotificationService } from './services/notification.service.js';
import { PushService } from './services/push.service.js';
import { startPoller } from './utils/poller.js';

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

// Alerts: collect what is due, then send push. The Discord bot also collects before it claims.
let pruneAt = 0;
const stopAlerts = env.discordBot.enabled || env.push.enabled
  ? startPoller('Alerts', 60_000, async () => {
    const now = new Date();
    await NotificationService.collect(app.prisma, now);
    if (env.push.enabled) await PushService.deliverPending(app.prisma);
    if (now.getTime() >= pruneAt) {
      await NotificationService.prune(app.prisma, now);
      pruneAt = now.getTime() + 60 * 60_000;
    }
  }, (message, error) => app.log.error(error, message))
  : () => {};

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => {
    app.log.info(`${signal} received, shutting down`);
    stopAlerts();
    await app.close();
    process.exit(0);
  });
}
