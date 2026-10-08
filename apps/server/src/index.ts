import { purgeExpiredSessions } from './auth/sessions.js';
import { buildApp } from './app.js';
import { env } from './config/env.js';
import { IdempotencyService } from './services/idempotency.service.js';
import { GameAlertService } from './services/game-alerts.service.js';
import { FactionWarningService } from './services/faction-warning.service.js';
import { NotificationService } from './services/notification.service.js';
import { ConvoyService } from './services/convoy.service.js';
import { BossHitService } from './services/boss-hit.service.js';
import { PushService } from './services/push.service.js';
import { wakeDiscordBot } from './services/discord-bot-push.service.js';
import { RoundService } from './services/round.service.js';
import { PlatformService, buildCommit } from './services/platform.service.js';
import { APP_VERSION } from '@streets/shared';
import { startPoller } from './utils/poller.js';
import { metrics } from './services/metrics.service.js';
import { LawWarrantService } from './services/law-warrant.service.js';
import { LawOfficialService } from './services/law-official.service.js';
import { PlayerStateService } from './services/player-state.service.js';
import { NpcGangService } from './services/npc-gang.service.js';

const app = await buildApp();

try {
  // 1.0.0-A: never serve players from another environment's database.
  const binding = await PlatformService.bindDatabase(app.prisma);
  app.log.info(
    `StreetsEmpire ${APP_VERSION}${buildCommit() ? ` (${buildCommit()})` : ''} running as ${env.appEnvironment}; `
    + `database ${binding.claimed ? 'claimed for' : 'belongs to'} ${binding.environment}`,
  );

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

// Turf wars settle on their deadline even when every participant is offline.
const stopTurfWars = startPoller('Turf wars', 60_000, async () => {
  await RoundService.settleTurfClock(app.prisma, new Date());
}, (message, error) => app.log.error(error, message));

// Phase G NPC gangs: weighted archetype-driven restocks, economy moves and attacks.
const stopNpcGangs = startPoller('NPC gangs', 60_000, async () => {
  await NpcGangService.sweep(app.prisma, new Date());
}, (message, error) => app.log.error(error, message));

// Alerts: collect what is due, then send push. The Discord bot also collects before it claims.
// 0.9.0-G: always on, because clock events (spotted pushes, tails, revenge, special orders)
// reach the in-game bell even on a server with no Discord bot or push keys.
let pruneAt = 0;
// 1.4.0-D: faction warnings look hours ahead, so every ten minutes is plenty.
let factionWarningsAt = 0;
const stopAlerts = startPoller('Alerts', 60_000, async () => {
    const now = new Date();
    // 0.5.0-E: land tails whose window has closed, so a landing is pushed even if nobody is on.
    await ConvoyService.sweep(app.prisma, now);
    // Trips C: and hits on visiting bosses.
    await BossHitService.sweep(app.prisma, now);
    // 0.9.0-G: bring runs home on time, so "made it home" goes out while their owner is away.
    await GameAlertService.sweepRuns(app.prisma, now);
    // 1.3.0-C/D: serve warrants on time, personal warrants once the boss is in town, and
    // Internal Affairs stings when they are due.
    const lawOwners = new Set([...await LawWarrantService.dueOwners(app.prisma, now), ...await LawOfficialService.dueOwners(app.prisma, now)]);
    for (const ownerId of lawOwners) {
      await PlayerStateService.settle(app.prisma, ownerId, { markActive: false, now });
    }
    if (now.getTime() >= factionWarningsAt) {
      factionWarningsAt = now.getTime() + 10 * 60_000;
      await FactionWarningService.sweep(app.prisma, now);
    }
    const collected = await NotificationService.collect(app.prisma, now);
    if (collected > 0) wakeDiscordBot('alerts');
    if (env.push.enabled) metrics.recordNotifications(await PushService.deliverPending(app.prisma));
    if (now.getTime() >= pruneAt) {
      await NotificationService.prune(app.prisma, now);
      pruneAt = now.getTime() + 60 * 60_000;
    }
  }, (message, error) => app.log.error(error, message));

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => {
    app.log.info(`${signal} received, shutting down`);
    stopAlerts();
    stopNpcGangs();
    stopTurfWars();
    await app.close();
    process.exit(0);
  });
}
