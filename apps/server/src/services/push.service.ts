import type { PrismaClient } from '@prisma/client';
import type { NotificationPayload, PushSubscribeInput } from '@streets/shared';
import webPush from 'web-push';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';
import { gameUrl } from './standings.js';

export const MAX_PUSH_DEVICES = 10;

/**
 * The push services browsers actually hand out. The server POSTs to whatever endpoint a
 * player registers, so anything else is refused rather than letting it reach arbitrary hosts.
 */
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/,
  /^updates\.push\.services\.mozilla\.com$/,
  /^([a-z0-9-]+\.)*push\.apple\.com$/,
  /^([a-z0-9-]+\.)*notify\.windows\.com$/,
];

export function isAllowedPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  return url.protocol === 'https:' && !url.port && !url.username && !url.password
    && PUSH_HOSTS.some((host) => host.test(url.hostname));
}

export interface PushMessage {
  title: string;
  body: string;
  url: string;
  /** Alerts sharing a tag replace each other on the device instead of stacking. */
  tag: string;
}

const BATTLE_LABELS = {
  RAID: 'Raid',
  DRIVE_BY: 'Drive-by',
  DRUG_HOES: 'Drug hoes',
  STEAL_RIDE: 'Steal ride',
  LURE_CREW: 'Lure crew',
} as const;

/** Lock-screen text for one alert. Mirrors the Discord embeds, shorter. */
export function pushMessageFor(payload: NotificationPayload): PushMessage {
  switch (payload.category) {
    case 'attacks': {
      const { battle } = payload;
      return {
        title: `${BATTLE_LABELS[battle.kind]} against you`,
        body: battle.attackerWon
          ? `${battle.attackerName} hit you and won.`
          : `${battle.attackerName} hit you. Your crew held.`,
        url: gameUrl('/game/combat'),
        tag: `attack:${battle.id}`,
      };
    }
    case 'turns':
      return {
        title: 'Your turns are full',
        body: `${payload.reminder.turns}/${payload.reminder.cap} turns ready in ${payload.reminder.roundName}. Spend some before new ones go to waste.`,
        url: payload.reminder.url,
        tag: 'turns',
      };
    case 'rank': {
      const { alert } = payload;
      return {
        title: alert.kind === 'lost-first' ? 'You lost national #1' : 'You fell out of the top 10',
        body: alert.kind === 'lost-first' && alert.leaderName
          ? `${alert.leaderName} took #1. You're #${alert.rank} now.`
          : `You're #${alert.rank} nationally in ${alert.roundName}.`,
        url: alert.url,
        tag: 'rank',
      };
    }
    case 'round': {
      const { event, rank } = payload;
      const title = event.type === 'opened'
        ? `${event.roundName} is open`
        : event.type === 'ending-soon'
          ? `${event.roundName} ends soon`
          : `${event.roundName} has ended`;
      const body = event.type === 'opened'
        ? 'Sign up and start building your empire.'
        : event.type === 'ending-soon'
          ? `Last day to climb${rank ? `. You're #${rank} nationally` : ''}.`
          : rank ? `You finished #${rank} nationally.` : 'See the final rankings.';
      return { title, body, url: event.url, tag: `round:${event.type}` };
    }
  }
}

type Sender = (subscription: webPush.PushSubscription, body: string) => Promise<unknown>;

let configured = false;
const defaultSender: Sender = (subscription, body) => {
  if (!configured) {
    webPush.setVapidDetails(env.push.subject, env.push.publicKey, env.push.privateKey);
    configured = true;
  }
  // Alerts are only worth anything soon after they happen.
  return webPush.sendNotification(subscription, body, { TTL: 6 * 60 * 60, urgency: 'high' });
};

/** The push service says this subscription is gone for good. */
const isGone = (error: unknown) => {
  const status = (error as { statusCode?: number }).statusCode;
  return status === 404 || status === 410;
};

/** Why one device did not get a push, in terms a player or admin can act on. */
export function pushFailureReason(error: unknown): { status: number | null; reason: string } {
  const { statusCode, body, message } = error as { statusCode?: number; body?: string; message?: string };
  const status = typeof statusCode === 'number' ? statusCode : null;
  if (status === 404 || status === 410) return { status, reason: 'The push service no longer knows this device, so it was removed.' };
  if (status === 403) {
    return { status, reason: "The push service says this device signed up with different server keys. Turn alerts on again on that device." };
  }
  if (status === 400 || status === 401) {
    return { status, reason: 'The push service rejected the server signature. Check VAPID_SUBJECT and that the server clock is right.' };
  }
  if (status === 413) return { status, reason: 'The alert was too large for the push service.' };
  if (status === 429) return { status, reason: 'The push service is rate limiting this server. Try again in a minute.' };
  if (status !== null) return { status, reason: `The push service answered ${status}${body ? `: ${body.slice(0, 160)}` : ''}.` };
  // Thrown before any request: usually a bad key or subject in .env.
  return { status, reason: `The server could not send the alert (${(message ?? 'unknown error').replace(/\.$/, '')}). Check the VAPID settings.` };
}

async function sendToAccount(prisma: PrismaClient, accountId: string, message: PushMessage, send: Sender, now: Date) {
  const devices = await prisma.pushSubscription.findMany({ where: { accountId } });
  const body = JSON.stringify(message);
  let delivered = 0;
  const failures: Array<{ deviceId: string; label: string | null; status: number | null; reason: string }> = [];
  for (const device of devices) {
    try {
      await send({ endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } }, body);
      delivered++;
      await prisma.pushSubscription.update({ where: { id: device.id }, data: { lastSuccessAt: now } });
    } catch (error) {
      const failure = pushFailureReason(error);
      failures.push({ deviceId: device.id, label: device.deviceLabel, ...failure });
      if (isGone(error)) {
        await prisma.pushSubscription.deleteMany({ where: { id: device.id } });
      } else {
        const detail = (error as { body?: string }).body;
        console.warn(`Push to device ${device.id} failed (${failure.status ?? 'no response'}):`, error instanceof Error ? error.message : error, detail ?? '');
      }
    }
  }
  return { devices: devices.length, delivered, failures };
}

export const PushService = {
  async subscribe(prisma: PrismaClient, accountId: string, input: PushSubscribeInput, userAgent: string | null) {
    if (!env.push.configured) throw AppError.badRequest('PUSH_DISABLED', 'Phone alerts are not set up on this server yet.');
    if (!isAllowedPushEndpoint(input.endpoint)) {
      throw AppError.badRequest('PUSH_ENDPOINT_REJECTED', 'This browser uses a push service StreetsEmpire does not support.');
    }
    return prisma.$transaction(async (tx) => {
      const existing = await tx.pushSubscription.findUnique({ where: { endpoint: input.endpoint }, select: { accountId: true } });
      if (existing?.accountId !== accountId) {
        const count = await tx.pushSubscription.count({ where: { accountId } });
        if (count >= MAX_PUSH_DEVICES) {
          throw AppError.conflict('PUSH_DEVICE_LIMIT', `You can have up to ${MAX_PUSH_DEVICES} devices. Remove one first.`);
        }
      }
      const data = {
        accountId,
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
        deviceLabel: input.label ?? null,
        userAgent: userAgent?.slice(0, 300) ?? null,
      };
      // The same browser signing in as someone else moves to that account.
      const device = await tx.pushSubscription.upsert({ where: { endpoint: input.endpoint }, create: { endpoint: input.endpoint, ...data }, update: data });
      await tx.notificationSettings.upsert({ where: { accountId }, create: { accountId, pushEnabled: true }, update: { pushEnabled: true } });
      return device;
    });
  },

  async removeDevice(prisma: PrismaClient, accountId: string, id: string) {
    const { count } = await prisma.pushSubscription.deleteMany({ where: { id, accountId } });
    if (!count) throw AppError.notFound('PUSH_DEVICE_NOT_FOUND', 'That device is not registered.');
  },

  /** Signing out forgets this browser, so a shared phone stops getting the last player's alerts. */
  async removeEndpoint(prisma: PrismaClient, accountId: string, endpoint: string) {
    await prisma.pushSubscription.deleteMany({ where: { endpoint, accountId } });
  },

  async sendTest(prisma: PrismaClient, accountId: string, send: Sender = defaultSender, now = new Date()) {
    if (!env.push.configured) throw AppError.badRequest('PUSH_DISABLED', 'Phone alerts are not set up on this server yet.');
    const result = await sendToAccount(prisma, accountId, {
      title: 'StreetsEmpire alerts are on',
      body: 'This device will get the alerts you switched on.',
      url: gameUrl('/account'),
      tag: 'test',
    }, send, now);
    if (!result.devices) throw AppError.badRequest('PUSH_NO_DEVICES', 'Turn on phone alerts on this device first.');
    return result;
  },

  /** Send every waiting push alert once. Claimed before sending, so a crash never repeats one. */
  async deliverPending(prisma: PrismaClient, send: Sender = defaultSender, now = new Date(), limit = 200) {
    const rows = await prisma.$transaction(async (tx) => {
      const pending = await tx.notificationOutbox.findMany({
        where: { channel: 'PUSH', claimedAt: null },
        orderBy: { createdAt: 'asc' },
        take: limit,
        select: { id: true, accountId: true, payload: true },
      });
      if (pending.length) {
        await tx.notificationOutbox.updateMany({ where: { id: { in: pending.map((row) => row.id) }, claimedAt: null }, data: { claimedAt: now } });
      }
      return pending;
    });
    let delivered = 0;
    for (const row of rows) {
      delivered += (await sendToAccount(prisma, row.accountId, pushMessageFor(row.payload as unknown as NotificationPayload), send, now)).delivered;
    }
    return { alerts: rows.length, delivered };
  },
};
