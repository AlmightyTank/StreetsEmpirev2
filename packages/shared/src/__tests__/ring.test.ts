import { describe, expect, it } from 'vitest';
import {
  RING_DESTROY_REWARD_CENTS,
  RING_DESTROY_TURN_COST,
  RING_FOUNDRY_CITY_SLUG,
  RING_INVISIBILITY_HOURS,
  RING_SURFACE_HOURS,
  isRingInvisible,
  ringInvisibilityUntil,
  ringSurfaceAt,
} from '../ring.js';

describe('the Ring', () => {
  it('surfaces 48 hours after the round starts', () => {
    expect(ringSurfaceAt(new Date('2026-10-01T00:00:00Z')))
      .toEqual(new Date('2026-10-03T00:00:00Z'));
    expect(RING_SURFACE_HOURS).toBe(48);
  });

  it('hides the bearer for 24 hours, then names them', () => {
    const from = new Date('2026-10-03T00:00:00Z');
    expect(ringInvisibilityUntil(from)).toEqual(new Date('2026-10-04T00:00:00Z'));
    expect(RING_INVISIBILITY_HOURS).toBe(24);
    expect(isRingInvisible(ringInvisibilityUntil(from), new Date('2026-10-03T23:59:59Z'))).toBe(true);
    expect(isRingInvisible(ringInvisibilityUntil(from), new Date('2026-10-04T00:00:00Z'))).toBe(false);
    expect(isRingInvisible(null, from)).toBe(false);
    expect(isRingInvisible(undefined, from)).toBe(false);
  });

  it('is destroyed at the Detroit foundry for a fixed reward', () => {
    expect(RING_FOUNDRY_CITY_SLUG).toBe('detroit');
    expect(RING_DESTROY_REWARD_CENTS).toBe(10_000_000);
    expect(RING_DESTROY_TURN_COST).toBe(5);
  });
});
