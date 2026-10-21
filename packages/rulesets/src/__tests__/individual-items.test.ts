import { describe, expect, it } from 'vitest';
import { classicOgV23A, classicOgV24F, classicOgV25A } from '../index.js';

describe('2.5.0-A individual armory catalog', () => {
  it('keeps historic rulesets count based and enables item inventory only in the new ruleset', () => {
    expect('individualItems' in classicOgV23A).toBe(false);
    expect('individualItems' in classicOgV24F).toBe(false);
    expect(classicOgV25A.individualItems).toMatchObject({
      enabled: true,
      catalogVersion: 'armory-garage-v1',
      maxGuns: 2_000,
      maxVehicles: 100,
      guns: { PISTOL: { slots: 2, wearPerFight: 2 }, SHOTGUN: { slots: 3, wearPerFight: 3 }, TEK9: { slots: 3 }, AK47: { slots: 4 } },
      vehicles: { SEDAN: { slots: 2 }, LOW_RIDER: { slots: 3 }, VAN: { slots: 4 } },
    });
  });

  it('contains the roadmap tier costs and keeps scopes limited to shotguns and AK-47s', () => {
    const catalog = classicOgV25A.individualItems!;
    expect(catalog.modCosts).toEqual({
      SMALL: { 1: { parts: 5, cashCents: 10_000 }, 2: { parts: 15, cashCents: 30_000 }, 3: { parts: 40, cashCents: 90_000 } },
      MEDIUM: { 1: { parts: 10, cashCents: 20_000 }, 2: { parts: 30, cashCents: 60_000 }, 3: { parts: 80, cashCents: 180_000 } },
      LARGE: { 1: { parts: 20, cashCents: 40_000 }, 2: { parts: 60, cashCents: 120_000 }, 3: { parts: 160, cashCents: 360_000 } },
    });
    expect(catalog.guns.PISTOL.mods.some((mod) => mod.key === 'SCOPE')).toBe(false);
    expect(catalog.guns.TEK9.mods.some((mod) => mod.key === 'SCOPE')).toBe(false);
    expect(catalog.guns.SHOTGUN.mods.some((mod) => mod.key === 'SCOPE')).toBe(true);
    expect(catalog.guns.AK47.mods.some((mod) => mod.key === 'SCOPE')).toBe(true);
  });
});
