import { describe, expect, it } from 'vitest';
import { TELEMETRY_DAYS, bumpTelemetry, rate, storedTelemetry, sumTelemetry, telemetryDay, telemetryJson } from '../npc-gang-telemetry.js';

const day = (iso: string) => new Date(`${iso}T12:00:00.000Z`);

describe('NPC gang telemetry (Phase P)', () => {
  it('counts outcomes, blocked reasons apart from lay-low, and target skips per day', () => {
    let telemetry = bumpTelemetry({}, day('2026-10-08'), { outcome: 'RAIDED', skips: { DOGPILE: 2, SHIELD: 1 } });
    telemetry = bumpTelemetry(telemetry, day('2026-10-08'), { outcome: 'BLOCKED', blockedCode: 'TURF_HELD' });
    telemetry = bumpTelemetry(telemetry, day('2026-10-08'), { outcome: 'LAY_LOW' });
    telemetry = bumpTelemetry(telemetry, day('2026-10-09'), { outcome: 'BLOCKED' });

    expect(telemetry['2026-10-08']).toEqual({
      outcomes: { RAIDED: 1, BLOCKED: 1, LAY_LOW: 1 },
      blocked: { TURF_HELD: 1 },
      skips: { DOGPILE: 2, SHIELD: 1 },
    });
    expect(telemetry['2026-10-09']).toEqual({ outcomes: { BLOCKED: 1 }, blocked: { UNKNOWN: 1 }, skips: {} });
  });

  it('keeps only the last window of days', () => {
    const old = bumpTelemetry({}, day('2026-01-01'), { outcome: 'RAIDED' });
    const later = new Date(day('2026-01-01').getTime() + TELEMETRY_DAYS * 24 * 3_600_000);
    expect(Object.keys(bumpTelemetry(old, later, { outcome: 'PRODUCED' }))).toEqual([telemetryDay(later)]);
  });

  it('sums across gangs inside a window and round-trips through memory', () => {
    const one = bumpTelemetry(bumpTelemetry({}, day('2026-10-07'), { outcome: 'RAIDED' }), day('2026-10-08'), { outcome: 'RAIDED', skips: { DOGPILE: 1 } });
    const two = bumpTelemetry({}, day('2026-10-08'), { outcome: 'BLOCKED', blockedCode: 'NO_TURNS' });
    const stored = storedTelemetry(JSON.parse(JSON.stringify({ telemetry: telemetryJson(one) })));
    expect(stored).toEqual(one);

    expect(sumTelemetry([stored, two], '2026-10-08', '2026-10-08')).toEqual({
      outcomes: { RAIDED: 1, BLOCKED: 1 },
      blocked: { NO_TURNS: 1 },
      skips: { DOGPILE: 1 },
    });
    expect(storedTelemetry({ telemetry: { days: { nope: {}, '2026-10-08': 'x' } } })).toEqual({});
  });

  it('rounds rates and leaves an empty base as null', () => {
    expect(rate(1, 3)).toBe(0.333);
    expect(rate(0, 0)).toBeNull();
  });
});
