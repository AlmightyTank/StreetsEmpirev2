import { describe, expect, it } from 'vitest';
import { classicOgV14A } from '../classic-og-v1.4-a/index.js';
import { classicOgV14B } from '../classic-og-v1.4-b/index.js';
import type { Ruleset } from '../types.js';

describe('1.4.0-B faction standing ruleset', () => {
  it('adds standing rules on top of 1.4.0-A and changes nothing else', () => {
    expect(classicOgV14B.meta).toEqual({ id: 'classic-og-v1.4-b', version: '1.4.0-B', name: 'Classic OG - Faction Standing' });
    expect({ ...classicOgV14B, meta: null, factionStanding: null }).toEqual({ ...classicOgV14A, meta: null, factionStanding: null });
    expect((classicOgV14A as Ruleset).factionStanding).toBeUndefined();
  });

  it('pins ascending tiers inside the max, earned one for one from contact reputation', () => {
    const { tiers, max, perContactRep } = classicOgV14B.factionStanding;
    const lines = [tiers.known, tiers.trusted, tiers.connected, tiers.innerCircle];
    expect(lines).toEqual([...lines].sort((a, b) => a - b));
    expect(new Set(lines).size).toBe(4);
    expect(tiers.innerCircle).toBeLessThanOrEqual(max);
    expect(perContactRep).toBe(1);
  });

  it('takes every faction with a contact past Known on one-time Jobs alone, leaving Inner Circle to more work', () => {
    const ladder = classicOgV14B.factionStanding;
    const earned = new Map<string, number>();
    for (const job of Object.values(classicOgV14B.questDefinitions)) {
      if (job.repeatability !== 'ONCE') continue;
      for (const reward of job.rewards) {
        if (reward.kind !== 'CONTACT_REP') continue;
        const faction = (classicOgV14B.contacts as Ruleset['contacts'])?.[reward.key as keyof NonNullable<Ruleset['contacts']>]?.factionKey;
        if (faction) earned.set(faction, (earned.get(faction) ?? 0) + (reward.amount ?? 0) * ladder.perContactRep);
      }
    }
    for (const key of ['KINGS', 'OUTFIT', 'ROAD_SAINTS', 'CARTEL_LINE']) {
      expect(earned.get(key) ?? 0).toBeGreaterThanOrEqual(ladder.tiers.known);
      // Inner Circle takes sponsored board work too (C), not one season of one-time Jobs.
      expect(earned.get(key) ?? 0).toBeLessThan(ladder.tiers.innerCircle);
    }
  });
});
