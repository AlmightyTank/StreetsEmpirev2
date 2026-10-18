import type { Prisma } from '@prisma/client';
import type { NotificationPayload } from '@streets/shared';
import type { Db } from '../utils/db.js';
import { defaultChannels, channelsFor, recipientSelect, rowsFor } from './notification-channels.js';

const settingsSelect = {
  ...recipientSelect,
  ordersEnabled: true,
} as const;

/** Queue delivery after the enclosing purchase transaction commits. */
export async function queueDropOrderNotification(
  db: Db,
  accountId: string,
  dedupeKey: string,
  title: string,
  body: string,
): Promise<void> {
  // Small service mocks and older workers may not expose notification models;
  // delivery is optional and must never make a completed purchase fail.
  if (!db.account || !db.notificationOutbox) return;
  const account = await db.account.findUnique({
    where: { id: accountId },
    select: { notificationSettings: { select: settingsSelect } },
  });
  const settings = account?.notificationSettings;
  if (!settings || !settings.ordersEnabled) return;
  const payload: NotificationPayload = {
    category: 'orders',
    notice: { title, body, url: '/game/drop/wallet', tag: dedupeKey },
  };
  const rows = rowsFor(accountId, channelsFor(settings, defaultChannels()), dedupeKey, payload);
  if (rows.length) await db.notificationOutbox.createMany({ data: rows as Prisma.NotificationOutboxCreateManyInput[], skipDuplicates: true });
}
