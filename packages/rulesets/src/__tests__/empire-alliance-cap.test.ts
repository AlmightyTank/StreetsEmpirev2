import { describe, expect, it } from 'vitest';
import { classicOgV18S, classicOgV19A, classicOgV19B, rulesets } from '../index.js';

describe('pinned alliance expansion', () => {
  it('raises only B rounds to 7 seats without changing leave cooldown or friendly-fire rules', () => {
    expect(classicOgV18S.alliances?.maxMembers).toBe(5);
    expect(classicOgV19A.alliances?.maxMembers).toBe(5);
    expect(classicOgV19B.alliances?.maxMembers).toBe(7);
    expect(classicOgV19B.alliances?.leaveCooldownHours).toBe(24);
    expect(classicOgV19B.alliances).toEqual({ ...classicOgV19A.alliances, maxMembers: 7 });
    expect(rulesets['classic-og-v1.9-b']).toBe(classicOgV19B);
  });
});
