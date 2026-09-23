import { describe, expect, it } from 'vitest';
import { classicOgV07AA } from '@streets/rulesets';
import { seasonalEventActive } from '../handcrafted-quest.service.js';

describe('seasonal quest windows', () => {
  const halloween = classicOgV07AA.questDefinitions!.HALLOWEEN_WITCHING_RUN;
  const christmas = classicOgV07AA.questDefinitions!.CHRISTMAS_MIDNIGHT_DELIVERY;

  it('opens Halloween only inside its server-time window', () => {
    expect(seasonalEventActive(halloween, new Date('2026-10-14T23:59:59.999Z'))).toBe(false);
    expect(seasonalEventActive(halloween, new Date('2026-10-15T00:00:00.000Z'))).toBe(true);
    expect(seasonalEventActive(halloween, new Date('2026-11-02T23:59:59.999Z'))).toBe(true);
    expect(seasonalEventActive(halloween, new Date('2026-11-03T00:00:00.000Z'))).toBe(false);
  });

  it('opens Christmas only inside its server-time window', () => {
    expect(seasonalEventActive(christmas, new Date('2026-12-14T23:59:59.999Z'))).toBe(false);
    expect(seasonalEventActive(christmas, new Date('2026-12-15T00:00:00.000Z'))).toBe(true);
    expect(seasonalEventActive(christmas, new Date('2027-01-05T23:59:59.999Z'))).toBe(true);
    expect(seasonalEventActive(christmas, new Date('2027-01-06T00:00:00.000Z'))).toBe(false);
  });
});
