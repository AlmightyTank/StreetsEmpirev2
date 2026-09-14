import { afterEach, describe, expect, it, vi } from 'vitest';
import { startPoller } from '../schedule.js';

describe('startPoller', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('runs immediately and on the interval, never overlaps a slow run, and survives errors', async () => {
    vi.useFakeTimers();
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let runs = 0;
    let release: () => void = () => undefined;

    const stop = startPoller('test', 1_000, async () => {
      runs += 1;
      if (runs === 1) await new Promise<void>((resolve) => { release = resolve; });
      if (runs === 2) throw new Error('boom');
    });

    expect(runs).toBe(1);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(runs).toBe(1);

    release();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(runs).toBe(2);
    expect(errors).toHaveBeenCalledWith('test failed:', expect.any(Error));

    await vi.advanceTimersByTimeAsync(1_000);
    expect(runs).toBe(3);

    stop();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(runs).toBe(3);
  });
});
