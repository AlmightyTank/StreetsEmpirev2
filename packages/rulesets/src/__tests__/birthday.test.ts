import { describe, expect, it } from 'vitest';
import { BIRTHDAY_FRAME, BIRTHDAY_THEME, BIRTHDAY_TITLE, birthdayGiftRef, birthdayWindow, isBirthdayDay } from '../index.js';

const born = (date: string) => new Date(`${date}T00:00:00.000Z`);
const at = (iso: string) => new Date(iso);

describe('Birthday windows', () => {
  it('covers the birthday in every time zone and runs the week after it', () => {
    const birth = born('1990-06-15');
    expect(birthdayWindow(birth, at('2026-06-14T11:59:59Z'))).toBeNull();
    const start = birthdayWindow(birth, at('2026-06-14T12:00:00Z'))!;
    expect(start).toMatchObject({ year: 2026, date: '2026-06-15' });
    expect(isBirthdayDay(start, at('2026-06-14T12:00:00Z'))).toBe(true);
    expect(isBirthdayDay(start, at('2026-06-16T11:59:59Z'))).toBe(true);
    expect(isBirthdayDay(start, at('2026-06-16T12:00:00Z'))).toBe(false);
    expect(birthdayWindow(birth, at('2026-06-22T11:59:59Z'))?.year).toBe(2026);
    expect(birthdayWindow(birth, at('2026-06-22T12:00:00Z'))).toBeNull();
  });

  it('keeps a late-December birthday week going into January, under the year it started', () => {
    const window = birthdayWindow(born('1995-12-30'), at('2027-01-03T08:00:00Z'));
    expect(window).toMatchObject({ year: 2026, date: '2026-12-30' });
    expect(isBirthdayDay(window, at('2027-01-03T08:00:00Z'))).toBe(false);
  });

  it('starts a 1 January birthday on 31 December, counted for the new year', () => {
    const window = birthdayWindow(born('2000-01-01'), at('2026-12-31T18:00:00Z'));
    expect(window).toMatchObject({ year: 2027, date: '2027-01-01' });
    expect(isBirthdayDay(window, at('2026-12-31T18:00:00Z'))).toBe(true);
  });

  it('marks a 29 February birthday on 28 February outside leap years', () => {
    expect(birthdayWindow(born('2004-02-29'), at('2027-02-28T09:00:00Z'))?.date).toBe('2027-02-28');
    expect(birthdayWindow(born('2004-02-29'), at('2028-02-29T09:00:00Z'))?.date).toBe('2028-02-29');
  });

  it('has no window without a birth date', () => {
    expect(birthdayWindow(null, at('2026-06-15T00:00:00Z'))).toBeNull();
    expect(isBirthdayDay(null, at('2026-06-15T00:00:00Z'))).toBe(false);
  });

  it('keys one gift per account per year and ships the title, frame and theme', () => {
    expect(birthdayGiftRef('acc', 2026)).toBe('birthday:acc:2026');
    expect(BIRTHDAY_TITLE.kind).toBe('TITLE_BADGE');
    expect(BIRTHDAY_FRAME).toMatchObject({ kind: 'PROFILE_FRAME', styleKey: 'birthday-frame' });
    expect(BIRTHDAY_THEME).toMatchObject({ kind: 'SITE_THEME', styleKey: 'birthday-shell' });
  });
});
