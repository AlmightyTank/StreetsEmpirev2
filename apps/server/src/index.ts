import { purgeExpiredSessions } from './auth/sessions.js';
import { buildApp } from './app.js';
import { env } from './config/env.js';
import { IdempotencyService } from './services/idempotency.service.js';
import { GameAlertService } from './services/game-alerts.service.js';
import { HideoutBuildService } from './services/hideout-build.service.js';
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
import { DueSettleService } from './services/due-settle.service.js';
import { metrics } from './services/metrics.service.js';
import { LawWarrantService } from './services/law-warrant.service.js';
import { LawOfficialService } from './services/law-official.service.js';
import { PlayerStateService } from './services/player-state.service.js';
import { refreshSportsbookCache } from './services/sportsbook-feed.service.js';
import { SportsbookService } from './services/sportsbook.service.js';
import { BirthdayService } from './services/birthday.service.js';
import { SupporterDropService } from './services/supporter-drop.service.js';
import { EventLifecycleService } from './services/event-lifecycle.service.js';
import { DoubleXpWeekendService } from './services/double-xp-weekend.service.js';

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

  // Recover durable event windows before accepting requests. This promotes events whose start
  // passed during downtime and confirms already-active occurrences remain in progress.
  const eventRecovery = await EventLifecycleService.sweep(app.prisma, new Date());
  if (eventRecovery.activated || eventRecovery.expired || eventRecovery.resumed) {
    app.log.info({ eventRecovery }, 'event lifecycle recovered');
  }

  await DoubleXpWeekendService.sweep(app.prisma, new Date());

  await app.listen({ host: env.HOST, port: env.PORT });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}

// Turf wars settle on their deadline even when every participant is offline.
const stopTurfWars = startPoller('Turf wars', 60_000, async () => {
  await RoundService.settleTurfClock(app.prisma, new Date());
}, (message, error) => app.log.error(error, message));

// 1.8.0-A/C: player requests read the shared pregame cache and never call a provider. Provider
// snapshots are persisted in .runtime/sportsbook-odds.json with a hard 30-minute normal
// refresh window. A 15-minute scheduler tick can recover failed leagues from another provider;
// the database lease and per-provider cooldowns bound provider usage.
const stopSportsbook = startPoller('Sportsbook odds cache', 15 * 60_000, async () => {
  const result = await refreshSportsbookCache(app.prisma, { ...env.sportsbook.keys, espn: 'public', internal: 'internal' }, new Date(), {
    normalIntervalMs: env.SPORTSBOOK_POLL_MINUTES * 60_000,
  });
  if (result.errors.length || result.warnings.length) app.log.warn({ sportsbook: result }, 'Sportsbook feed run finished with issues');
}, (message, error) => app.log.error(error, message));

// Monthly supporter drops: once a month starts, everyone supporting gets its drop within the hour.
const stopSupporterDrops = startPoller('Supporter drops', 60 * 60_000, async () => {
  const result = await SupporterDropService.sweep(app.prisma, new Date());
  if (result.granted) app.log.info({ supporterDrop: result }, 'Supporter drop given out');
}, (message, error) => app.log.error(error, message));

// Birthdays: the day-only frame and theme come off within the hour after the day ends.
const stopBirthdays = startPoller('Birthday looks', 60 * 60_000, async () => {
  const result = await BirthdayService.sweep(app.prisma, new Date());
  if (result.cleared) app.log.info({ birthdayLooks: result }, 'Birthday looks taken off');
}, (message, error) => app.log.error(error, message));

// Scheduled events advance without waiting for a player to open the Events center. The first
// reconciliation already ran before listen; this keeps later windows moving on their own.
const stopEvents = startPoller('Event lifecycle', 60_000, async () => {
  const result = await EventLifecycleService.sweep(app.prisma, new Date());
  if (result.activated || result.expired) app.log.info({ eventLifecycle: result }, 'event lifecycle advanced');
}, (message, error) => app.log.error(error, message));

// Select and schedule one persisted Double XP Weekend for each month. Keeping next month
// ready lets a first-weekend announcement go out on the preceding Monday.
const stopDoubleXpWeekends = startPoller('Double XP weekends', 60 * 60_000, async () => {
  const result = await DoubleXpWeekendService.sweep(app.prisma, new Date());
  if (result.created) app.log.info({ doubleXpWeekends: result }, 'Double XP weekend schedule updated');
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
    // Hideout builds land on time, so "construction finished" reaches the bell while their owner is away.
    for (const ownerId of await HideoutBuildService.dueOwners(app.prisma, now)) {
      await PlayerStateService.settle(app.prisma, ownerId, { markActive: false, now });
    }
    // 1.6.5-D: loan installments and property upkeep on their due time, from the cash on hand
    // then, so a missed installment reaches the bell while its owner is away.
    await DueSettleService.sweep(app.prisma, now, (roundPlayerId, error) => app.log.error({ err: error, roundPlayerId }, 'Due settle failed'));
    await SportsbookService.notifyStartedGames(app.prisma, now);
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
    stopSportsbook();
    stopSupporterDrops();
    stopBirthdays();
    stopEvents();
    stopDoubleXpWeekends();
    stopTurfWars();
    await app.close();
    process.exit(0);
  });
}
