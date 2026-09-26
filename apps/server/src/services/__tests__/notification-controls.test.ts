import { describe, expect, it } from 'vitest';
import {
  BELL_CATEGORIES,
  bellMutedActivityTypes,
  inQuietWindow,
  localMinuteOfDay,
  NOTIFICATION_CATEGORIES,
  updateNotificationSettingsSchema,
} from '@streets/shared';
import { CATEGORY_COLUMN, channelsFor, inQuietHours, type Recipient } from '../notification-channels.js';
import { pushMessageFor } from '../push.service.js';

const recipient = (overrides: Partial<Recipient> = {}): Recipient => ({
  discordEnabled: true,
  pushEnabled: true,
  account: { isActive: true, discordId: 'd-1', _count: { pushSubscriptions: 1 } },
  ...overrides,
});
const both = { discord: true, push: true };

describe('0.9.0-G quiet hours', () => {
  it('handles windows inside a day and across midnight', () => {
    expect(inQuietWindow(60, 0, 120)).toBe(true);
    expect(inQuietWindow(120, 0, 120)).toBe(false);
    expect(inQuietWindow(23 * 60 + 30, 23 * 60, 7 * 60)).toBe(true);
    expect(inQuietWindow(6 * 60 + 59, 23 * 60, 7 * 60)).toBe(true);
    expect(inQuietWindow(7 * 60, 23 * 60, 7 * 60)).toBe(false);
    expect(inQuietWindow(12 * 60, 23 * 60, 7 * 60)).toBe(false);
    expect(inQuietWindow(500, 300, 300)).toBe(false);
  });

  it('reads the clock in the player\'s own time zone', () => {
    const at = new Date('2026-09-26T03:30:00Z');
    expect(localMinuteOfDay(at, 'UTC')).toBe(3 * 60 + 30);
    // Chicago is UTC-5 in September: 22:30 the evening before.
    expect(localMinuteOfDay(at, 'America/Chicago')).toBe(22 * 60 + 30);
    expect(inQuietHours({ quietStartMinute: 22 * 60, quietEndMinute: 7 * 60, timeZone: 'America/Chicago' }, at)).toBe(true);
    expect(inQuietHours({ quietStartMinute: 22 * 60, quietEndMinute: 7 * 60, timeZone: 'Europe/London' }, at)).toBe(true);
    expect(inQuietHours({ quietStartMinute: 22 * 60, quietEndMinute: 7 * 60, timeZone: 'Asia/Tokyo' }, at)).toBe(false);
    // Half-configured or unknown zones never silence anything.
    expect(inQuietHours({ quietStartMinute: 0, quietEndMinute: null, timeZone: 'UTC' }, at)).toBe(false);
    expect(inQuietHours({ quietStartMinute: 0, quietEndMinute: 600, timeZone: 'Nowhere/Land' }, at)).toBe(false);
  });
});

describe('0.9.0-G channels', () => {
  const at = new Date('2026-09-26T12:00:00Z');

  it('reaches linked channels normally', () => {
    expect(channelsFor(recipient(), both, at)).toEqual(['DISCORD', 'PUSH']);
    expect(channelsFor(recipient({ account: { isActive: true, discordId: null, _count: { pushSubscriptions: 0 } } }), both, at)).toEqual([]);
  });

  it('reaches nobody while paused or inside quiet hours', () => {
    expect(channelsFor(recipient({ alertsPaused: true }), both, at)).toEqual([]);
    expect(channelsFor(recipient({ quietStartMinute: 11 * 60, quietEndMinute: 13 * 60, timeZone: 'UTC' }), both, at)).toEqual([]);
    expect(channelsFor(recipient({ quietStartMinute: 13 * 60, quietEndMinute: 14 * 60, timeZone: 'UTC' }), both, at)).toEqual(['DISCORD', 'PUSH']);
  });

  it('has a settings column for every category', () => {
    expect(Object.keys(CATEGORY_COLUMN).sort()).toEqual([...NOTIFICATION_CATEGORIES].sort());
  });
});

describe('0.9.0-G settings validation', () => {
  it('accepts every category, pause, quiet hours and bell mutes', () => {
    const parsed = updateNotificationSettingsSchema.parse({
      categories: { messages: true, revenge: false },
      paused: true,
      quietHours: { start: 22 * 60, end: 7 * 60, timeZone: 'America/New_York' },
      bellMuted: ['runs'],
    });
    expect(parsed.categories).toEqual({ messages: true, revenge: false });
  });

  it('rejects unknown categories, empty windows and made-up zones', () => {
    expect(updateNotificationSettingsSchema.safeParse({ categories: { spam: true } }).success).toBe(false);
    expect(updateNotificationSettingsSchema.safeParse({ quietHours: { start: 60, end: 60, timeZone: 'UTC' } }).success).toBe(false);
    expect(updateNotificationSettingsSchema.safeParse({ quietHours: { start: 60, end: 1440, timeZone: 'UTC' } }).success).toBe(false);
    expect(updateNotificationSettingsSchema.safeParse({ quietHours: { start: 0, end: 60, timeZone: 'Mars/Base' } }).success).toBe(false);
    expect(updateNotificationSettingsSchema.safeParse({ bellMuted: ['nope'] }).success).toBe(false);
    expect(updateNotificationSettingsSchema.parse({ quietHours: null }).quietHours).toBeNull();
  });
});

describe('0.9.0-G bell categories and push text', () => {
  it('mutes only the activity types that belong to a category', () => {
    expect(bellMutedActivityTypes(['convoy']).sort()).toEqual(['CONVOY_BACKUP', 'CONVOY_DEFENSE', 'CONVOY_TAILED']);
    expect(bellMutedActivityTypes(['messages', 'turns'])).toEqual([]);
    expect(BELL_CATEGORIES).not.toContain('messages');
    expect(BELL_CATEGORIES).toContain('turfPush');
  });

  it('sends 0.9.0-G notices to devices as worded', () => {
    const notice = { title: 'Your run made it home', body: 'Your Miami Beach run made it home.', url: 'https://example.test/game/travel', tag: 'run:1' };
    expect(pushMessageFor({ category: 'runs', notice })).toEqual(notice);
  });
});
