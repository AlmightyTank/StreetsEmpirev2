import type { NotificationChannel, Prisma } from '@prisma/client';
import {
  inQuietWindow,
  isValidTimeZone,
  localMinuteOfDay,
  type NotificationCategory,
  type NotificationPayload,
} from '@streets/shared';
import { env } from '../config/env.js';

/** Which channels collection writes rows for. Defaults follow what this server has configured. */
export interface ChannelSwitches {
  discord: boolean;
  push: boolean;
}

export const defaultChannels = (): ChannelSwitches => ({ discord: env.discordBot.enabled, push: env.push.configured });

export type Recipient = {
  discordEnabled: boolean;
  pushEnabled: boolean;
  /** 0.9.0-G quiet controls; absent on callers from before them means "not paused, no quiet hours". */
  alertsPaused?: boolean;
  quietStartMinute?: number | null;
  quietEndMinute?: number | null;
  timeZone?: string | null;
  account: { isActive: boolean; discordId: string | null; _count: { pushSubscriptions: number } };
};

export const recipientSelect = {
  discordEnabled: true,
  pushEnabled: true,
  alertsPaused: true,
  quietStartMinute: true,
  quietEndMinute: true,
  timeZone: true,
  account: { select: { isActive: true, discordId: true, _count: { select: { pushSubscriptions: true } } } },
} as const;

/** 0.9.0-G. Inside the player's quiet hours right now? An unknown zone never silences anything. */
export function inQuietHours(recipient: Pick<Recipient, 'quietStartMinute' | 'quietEndMinute' | 'timeZone'>, now: Date): boolean {
  const { quietStartMinute: start, quietEndMinute: end, timeZone } = recipient;
  if (start == null || end == null || !timeZone || !isValidTimeZone(timeZone)) return false;
  return inQuietWindow(localMinuteOfDay(now, timeZone), start, end);
}

/**
 * The channels that can reach this account right now. Paused alerts and quiet
 * hours reach nobody; the in-game bell is written separately and keeps everything.
 */
export function channelsFor(recipient: Recipient, switches: ChannelSwitches, now: Date = new Date()): NotificationChannel[] {
  if (!recipient.account.isActive) return [];
  if (recipient.alertsPaused) return [];
  if (inQuietHours(recipient, now)) return [];
  const channels: NotificationChannel[] = [];
  if (switches.discord && recipient.discordEnabled && recipient.account.discordId) channels.push('DISCORD');
  if (switches.push && recipient.pushEnabled && recipient.account._count.pushSubscriptions > 0) channels.push('PUSH');
  return channels;
}

export type OutboxRow = Prisma.NotificationOutboxCreateManyInput;

export function rowsFor(accountId: string, channels: NotificationChannel[], key: string, payload: NotificationPayload): OutboxRow[] {
  return channels.map((channel) => ({
    accountId,
    channel,
    category: payload.category,
    payload: payload as unknown as Prisma.InputJsonValue,
    dedupeKey: `${key}:${accountId}:${channel}`,
  }));
}

/** The settings column behind each category's outside-alert switch. */
export const CATEGORY_COLUMN = {
  attacks: 'attacksEnabled',
  turfPush: 'turfPushEnabled',
  turf: 'turfEnabled',
  reinforcements: 'reinforcementsEnabled',
  alliance: 'allianceEnabled',
  convoy: 'convoyEnabled',
  runs: 'runsEnabled',
  revenge: 'revengeEnabled',
  orders: 'ordersEnabled',
  announcements: 'announcementsEnabled',
  messages: 'messagesEnabled',
  turns: 'turnsEnabled',
  rank: 'rankEnabled',
  round: 'roundEnabled',
} as const satisfies Record<NotificationCategory, keyof Prisma.NotificationSettingsUncheckedCreateInput>;
