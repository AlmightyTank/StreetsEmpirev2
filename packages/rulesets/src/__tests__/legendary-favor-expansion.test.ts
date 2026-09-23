import { describe, expect, it } from 'vitest';
import { classicOgV07V } from '../classic-og-v0.7-v/index.js';
import { classicOgV07W } from '../classic-og-v0.7-w/index.js';

describe('Phase Y-B Legendary favor expansion', () => {
  it('pins a new ruleset while preserving the Phase Y-A quest count', () => {
    expect(classicOgV07W.meta).toMatchObject({
      id: 'classic-og-v0.7-w',
      version: '0.7.0-W',
      name: 'Classic OG - Legendary Favor Expansion',
    });
    expect(Object.keys(classicOgV07W.questDefinitions ?? {}))
      .toHaveLength(Object.keys(classicOgV07V.questDefinitions ?? {}).length);
  });

  it('gives Wheels, Vic and Blocks action-shaped Legendary favors', () => {
    expect(classicOgV07W.favors?.WHEELS_OPEN_ROAD).toMatchObject({
      rarity: 'LEGENDARY',
      contactKey: 'WHEELS',
      activation: { kind: 'SINGLE_USE', category: 'UNDERWORLD' },
      effect: { kind: 'CLEAR_FIRST_ROAD_STOP' },
    });

    expect(classicOgV07W.favors?.VIC_CLEAN_SLATE_FAVOR).toMatchObject({
      rarity: 'LEGENDARY',
      contactKey: 'VIC',
      activation: { kind: 'SINGLE_USE', category: 'STREET' },
      effect: { kind: 'FREE_HEAT_BRIBE' },
    });

    expect(classicOgV07W.favors?.BLOCKS_STAND_DOWN).toMatchObject({
      rarity: 'LEGENDARY',
      contactKey: 'BLOCKS',
      activation: { kind: 'SINGLE_USE', category: 'MUSCLE' },
      effect: { kind: 'LOCAL_TURF_STANDDOWN' },
    });
  });

  it('leaves every named contact with at least one Legendary favor', () => {
    const legendary = Object.values(classicOgV07W.favors ?? {})
      .filter((favor) => favor.rarity === 'LEGENDARY');
    expect(new Set(legendary.map((favor) => favor.contactKey))).toEqual(new Set([
      'MAMA_KING',
      'PIP',
      'TOMMY',
      'WHEELS',
      'VIC',
      'BLOCKS',
    ]));
  });

  it('awards the new markers from one-time contact finales only', () => {
    expect(classicOgV07W.questDefinitions?.WHEELS_HOME_SAFE).toMatchObject({ repeatability: 'ONCE' });
    expect(classicOgV07W.questDefinitions?.WHEELS_HOME_SAFE.rewards).toContainEqual({
      kind: 'FAVOR_ITEM', key: 'WHEELS_OPEN_ROAD', amount: 1,
    });

    expect(classicOgV07W.questDefinitions?.VIC_CLEAN_SLATE).toMatchObject({ repeatability: 'ONCE' });
    expect(classicOgV07W.questDefinitions?.VIC_CLEAN_SLATE.rewards).toContainEqual({
      kind: 'FAVOR_ITEM', key: 'VIC_CLEAN_SLATE_FAVOR', amount: 1,
    });

    expect(classicOgV07W.questDefinitions?.BLOCKS_OUT_OF_TOWN).toMatchObject({
      repeatability: 'ONCE',
      difficulty: 'KINGPIN_CONTRACT',
    });
    expect(classicOgV07W.questDefinitions?.BLOCKS_OUT_OF_TOWN.rewards).toContainEqual({
      kind: 'FAVOR_ITEM', key: 'BLOCKS_STAND_DOWN', amount: 1,
    });
  });
});
