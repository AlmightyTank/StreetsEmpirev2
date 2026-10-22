import { describe, expect, it } from 'vitest';
import { InternalSportsbookProvider } from '../sportsbook/internal.provider.js';

describe('internal sportsbook calendar', () => {
  it('keeps deterministic events stable across provider instances', async () => {
    const now = new Date('2026-10-22T12:00:00.000Z');
    const dates = ['2026-10-24', '2026-10-25'];
    const first = await new InternalSportsbookProvider(now).listEvents('NBA', dates);
    const second = await new InternalSportsbookProvider(now).listEvents('NBA', dates);
    expect(second).toEqual(first);
  });

  it('only schedules MMA cards on Saturdays', async () => {
    const provider = new InternalSportsbookProvider(new Date('2026-10-22T12:00:00.000Z'));
    const events = await provider.listEvents('MMA', ['2026-10-23', '2026-10-24']);
    expect(events).toHaveLength(1);
    expect(events[0]?.startsAt.toISOString()).toBe('2026-10-24T23:00:00.000Z');
  });
});
