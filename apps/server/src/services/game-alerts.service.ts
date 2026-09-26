import type { Prisma, PrismaClient } from '@prisma/client';
import { headsUpMinutes, loadRulesetForRound, type Ruleset } from '@streets/rules-engine';
import type { GameNoticeDto, NoticeCategory } from '@streets/shared';
import { createPlayerActivity } from './in-app-notification.service.js';
import { CATEGORY_COLUMN, channelsFor, recipientSelect, rowsFor, type ChannelSwitches, type OutboxRow } from './notification-channels.js';
import { PlayerStateService } from './player-state.service.js';
import { gameUrl } from './standings.js';

/**
 * 0.9.0-G. The alerts that happen by the clock or by someone else's hand: a push
 * your Lookouts have spotted, an ally calling for help, a tail on your run, a run
 * home, revenge running out, a special order arriving, an alliance announcement
 * and a private message.
 *
 * Critical rule: an alert only says what the player could already see in game at
 * that moment. A spotted push or tail never names the attacker (the game does not
 * either), and nothing is sent before the player's own Lookouts would have seen it.
 *
 * Each source row carries its own "alerted" marker, so a pass is idempotent and
 * the outbox dedupe key is a second guard. Clock events are also written to the
 * player's activity feed so they land in the in-game bell for everyone, whether
 * or not they take outside alerts.
 */

type Tx = Prisma.TransactionClient;

/** How long before a revenge window closes the reminder goes out. */
export const REVENGE_REMINDER_HOURS = 2;
/** The longest any Lookouts see ahead; pushes and tails further out are not looked at yet. */
const MAX_LOOKAHEAD_MS = 24 * 60 * 60_000;
const BATCH = 200;

const settingsSelect = {
  ...recipientSelect,
  turfPushEnabled: true,
  reinforcementsEnabled: true,
  convoyEnabled: true,
  runsEnabled: true,
  revengeEnabled: true,
  ordersEnabled: true,
  announcementsEnabled: true,
  messagesEnabled: true,
} as const;

type AlertSettings = Prisma.NotificationSettingsGetPayload<{ select: typeof settingsSelect }>;

const accountSettings = { select: { notificationSettings: { select: settingsSelect } } } as const;

const cityName = (ruleset: Ruleset, slug: string) => ruleset.cities?.[slug]?.name ?? slug;

function districtName(ruleset: Ruleset, city: string, district: string): string {
  const cityDistricts = ruleset.cities?.[city]?.districts as Record<string, { name: string } | undefined> | undefined;
  const base = ruleset.districts as Record<string, { name: string } | undefined>;
  return cityDistricts?.[district]?.name ?? base[district]?.name ?? district;
}

function live(round: { status: string; endsAt: Date }, now: Date): boolean {
  return round.status === 'ACTIVE' && round.endsAt > now;
}

function notice(
  accountId: string,
  settings: AlertSettings | null | undefined,
  category: NoticeCategory,
  key: string,
  body: GameNoticeDto,
  switches: ChannelSwitches,
  now: Date,
): OutboxRow[] {
  if (!settings || !settings[CATEGORY_COLUMN[category]]) return [];
  return rowsFor(accountId, channelsFor(settings, switches, now), key, { category, notice: body });
}

function json(value: Record<string, unknown>): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function rulesetOf(round: { rulesetId: string; rulesetVersion: string }): Ruleset | null {
  try {
    return loadRulesetForRound(round);
  } catch {
    return null;
  }
}

/** A push the holder's Lookouts have now spotted: "your block is being pushed". */
async function incomingPushes(tx: Tx, now: Date, switches: ChannelSwitches): Promise<OutboxRow[]> {
  const pushes = await tx.turfPush.findMany({
    where: { status: 'PENDING', defenderAlertedAt: null, landsAt: { gt: now, lte: new Date(now.getTime() + MAX_LOOKAHEAD_MS) } },
    orderBy: { landsAt: 'asc' },
    take: BATCH,
    include: {
      round: { select: { status: true, endsAt: true, rulesetId: true, rulesetVersion: true } },
      turf: { select: { district: true, holderId: true, city: { select: { slug: true } } } },
      defender: { select: { id: true, accountId: true, hideoutLookoutsLevel: true, account: accountSettings } },
    },
  });
  const rows: OutboxRow[] = [];
  for (const push of pushes) {
    const ruleset = rulesetOf(push.round);
    const abandoned = push.turf.holderId !== push.defenderId;
    if (!ruleset || abandoned || !live(push.round, now)) {
      await tx.turfPush.update({ where: { id: push.id }, data: { defenderAlertedAt: now } });
      continue;
    }
    // Exactly the turf page's rule: nothing until the Lookouts see it coming.
    const seeUntil = now.getTime() + headsUpMinutes(ruleset, push.defender.hideoutLookoutsLevel) * 60_000;
    if (push.landsAt.getTime() > seeUntil) continue;

    const claimed = await tx.turfPush.updateMany({ where: { id: push.id, defenderAlertedAt: null }, data: { defenderAlertedAt: now } });
    if (!claimed.count) continue;
    const city = cityName(ruleset, push.turf.city.slug);
    const district = districtName(ruleset, push.turf.city.slug, push.turf.district);
    await createPlayerActivity(tx, push.defenderId, 'TURF_PUSH_INCOMING', json({
      pushId: push.id, city: push.turf.city.slug, cityName: city, district: push.turf.district, districtName: district,
      landsAt: push.landsAt.toISOString(), squad: push.squad,
    }));
    rows.push(...notice(push.defender.accountId, push.defender.account.notificationSettings, 'turfPush', `turf-push:${push.id}`, {
      title: 'Your block is being pushed',
      body: `Your ${city} ${district} block is being pushed. It lands soon.`,
      url: gameUrl(`/game/turf?city=${encodeURIComponent(push.turf.city.slug)}`),
      tag: `turf-push:${push.id}`,
    }, switches, now));
  }
  return rows;
}

/** A holder called their alliance: tell the members in that city, who can send backup. */
async function turfCalls(tx: Tx, now: Date, switches: ChannelSwitches): Promise<OutboxRow[]> {
  const pushes = await tx.turfPush.findMany({
    where: { status: 'PENDING', landsAt: { gt: now }, alliesCalledAt: { not: null }, alliesAlertedAt: null },
    take: BATCH,
    include: {
      round: { select: { status: true, endsAt: true, rulesetId: true, rulesetVersion: true } },
      turf: { select: { district: true, cityId: true, city: { select: { slug: true } } } },
      defender: { select: { id: true, displayName: true, allianceId: true } },
    },
  });
  const rows: OutboxRow[] = [];
  for (const push of pushes) {
    await tx.turfPush.update({ where: { id: push.id }, data: { alliesAlertedAt: now } });
    const ruleset = rulesetOf(push.round);
    if (!ruleset || !push.defender.allianceId || !live(push.round, now)) continue;
    const members = await tx.roundPlayer.findMany({
      where: { roundId: push.roundId, allianceId: push.defender.allianceId, cityId: push.turf.cityId, id: { not: push.defenderId } },
      select: { id: true, accountId: true, account: accountSettings },
    });
    const city = cityName(ruleset, push.turf.city.slug);
    const district = districtName(ruleset, push.turf.city.slug, push.turf.district);
    for (const member of members) {
      await createPlayerActivity(tx, member.id, 'ALLIANCE_CALL', json({
        kind: 'turf', pushId: push.id, ally: push.defender.displayName, city: push.turf.city.slug, cityName: city,
        district: push.turf.district, districtName: district, landsAt: push.landsAt.toISOString(),
      }));
      rows.push(...notice(member.accountId, member.account.notificationSettings, 'reinforcements', `turf-call:${push.id}`, {
        title: `${push.defender.displayName} needs backup`,
        body: `Their ${city} ${district} block is under attack. Send reinforcements before it lands.`,
        url: gameUrl(`/game/turf?city=${encodeURIComponent(push.turf.city.slug)}`),
        tag: `turf-call:${push.id}`,
      }, switches, now));
    }
  }
  return rows;
}

/** A run owner called their alliance about a tail: tell the members in that city. */
async function convoyCalls(tx: Tx, now: Date, switches: ChannelSwitches): Promise<OutboxRow[]> {
  const tails = await tx.convoyTail.findMany({
    where: { status: 'PENDING', landsAt: { gt: now }, alliesCalledAt: { not: null }, alliesAlertedAt: null, voidedAt: null },
    take: BATCH,
    include: {
      owner: {
        select: {
          id: true, displayName: true, allianceId: true, roundId: true,
          round: { select: { status: true, endsAt: true, rulesetId: true, rulesetVersion: true } },
        },
      },
    },
  });
  const rows: OutboxRow[] = [];
  for (const tail of tails) {
    await tx.convoyTail.update({ where: { id: tail.id }, data: { alliesAlertedAt: now } });
    const ruleset = rulesetOf(tail.owner.round);
    if (!ruleset || !tail.owner.allianceId || !live(tail.owner.round, now)) continue;
    const members = await tx.roundPlayer.findMany({
      where: { roundId: tail.owner.roundId, allianceId: tail.owner.allianceId, city: { slug: tail.city }, id: { not: tail.ownerId } },
      select: { id: true, accountId: true, account: accountSettings },
    });
    const city = cityName(ruleset, tail.city);
    for (const member of members) {
      await createPlayerActivity(tx, member.id, 'ALLIANCE_CALL', json({
        kind: 'convoy', tailId: tail.id, ally: tail.owner.displayName, city: tail.city, cityName: city, landsAt: tail.landsAt.toISOString(),
      }));
      rows.push(...notice(member.accountId, member.account.notificationSettings, 'reinforcements', `convoy-call:${tail.id}`, {
        title: `${tail.owner.displayName}'s run needs backup`,
        body: `Their run is being tailed near ${city}. Ride out before the hit lands.`,
        url: gameUrl('/game/travel'),
        tag: `convoy-call:${tail.id}`,
      }, switches, now));
    }
  }
  return rows;
}

/** A tail on your run, once your Lookouts see it. Never who is tailing. */
async function tailSightings(tx: Tx, now: Date, switches: ChannelSwitches): Promise<OutboxRow[]> {
  const tails = await tx.convoyTail.findMany({
    where: { status: 'PENDING', ownerAlertedAt: null, voidedAt: null, landsAt: { gt: now, lte: new Date(now.getTime() + MAX_LOOKAHEAD_MS) } },
    orderBy: { landsAt: 'asc' },
    take: BATCH,
    include: {
      owner: {
        select: {
          id: true, accountId: true, hideoutLookoutsLevel: true, account: accountSettings,
          round: { select: { status: true, endsAt: true, rulesetId: true, rulesetVersion: true } },
        },
      },
    },
  });
  const rows: OutboxRow[] = [];
  for (const tail of tails) {
    const ruleset = rulesetOf(tail.owner.round);
    if (!ruleset || !live(tail.owner.round, now)) {
      await tx.convoyTail.update({ where: { id: tail.id }, data: { ownerAlertedAt: now } });
      continue;
    }
    // ConvoyService.alertFor's rule: the owner only sees a tail in its last minutes.
    const seeUntil = now.getTime() + headsUpMinutes(ruleset, tail.owner.hideoutLookoutsLevel) * 60_000;
    if (tail.landsAt.getTime() > seeUntil) continue;

    const claimed = await tx.convoyTail.updateMany({ where: { id: tail.id, ownerAlertedAt: null }, data: { ownerAlertedAt: now } });
    if (!claimed.count) continue;
    const city = cityName(ruleset, tail.city);
    await createPlayerActivity(tx, tail.ownerId, 'CONVOY_TAILED', json({ tailId: tail.id, city: tail.city, cityName: city, landsAt: tail.landsAt.toISOString() }));
    rows.push(...notice(tail.owner.accountId, tail.owner.account.notificationSettings, 'convoy', `convoy:${tail.id}`, {
      title: 'Your run is being tailed',
      body: `Your Lookouts spotted a tail on your run near ${city}.`,
      url: gameUrl('/game/travel'),
      tag: `convoy:${tail.id}`,
    }, switches, now));
  }
  return rows;
}

/** Runs home since the last pass. The bell already has RUN_RETURNED from settling it. */
async function runsHome(tx: Tx, now: Date, switches: ChannelSwitches): Promise<OutboxRow[]> {
  const runs = await tx.run.findMany({
    where: { status: 'RETURNED', homeAlertedAt: null, returnedAt: { gte: new Date(now.getTime() - MAX_LOOKAHEAD_MS), lte: now } },
    orderBy: { returnedAt: 'asc' },
    take: BATCH,
    include: {
      stops: { orderBy: { order: 'asc' }, select: { city: true } },
      roundPlayer: {
        select: {
          accountId: true, account: accountSettings,
          round: { select: { status: true, endsAt: true, rulesetId: true, rulesetVersion: true } },
        },
      },
    },
  });
  const rows: OutboxRow[] = [];
  for (const run of runs) {
    await tx.run.update({ where: { id: run.id }, data: { homeAlertedAt: now } });
    const ruleset = rulesetOf(run.roundPlayer.round);
    if (!ruleset) continue;
    const cities = [...new Set(run.stops.slice(0, -1).map((stop) => cityName(ruleset, stop.city)))];
    rows.push(...notice(run.roundPlayer.accountId, run.roundPlayer.account.notificationSettings, 'runs', `run:${run.id}`, {
      title: 'Your run made it home',
      body: cities.length ? `Your ${cities.join(' / ')} run made it home.` : 'Your run made it home.',
      url: gameUrl('/game/travel'),
      tag: `run:${run.id}`,
    }, switches, now));
  }
  return rows;
}

/**
 * Revenge windows about to close. A window is "their latest hit on you plus the
 * ruleset's revenge hours"; a newer hit extends it and hitting back uses it.
 */
async function revengeExpiring(tx: Tx, now: Date, switches: ChannelSwitches): Promise<OutboxRow[]> {
  const battles = await tx.raidBattle.findMany({
    where: { revengeAlertedAt: null, voidedAt: null, createdAt: { lte: new Date(now.getTime() - 60 * 60_000) } },
    orderBy: { createdAt: 'asc' },
    take: BATCH * 2,
    select: {
      id: true, attackerId: true, defenderId: true, createdAt: true,
      attacker: { select: { displayName: true, publicPimpId: true } },
      defender: {
        select: {
          accountId: true, account: accountSettings,
          round: { select: { status: true, endsAt: true, rulesetId: true, rulesetVersion: true } },
        },
      },
    },
  });
  const rows: OutboxRow[] = [];
  for (const battle of battles) {
    const ruleset = rulesetOf(battle.defender.round);
    const revengeHours = ruleset?.combat?.strategy?.retaliation.revengeHours ?? 0;
    const closesAt = battle.createdAt.getTime() + revengeHours * 3_600_000;
    const remindAt = closesAt - REVENGE_REMINDER_HOURS * 3_600_000;
    // Not due yet: leave it for a later pass.
    if (revengeHours > REVENGE_REMINDER_HOURS && now.getTime() < remindAt) continue;
    await tx.raidBattle.update({ where: { id: battle.id }, data: { revengeAlertedAt: now } });
    if (revengeHours <= REVENGE_REMINDER_HOURS || now.getTime() >= closesAt || !live(battle.defender.round, now)) continue;

    const [newerHit, hitBack] = await Promise.all([
      tx.raidBattle.count({ where: { attackerId: battle.attackerId, defenderId: battle.defenderId, voidedAt: null, createdAt: { gt: battle.createdAt } } }),
      tx.raidBattle.count({ where: { attackerId: battle.defenderId, defenderId: battle.attackerId, voidedAt: null, createdAt: { gt: battle.createdAt } } }),
    ]);
    if (newerHit || hitBack) continue;

    const expiresAt = new Date(closesAt).toISOString();
    await createPlayerActivity(tx, battle.defenderId, 'REVENGE_EXPIRING', json({
      battleId: battle.id, attacker: battle.attacker.displayName, attackerPublicPimpId: battle.attacker.publicPimpId, expiresAt,
    }));
    rows.push(...notice(battle.defender.accountId, battle.defender.account.notificationSettings, 'revenge', `revenge:${battle.id}`, {
      title: 'Revenge expires soon',
      body: `Your revenge against ${battle.attacker.displayName} expires in about ${REVENGE_REMINDER_HOURS} hours.`,
      url: gameUrl('/game/combat'),
      tag: `revenge:${battle.attacker.publicPimpId}`,
    }, switches, now));
  }
  return rows;
}

/** Scheduled clock events (special orders) that are now due. */
async function scheduled(tx: Tx, now: Date, switches: ChannelSwitches): Promise<OutboxRow[]> {
  const due = await tx.scheduledAlert.findMany({
    where: { firedAt: null, dueAt: { lte: now } },
    orderBy: { dueAt: 'asc' },
    take: BATCH,
    include: {
      roundPlayer: {
        select: { id: true, accountId: true, account: accountSettings, round: { select: { status: true, endsAt: true } } },
      },
    },
  });
  const rows: OutboxRow[] = [];
  for (const alert of due) {
    const claimed = await tx.scheduledAlert.updateMany({ where: { id: alert.id, firedAt: null }, data: { firedAt: now } });
    if (!claimed.count || !live(alert.roundPlayer.round, now) || alert.kind !== 'SPECIAL_ORDER') continue;
    const payload = alert.payload as { store?: string; item?: string; storeKey?: string };
    const store = payload.store ?? 'The store';
    const item = payload.item ?? 'Your order';
    await createPlayerActivity(tx, alert.roundPlayerId, 'SPECIAL_ORDER_READY', json({ ...payload, dueAt: alert.dueAt.toISOString() }));
    rows.push(...notice(alert.roundPlayer.accountId, alert.roundPlayer.account.notificationSettings, 'orders', `order:${alert.id}`, {
      title: 'Your special order arrived',
      body: `${item} is on the shelf at ${store}.`,
      url: gameUrl(payload.storeKey ? `/game/stores/${encodeURIComponent(payload.storeKey)}` : '/game/stores'),
      tag: `order:${alert.id}`,
    }, switches, now));
  }
  return rows;
}

/** New private messages. Outside alerts only: the Console already badges them in game. */
async function messages(tx: Tx, now: Date, switches: ChannelSwitches): Promise<OutboxRow[]> {
  const rows = await tx.directMessage.findMany({
    where: { alertsCollectedAt: null },
    orderBy: { createdAt: 'asc' },
    take: BATCH,
    select: {
      id: true, createdAt: true, readAt: true, recipientArchivedAt: true,
      sender: { select: { displayName: true } },
      recipient: { select: { accountId: true, account: accountSettings } },
    },
  });
  if (!rows.length) return [];
  await tx.directMessage.updateMany({ where: { id: { in: rows.map((row) => row.id) }, alertsCollectedAt: null }, data: { alertsCollectedAt: now } });
  const stale = now.getTime() - MAX_LOOKAHEAD_MS;
  return rows.flatMap((message) => {
    // Already read or put away, or too old to be news.
    if (message.readAt || message.recipientArchivedAt || message.createdAt.getTime() < stale) return [];
    return notice(message.recipient.accountId, message.recipient.account.notificationSettings, 'messages', `message:${message.id}`, {
      // Sender only: a lock screen is no place for someone's private words.
      title: 'New private message',
      body: `${message.sender.displayName} sent you a message.`,
      url: gameUrl('/game/console'),
      tag: 'messages',
    }, switches, now);
  });
}

/** Alliance announcements for current members, except whoever posted it. */
async function announcements(tx: Tx, now: Date, switches: ChannelSwitches): Promise<OutboxRow[]> {
  const posts = await tx.allianceWirePost.findMany({
    where: { alertsCollectedAt: null },
    orderBy: { createdAt: 'asc' },
    take: BATCH,
    select: {
      id: true, allianceId: true, authorId: true, kind: true, body: true, createdAt: true, removedAt: true,
      author: { select: { displayName: true } },
      alliance: { select: { tag: true } },
    },
  });
  if (!posts.length) return [];
  await tx.allianceWirePost.updateMany({ where: { id: { in: posts.map((post) => post.id) }, alertsCollectedAt: null }, data: { alertsCollectedAt: now } });
  const stale = now.getTime() - MAX_LOOKAHEAD_MS;
  const rows: OutboxRow[] = [];
  for (const post of posts) {
    if (post.kind !== 'ANNOUNCEMENT' || post.removedAt || post.createdAt.getTime() < stale) continue;
    const members = await tx.roundPlayer.findMany({
      where: {
        allianceId: post.allianceId,
        id: { not: post.authorId },
        OR: [{ allianceJoinedAt: null }, { allianceJoinedAt: { lte: post.createdAt } }],
        account: { notificationSettings: { announcementsEnabled: true } },
      },
      select: { accountId: true, account: accountSettings },
    });
    const excerpt = post.body.length > 120 ? `${post.body.slice(0, 117).trimEnd()}...` : post.body;
    for (const member of members) {
      rows.push(...notice(member.accountId, member.account.notificationSettings, 'announcements', `announcement:${post.id}`, {
        title: `[${post.alliance.tag}] announcement from ${post.author.displayName}`,
        body: excerpt,
        url: gameUrl('/game/alliance'),
        tag: `announcement:${post.id}`,
      }, switches, now));
    }
  }
  return rows;
}

export const GameAlertService = {
  /**
   * Settle runs that are due home, so "made it home" alerts go out while everyone
   * is offline. Like ConvoyService.sweep, it is exactly the settle the owner's next
   * page load would run.
   */
  async sweepRuns(prisma: PrismaClient, now: Date = new Date()): Promise<number> {
    const due = await prisma.run.findMany({
      where: { status: 'ACTIVE', stops: { some: { leaveAt: null, arriveAt: { lte: now } } } },
      select: { roundPlayerId: true },
      take: BATCH,
    });
    const owners = [...new Set(due.map((row) => row.roundPlayerId))];
    for (const ownerId of owners) await PlayerStateService.settle(prisma, ownerId, { markActive: false, now });
    return owners.length;
  },

  /** Every 0.9.0-G source, inside the collector's transaction and advisory lock. */
  async collect(tx: Tx, now: Date, switches: ChannelSwitches): Promise<OutboxRow[]> {
    return [
      ...await incomingPushes(tx, now, switches),
      ...await turfCalls(tx, now, switches),
      ...await convoyCalls(tx, now, switches),
      ...await tailSightings(tx, now, switches),
      ...await runsHome(tx, now, switches),
      ...await revengeExpiring(tx, now, switches),
      ...await scheduled(tx, now, switches),
      ...await messages(tx, now, switches),
      ...await announcements(tx, now, switches),
    ];
  },
};
