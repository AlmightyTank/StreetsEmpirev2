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
import {
  RELEASED_CREW_COSMETIC_STYLES,
  RELEASED_ITEM_COSMETIC_STYLES,
  collectionOptions,
  isFullCollectionStyle,
  styleFitsItem,
} from '../cosmetics.js';
import { crewCosmeticLoadoutSchema, itemCosmeticLoadoutSchema } from '../schemas/auth.js';

describe('easter egg catalog', () => {
  it('gives every egg its own title key', () => {
    const keys = EASTER_EGG_LIST.map((egg) => egg.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) expect(key.startsWith('egg-')).toBe(true);
  });

  it('only lets the browser report eggs it can actually see', () => {
    expect([...CLIENT_EASTER_EGG_IDS].sort()).toEqual(['APRIL_FOOL', 'FRIDAY_THE_13TH', 'GREAT_SCOTT', 'KONAMI', 'WRONG_TURN']);
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

describe('easter egg looks', () => {
  it('fits single-item looks to their own item only, and keeps them off the crew', () => {
    expect(styleFitsItem('time-machine', 'SEDAN')).toBe(true);
    expect(styleFitsItem('time-machine', 'VAN')).toBe(false);
    expect(styleFitsItem('blue-sky', 'METH')).toBe(true);
    expect(styleFitsItem('blue-sky', 'CRACK')).toBe(false);
    expect(styleFitsItem('eight-bit', 'AK47')).toBe(true);
    expect(isFullCollectionStyle('eight-bit')).toBe(true);
    expect(isFullCollectionStyle('time-machine')).toBe(false);
    expect(RELEASED_CREW_COSMETIC_STYLES.map((style) => style.key)).not.toContain('blue-sky');
  });

  it('hides egg looks from the locker until they are owned', () => {
    const keys = (owned: string[]) => collectionOptions(RELEASED_ITEM_COSMETIC_STYLES, new Set(owned)).map((option) => option.key);
    expect(keys([])).toEqual(['classic', 'midnight-ops', 'urban-ghost', 'cartel-gold']);
    expect(keys(['time-machine'])).toContain('time-machine');
    expect(keys(['time-machine'])).not.toContain('eight-bit');
  });

  it('rejects a single-item look saved on another item', () => {
    expect(itemCosmeticLoadoutSchema.safeParse({ SEDAN: 'time-machine' }).success).toBe(true);
    expect(itemCosmeticLoadoutSchema.safeParse({ VAN: 'time-machine' }).success).toBe(false);
    expect(crewCosmeticLoadoutSchema.safeParse({ THUG: 'blue-sky', HOE: 'classic' }).success).toBe(false);
    expect(crewCosmeticLoadoutSchema.safeParse({ THUG: 'eight-bit', HOE: 'classic' }).success).toBe(true);
  });

  it('pays every egg look from an egg', () => {
    const paid = EASTER_EGG_LIST.flatMap((egg) => (egg.collection ? [egg.collection] : [])).sort();
    expect(paid).toEqual(['blue-sky', 'eight-bit', 'time-machine']);
  });
});

describe('easter egg days', () => {
  it('knows April Fools and Friday the 13th', () => {
    expect(easterEggDay(new Date('2027-04-01T12:00:00Z'), 'UTC')).toBe('APRIL_FOOLS');
    expect(easterEggDay(new Date('2026-11-13T12:00:00Z'), 'UTC')).toBe('FRIDAY_THE_13TH');
    // A 13th that is not a Friday, and an ordinary day.
    expect(easterEggDay(new Date('2026-10-13T12:00:00Z'), 'UTC')).toBeNull();
    expect(easterEggDay(new Date('2026-10-12T12:00:00Z'), 'UTC')).toBeNull();
    expect(easterEggDay(new Date('2026-10-21T12:00:00Z'), 'UTC')).toBe('BACK_TO_THE_FUTURE');
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
