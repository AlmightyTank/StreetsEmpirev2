import { describe, expect, it } from 'vitest';
import { serverAdjustedNowMs, serverClockOffsetMs } from '../time.js';

describe('server clock helpers', () => {
  it('corrects a client clock that is five minutes ahead', () => {
    const serverMs = Date.parse('2026-09-22T12:00:00.000Z');
    const localMidpoint = serverMs + 5 * 60_000;
    const start = localMidpoint - 100;
    const received = localMidpoint + 100;

    const offset = serverClockOffsetMs(
      '2026-09-22T12:00:00.000Z',
      start,
      received,
    );

    expect(offset).toBe(-5 * 60_000);
    expect(serverAdjustedNowMs(localMidpoint, offset)).toBe(serverMs);
  });

  it('corrects a client clock that is three minutes behind', () => {
    const serverMs = Date.parse('2026-09-22T12:00:00.000Z');
    const localMidpoint = serverMs - 3 * 60_000;
    const start = localMidpoint - 250;
    const received = localMidpoint + 250;

    const offset = serverClockOffsetMs(
      '2026-09-22T12:00:00.000Z',
      start,
      received,
    );

    expect(offset).toBe(3 * 60_000);
    expect(serverAdjustedNowMs(localMidpoint, offset)).toBe(serverMs);
  });

  it('advances from the synchronized server clock as local time advances', () => {
    const serverMs = Date.parse('2026-09-22T12:00:00.000Z');
    const localMidpoint = serverMs + 10 * 60_000;
    const offset = serverClockOffsetMs(
      '2026-09-22T12:00:00.000Z',
      localMidpoint - 50,
      localMidpoint + 50,
    );

    expect(serverAdjustedNowMs(localMidpoint + 15_000, offset)).toBe(serverMs + 15_000);
  });

  it('falls back to zero offset for an invalid server timestamp', () => {
    expect(serverClockOffsetMs('not-a-date', 1000, 2000)).toBe(0);
  });
});
