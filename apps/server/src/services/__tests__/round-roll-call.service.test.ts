import { describe, expect, it } from 'vitest';
import { roundRollCallClock } from '../round-roll-call.service.js';

describe('round roll call schedule', () => {
  it('subtracts seven days from a 28-day round', () => {
    const start = new Date('2026-10-01T00:00:00Z');
    const end = new Date(start.getTime() + 28 * 86_400_000);
    expect(roundRollCallClock({ startsAt: start, endsAt: end, status: 'ACTIVE' }, start).requiredStamps).toBe(21);
  });
});
