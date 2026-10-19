import type { QuestCosmeticDefinition } from './types.js';

/**
 * Birthdays (docs/BIRTHDAYS.md). Every account gives a birth date before it can
 * play, so the game can mark the day. Everything here is Crowns or cosmetic:
 * nothing touches cash, turns, combat or anything else in the competitive game.
 *
 * Times are UTC. "The day" runs 12 hours either side of the birthday's UTC
 * date, so it covers the whole birthday in every time zone. "The week" starts
 * with the day and runs seven days: the gift can be claimed and the shop
 * discount holds for all of it.
 */
export const BIRTHDAY_SOURCE = 'birthday';
export const BIRTHDAY_GIFT_CROWNS = 300;
/** Off Drop items, bundles and Street Pass skips during the birthday week. Never Crown packs. */
export const BIRTHDAY_DISCOUNT_PERCENT = 15;
export const BIRTHDAY_WEEK_DAYS = 7;

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const SLACK_MS = 12 * HOUR_MS;

/** Kept for good once the first birthday gift is claimed. */
export const BIRTHDAY_TITLE: QuestCosmeticDefinition = {
  key: 'birthday-title',
  name: 'Birthday Boss',
  description: 'Celebrated a birthday on the streets. Claimed with a birthday gift and kept for good.',
  kind: 'TITLE_BADGE',
  rarity: 'rare',
};

/** Wearable only on the day; never stored as an unlock. */
export const BIRTHDAY_FRAME: QuestCosmeticDefinition = {
  key: 'birthday-frame',
  name: 'Birthday Frame',
  description: 'Confetti and candlelight around your profile and avatar. Yours to wear on your birthday.',
  kind: 'PROFILE_FRAME',
  rarity: 'epic',
  styleKey: 'birthday-frame',
};

/** Wearable only on the day; never stored as an unlock. */
export const BIRTHDAY_THEME: QuestCosmeticDefinition = {
  key: 'birthday-shell',
  name: 'Birthday Bash',
  description: 'The whole game dressed for a party: balloons, confetti and candlelight. Yours to wear on your birthday.',
  kind: 'SITE_THEME',
  rarity: 'legendary',
  styleKey: 'birthday-shell',
};

export interface BirthdayWindow {
  /** The year the birthday falls in; one gift per year. */
  readonly year: number;
  /** The birthday's date that year, YYYY-MM-DD (28 February for a 29 February birthday outside a leap year). */
  readonly date: string;
  readonly dayStartsAt: Date;
  readonly dayEndsAt: Date;
  readonly weekEndsAt: Date;
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function windowFor(birthDate: Date, year: number): BirthdayWindow {
  const month = birthDate.getUTCMonth();
  let day = birthDate.getUTCDate();
  if (month === 1 && day === 29 && !isLeapYear(year)) day = 28;
  const midnight = Date.UTC(year, month, day);
  return {
    year,
    date: new Date(midnight).toISOString().slice(0, 10),
    dayStartsAt: new Date(midnight - SLACK_MS),
    dayEndsAt: new Date(midnight + DAY_MS + SLACK_MS),
    weekEndsAt: new Date(midnight + BIRTHDAY_WEEK_DAYS * DAY_MS + SLACK_MS),
  };
}

/** The birthday week `now` falls in, or null outside one. */
export function birthdayWindow(birthDate: Date | null | undefined, now: Date): BirthdayWindow | null {
  if (!birthDate || Number.isNaN(birthDate.getTime())) return null;
  const year = now.getUTCFullYear();
  // Last year's week can run into January; next year's day can start on 31 December.
  for (const candidate of [year - 1, year, year + 1]) {
    const window = windowFor(birthDate, candidate);
    if (now >= window.dayStartsAt && now < window.weekEndsAt) return window;
  }
  return null;
}

/** Whether `now` is on the birthday itself (the 48 hours that cover it in every time zone). */
export function isBirthdayDay(window: BirthdayWindow | null, now: Date): boolean {
  return Boolean(window && now >= window.dayStartsAt && now < window.dayEndsAt);
}

/** Ledger idempotency key for one account's gift in one year. */
export function birthdayGiftRef(accountId: string, year: number): string {
  return `birthday:${accountId}:${year}`;
}
