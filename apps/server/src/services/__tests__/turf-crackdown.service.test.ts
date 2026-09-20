import { describe, expect, it } from 'vitest';
import { classicOgV06F } from '@streets/rulesets';
import { TurfCrackdownService } from '../turf-crackdown.service.js';

describe('0.6.0-F Federal turf crackdown', () => {
  it('lands two days before the bell and warns one day before the sweep', () => {
    const startsAt = new Date('2026-09-01T00:00:00.000Z');
    const endsAt = new Date('2026-09-29T00:00:00.000Z');
    const schedule = TurfCrackdownService.schedule({ startsAt, endsAt }, classicOgV06F);

    expect(schedule).not.toBeNull();
    expect(schedule!.sweepAt.toISOString()).toBe('2026-09-27T00:00:00.000Z');
    expect(schedule!.warningAt.toISOString()).toBe('2026-09-26T00:00:00.000Z');
  });

  it('chooses one deterministic city from the pinned city list', () => {
    const first = TurfCrackdownService.targetCitySlug('round-123', classicOgV06F);
    const replay = TurfCrackdownService.targetCitySlug('round-123', classicOgV06F);

    expect(first).toBe(replay);
    expect(Object.keys(classicOgV06F.cities)).toContain(first);
  });

  it('picks up twenty percent with a six-man cap and always leaves one on the corner', () => {
    expect(TurfCrackdownService.pickupCount(1, classicOgV06F)).toBe(0);
    expect(TurfCrackdownService.pickupCount(2, classicOgV06F)).toBe(1);
    expect(TurfCrackdownService.pickupCount(10, classicOgV06F)).toBe(2);
    expect(TurfCrackdownService.pickupCount(30, classicOgV06F)).toBe(6);
    expect(TurfCrackdownService.pickupCount(100, classicOgV06F)).toBe(6);
  });
});
