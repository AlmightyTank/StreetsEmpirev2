import { describe, expect, it } from 'vitest';
import { racketShutHours } from '../business.service.js';

const at = (hour: number) => new Date(Date.UTC(2026, 9, 4, hour));

describe('racketShutHours', () => {
  it('counts the hours a raid had the racket shut inside the settle window', () => {
    expect(racketShutHours({ from: at(0), to: at(12), shutFrom: at(6), shutUntil: at(18), siegedSince: null })).toEqual({ shut: 6, shutAndSieged: 0 });
    expect(racketShutHours({ from: at(0), to: at(12), shutFrom: null, shutUntil: null, siegedSince: at(0) })).toEqual({ shut: 0, shutAndSieged: 0 });
  });

  it('finds the hours that were both shut and sieged, so they are only taken off once', () => {
    // Shut and sieged over the same first six hours of twelve: six hours left to earn.
    const both = racketShutHours({ from: at(0), to: at(12), shutFrom: at(0), shutUntil: at(6), siegedSince: at(0) });
    expect(both).toEqual({ shut: 6, shutAndSieged: 6 });
    const sieged = 12;
    expect(12 - both.shut - sieged + both.shutAndSieged).toBe(0);
    // A siege that starts after the shutdown ends overlaps it not at all.
    expect(racketShutHours({ from: at(0), to: at(12), shutFrom: at(0), shutUntil: at(4), siegedSince: at(8) })).toEqual({ shut: 4, shutAndSieged: 0 });
    // A siege from hour 2 overlaps a 0-6 shutdown for four hours.
    expect(racketShutHours({ from: at(0), to: at(12), shutFrom: at(0), shutUntil: at(6), siegedSince: at(2) })).toEqual({ shut: 6, shutAndSieged: 4 });
  });
});
