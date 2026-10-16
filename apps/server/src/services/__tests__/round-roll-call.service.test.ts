import { describe, expect, it } from 'vitest';
import { roundRollCallClock } from '../round-roll-call.service.js';

describe('round roll call schedule', () => {
  it('subtracts seven days from a 28-day round', () => {
    const start = new Date('2026-10-01T00:00:00Z');
    const end = new Date(start.getTime() + 28 * 86_400_000);
    expect(roundRollCallClock({ startsAt: start, endsAt: end, status: 'ACTIVE' }, start).requiredStamps).toBe(21);
  });
  it('uses 24-hour windows relative to the round start', () => {
    const start = new Date('2026-10-01T18:00:00Z');
    const end = new Date(start.getTime() + 35 * 86_400_000);
    const spec = { startsAt: start, endsAt: end, status: 'ACTIVE' } as const;
    expect(roundRollCallClock(spec, start).requiredStamps).toBe(28);
    expect(roundRollCallClock(spec, new Date(start.getTime() + 86_400_000 - 1)).roundDay).toBe(1);
    expect(roundRollCallClock(spec, new Date(start.getTime() + 86_400_000)).roundDay).toBe(2);
    expect(roundRollCallClock(spec, end).active).toBe(false);
  });

  it('disables reward tracks for rounds of seven days or less', () => {
    const start = new Date('2026-10-01T00:00:00Z');
    const end = new Date(start.getTime() + 7 * 86_400_000);
    const clock = roundRollCallClock({ startsAt: start, endsAt: end, status: 'ACTIVE' }, start);
    expect(clock.requiredStamps).toBe(0);
    expect(clock.active).toBe(false);
  });

  it('blocks attendance during an active round pause', () => {
    const start = new Date('2026-10-01T00:00:00Z');
    const end = new Date(start.getTime() + 28 * 86_400_000);
    const clock = roundRollCallClock({ startsAt: start, endsAt: end, status: 'ACTIVE', pausedAt: start }, start);
    expect(clock.requiredStamps).toBe(21);
    expect(clock.active).toBe(false);
  });

});
