import { describe, expect, it } from 'vitest';
import { classicOgV06C } from '@streets/rulesets';
import { localsThugs } from '@streets/rules-engine';
import { localsOnBlock, localsReclaimAt } from '../turf.service.js';

const ruleset = classicOgV06C;
const block = { citySlug: 'atlanta', district: 'LOW_RENT' } as const;

describe('0.6.0-C local turf reclaim', () => {
  it('leaves a released corner vacant for the reclaim window, then lets locals grow back', () => {
    const releasedAt = new Date('2026-09-20T12:00:00.000Z');
    const reclaimAt = localsReclaimAt(ruleset, releasedAt);
    expect(reclaimAt.getTime() - releasedAt.getTime()).toBe(ruleset.turf.locals.reclaimHours * 3_600_000);

    expect(localsOnBlock(ruleset, {
      holderId: null,
      ...block,
      localsThugs: 0,
      localsAt: releasedAt,
      localsReclaimAt: reclaimAt,
    }, new Date(releasedAt.getTime() + 5 * 3_600_000))).toBe(0);

    expect(localsOnBlock(ruleset, {
      holderId: null,
      ...block,
      localsThugs: 0,
      localsAt: releasedAt,
      localsReclaimAt: reclaimAt,
    }, new Date(releasedAt.getTime() + 7 * 3_600_000))).toBe(
      Math.round(ruleset.turf.locals.regrowPerHour * 7),
    );
  });

  it('shows seeded locals immediately, and never counts locals while a player holds the block', () => {
    const now = new Date('2026-09-20T12:00:00.000Z');
    const full = localsThugs(ruleset, block);
    expect(localsOnBlock(ruleset, {
      holderId: null,
      ...block,
      localsThugs: full,
      localsAt: now,
      localsReclaimAt: null,
    }, now)).toBe(full);
    expect(localsOnBlock(ruleset, {
      holderId: 'holder',
      ...block,
      localsThugs: full,
      localsAt: now,
      localsReclaimAt: null,
    }, now)).toBe(0);
  });
});
