import type { ActivityType } from './types/api.js';

/**
 * 0.9.0-G. Every alert category a player can switch, in display order. The first
 * six are the original Discord /alerts types; the rest arrived with 0.9.0-G and
 * reach Discord as generic notices.
 */
export const NOTIFICATION_CATEGORIES = [
  'attacks',
  'turfPush',
  'turf',
  'reinforcements',
  'alliance',
  'convoy',
  'runs',
  'revenge',
  'orders',
  'announcements',
  'messages',
  'turns',
  'rank',
  'round',
] as const;

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

/** Categories that alert through the generic notice shape (title/body/url). */
export type NoticeCategory = Exclude<NotificationCategory, 'attacks' | 'turns' | 'rank' | 'round' | 'turf' | 'alliance'>;

/**
 * Which bell items belong to which category, so a muted category disappears from
 * the in-game bell and its toasts. Activity types not listed (quests, away bonus,
 * admin grants, busts) always show: they are system events, not alerts.
 */
export const BELL_CATEGORY_BY_ACTIVITY: Partial<Record<ActivityType, NotificationCategory>> = {
  RAID_DEFENSE: 'attacks',
  DRIVE_BY_DEFENSE: 'attacks',
  TURF_PUSH_INCOMING: 'turfPush',
  TURF_PUSH_DEFENSE: 'turf',
  TURF_CLAIM: 'turf',
  TURF_PUSH_ATTACK: 'turf',
  TURF_PUSH_BACKUP: 'turf',
  ALLIANCE_CALL: 'reinforcements',
  CONVOY_TAILED: 'convoy',
  CONVOY_DEFENSE: 'convoy',
  CONVOY_BACKUP: 'convoy',
  RUN_RETURNED: 'runs',
  RUN_INCIDENT: 'runs',
  REVENGE_EXPIRING: 'revenge',
  SPECIAL_ORDER_READY: 'orders',
};

/** Categories that have in-game bell items, and so can be muted there. */
export const BELL_CATEGORIES: readonly NotificationCategory[] = NOTIFICATION_CATEGORIES
  .filter((category) => Object.values(BELL_CATEGORY_BY_ACTIVITY).includes(category));

/** Activity types hidden from the bell by these muted categories. */
export function bellMutedActivityTypes(muted: readonly string[]): ActivityType[] {
  const set = new Set(muted);
  return (Object.entries(BELL_CATEGORY_BY_ACTIVITY) as Array<[ActivityType, NotificationCategory]>)
    .filter(([, category]) => set.has(category))
    .map(([type]) => type);
}

/** Is a local time (minutes after midnight) inside a quiet window that may wrap midnight? */
export function inQuietWindow(minute: number, start: number, end: number): boolean {
  if (start === end) return false;
  return start < end ? minute >= start && minute < end : minute >= start || minute < end;
}

/** A real IANA time zone this runtime can format in. */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** Minutes after local midnight in `timeZone` at `now`. */
export function localMinuteOfDay(now: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(now);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? 0);
  return (hour % 24) * 60 + minute;
}
