import { describe, expect, it } from 'vitest';
import { classicOgV18S, classicOgV30A, classicOgV30B, rulesets } from '../index.js';

describe('pinned alliance expansion', () => {
  it('raises only B rounds to 15 seats without changing leave cooldown or friendly-fire rules', () => {
    expect(classicOgV18S.alliances?.maxMembers).toBe(5);
    expect(classicOgV30A.alliances?.maxMembers).toBe(5);
    expect(classicOgV30B.alliances?.maxMembers).toBe(15);
    expect(classicOgV30B.alliances?.leaveCooldownHours).toBe(24);
    expect(classicOgV30B.alliances).toEqual({ ...classicOgV30A.alliances, maxMembers: 15 });
    expect(rulesets['classic-og-v3.0-b']).toBe(classicOgV30B);
  });
});
