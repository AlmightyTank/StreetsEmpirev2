import { describe, expect, it } from 'vitest';
import { classicOgV07U } from '../classic-og-v0.7-u/index.js';
import { classicOgV07V } from '../classic-og-v0.7-v/index.js';

describe('Phase Y-A Legendary favors', () => {
  it('pins a new ruleset and leaves older rounds without Legendary catalog entries', () => {
    expect(classicOgV07V.meta).toMatchObject({
      id: 'classic-og-v0.7-v',
      version: '0.7.0-V',
      name: 'Classic OG - Legendary Favors',
    });

    const olderLegendary = Object.values(classicOgV07U.favors ?? {}).filter(
      (favor) => 'rarity' in favor && favor.rarity === 'LEGENDARY',
    );
    expect(olderLegendary).toHaveLength(0);
  });

  it('ships one Legendary favor in every existing favor category', () => {
    expect(classicOgV07V.favors?.GHOST_NETWORK).toMatchObject({
      rarity: 'LEGENDARY',
      contactKey: 'MAMA_KING',
      activation: { kind: 'TIMED', category: 'STREET', durationMinutes: 5 },
      effect: { kind: 'SCOUT_BOOST', incomePercent: 50, recruitmentPercent: 30 },
    });
    expect(classicOgV07V.favors?.PIP_BLACK_BOOK).toMatchObject({
      rarity: 'LEGENDARY',
      contactKey: 'PIP',
      activation: { kind: 'TIMED', category: 'UNDERWORLD', durationMinutes: 5 },
      effect: { kind: 'PIP_BUY_DISCOUNT', discountPercent: 25 },
    });
    expect(classicOgV07V.favors?.TOMMY_WAR_CHEST).toMatchObject({
      rarity: 'LEGENDARY',
      contactKey: 'TOMMY',
      activation: { kind: 'SINGLE_USE', category: 'MUSCLE' },
      effect: { kind: 'STORE_BUY_DISCOUNT', storeKey: 'TOMMY', discountPercent: 35 },
    });
  });

  it('awards each Legendary favor only from one-time endgame contact work', () => {
    const quietHour = classicOgV07V.questDefinitions?.MAMA_QUIET_HOUR;
    expect(quietHour).toMatchObject({
      difficulty: 'KINGPIN_CONTRACT',
      repeatability: 'ONCE',
    });
    expect(quietHour?.rewards).toContainEqual({
      kind: 'FAVOR_ITEM',
      key: 'GHOST_NETWORK',
      amount: 1,
    });

    expect(classicOgV07V.questDefinitions?.PIP_TOP_SHELF.rewards).toContainEqual({
      kind: 'FAVOR_ITEM',
      key: 'PIP_BLACK_BOOK',
      amount: 1,
    });
    expect(classicOgV07V.questDefinitions?.TOMMY_FULL_RACK.rewards).toContainEqual({
      kind: 'FAVOR_ITEM',
      key: 'TOMMY_WAR_CHEST',
      amount: 1,
    });

    expect(classicOgV07V.questDefinitions?.MAMA_HOUSE_FULL.followUpKeys)
      .toContain('MAMA_QUIET_HOUR');
  });

  it('adds only Mama’s capstone to the catalog', () => {
    expect(Object.keys(classicOgV07U.questDefinitions ?? {})).toHaveLength(64);
    expect(Object.keys(classicOgV07V.questDefinitions ?? {})).toHaveLength(65);
  });
});
