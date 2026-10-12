import { describe, expect, it } from 'vitest';
import { normalizeUsername, usernameSchema } from '../schemas/auth.js';

describe('normalizeUsername', () => {
  it('gives every casing of a name the same key', () => {
    const keys = ['AMightyTank', 'amightytank', 'AMIGHTYTANK', 'aMiGhTyTaNk'].map(normalizeUsername);
    expect(new Set(keys)).toEqual(new Set(['amightytank']));
  });

  it('keeps names that differ by more than case apart', () => {
    expect(normalizeUsername('AMightyTank')).not.toBe(normalizeUsername('AMighty_Tank'));
  });

  it('matches the key of a name that passed the sign-up schema', () => {
    const name = usernameSchema.parse('  Street_Boss-9 ');
    expect(normalizeUsername(name)).toBe('street_boss-9');
  });
});
