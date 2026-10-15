import { describe, expect, it } from 'vitest';
import { MINIMUM_AGE } from '../rules-agreement.js';
import { birthDateSchema, birthDateUpdateSchema, registerSchema } from './auth.js';

function yearsAgo(years: number, today = new Date()): string {
  const thisYear = today.getUTCFullYear() - years;
  return `${thisYear}-${String(today.getUTCMonth() + 1).padStart(2, '0')}-${String(today.getUTCDate()).padStart(2, '0')}`;
}

describe('private birthday age gate', () => {
  it('uses the 16+ minimum throughout the shared contract', () => {
    expect(MINIMUM_AGE).toBe(16);
    expect(birthDateSchema.safeParse(yearsAgo(16)).success).toBe(true);
    expect(birthDateSchema.safeParse(yearsAgo(15)).success).toBe(false);
    expect(birthDateSchema.safeParse(yearsAgo(130)).success).toBe(true);
    expect(birthDateSchema.safeParse(yearsAgo(131)).success).toBe(false);
  });

  it('rejects impossible calendar dates, future birthdays and malformed input', () => {
    for (const input of ['2025-02-29', '2026-13-01', '2026-00-03', '2010-02-30', '2010-1-01', '2030-01-01']) {
      expect(birthDateSchema.safeParse(input).success, input).toBe(false);
    }
    expect(birthDateSchema.safeParse('2008-02-29').success).toBe(true);
  });

  it('rejects age changes without a birthday, and ignores unrelated input', () => {
    expect(birthDateUpdateSchema.safeParse({}).success).toBe(false);
    expect(birthDateUpdateSchema.safeParse({ birthDate: yearsAgo(18), role: 'admin' }).success).toBe(false);
  });

  it('allows a complete 16+ registration and rejects younger people', () => {
    const base = { username: 'OldTimer', email: 'old@example.invalid', password: 'passw0rd-long', ageConfirmed: true };
    expect(registerSchema.safeParse({ ...base, birthDate: yearsAgo(17) }).success).toBe(true);
    expect(registerSchema.safeParse({ ...base, birthDate: yearsAgo(15) }).success).toBe(false);
  });
});
