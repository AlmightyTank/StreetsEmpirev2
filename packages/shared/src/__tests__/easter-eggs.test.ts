import { describe, expect, it } from 'vitest';
import {
  CLIENT_EASTER_EGG_IDS,
  EASTER_EGGS,
  EASTER_EGG_ENCOUNTERS,
  EASTER_EGG_LIST,
  easterEggDay,
  easterEggDayNear,
  easterEggForEncounterChoice,
} from '../easter-eggs.js';

describe('easter egg catalog', () => {
  it('gives every egg its own title key', () => {
    const keys = EASTER_EGG_LIST.map((egg) => egg.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) expect(key.startsWith('egg-')).toBe(true);
  });

  it('only lets the browser report eggs it can actually see', () => {
    expect([...CLIENT_EASTER_EGG_IDS].sort()).toEqual(['APRIL_FOOL', 'FRIDAY_THE_13TH', 'KONAMI', 'WRONG_TURN']);
  });

  it('maps encounter choices to eggs, and other choices to nothing', () => {
    expect(easterEggForEncounterChoice('egg-the-statue', 'dont-blink')).toBe('DONT_BLINK');
    expect(easterEggForEncounterChoice('egg-the-statue', 'run')).toBe('DISPLACED');
    expect(easterEggForEncounterChoice('egg-the-statue', 'take-a-photo')).toBeNull();
    expect(easterEggForEncounterChoice('scout-bus-stop-whisper', 'buy-the-lead')).toBeNull();
    for (const choices of Object.values(EASTER_EGG_ENCOUNTERS)) {
      for (const id of Object.values(choices)) expect(EASTER_EGGS[id]).toBeDefined();
    }
  });
});

describe('easter egg days', () => {
  it('knows April Fools and Friday the 13th', () => {
    expect(easterEggDay(new Date('2027-04-01T12:00:00Z'), 'UTC')).toBe('APRIL_FOOLS');
    expect(easterEggDay(new Date('2026-11-13T12:00:00Z'), 'UTC')).toBe('FRIDAY_THE_13TH');
    // A 13th that is not a Friday, and an ordinary day.
    expect(easterEggDay(new Date('2026-10-13T12:00:00Z'), 'UTC')).toBeNull();
    expect(easterEggDay(new Date('2026-10-12T12:00:00Z'), 'UTC')).toBeNull();
  });

  it('allows the day somewhere on Earth, and nowhere else', () => {
    // Late on 31 March UTC it is already 1 April in Kiribati.
    expect(easterEggDayNear(new Date('2027-03-31T13:00:00Z'), 'APRIL_FOOLS')).toBe(true);
    // Early on 2 April UTC it is still 1 April in Hawaii.
    expect(easterEggDayNear(new Date('2027-04-02T09:00:00Z'), 'APRIL_FOOLS')).toBe(true);
    expect(easterEggDayNear(new Date('2027-03-30T12:00:00Z'), 'APRIL_FOOLS')).toBe(false);
    expect(easterEggDayNear(new Date('2027-04-03T12:00:00Z'), 'APRIL_FOOLS')).toBe(false);
  });
});
