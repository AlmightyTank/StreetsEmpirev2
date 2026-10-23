import { describe, expect, it } from 'vitest';
import { MINIMUM_AGE, RULES_AGREEMENT, registerSchema } from '../index.js';

const validRegistration = {
  username: 'StreetBoss',
  email: 'boss@example.com',
  password: 'password123',
};

describe('minimum age', () => {
  it('requires an explicit age confirmation at registration', () => {
    expect(registerSchema.safeParse({ ...validRegistration, ageConfirmed: true }).success).toBe(true);
    expect(registerSchema.safeParse({ ...validRegistration, ageConfirmed: false }).success).toBe(false);
    expect(registerSchema.safeParse(validRegistration).success).toBe(false);
  });

  it('keeps the rules agreement aligned with the 16+ policy', () => {
    expect(MINIMUM_AGE).toBe(16);
    expect(RULES_AGREEMENT[0]?.title).toContain('16 or older');
  });
});
