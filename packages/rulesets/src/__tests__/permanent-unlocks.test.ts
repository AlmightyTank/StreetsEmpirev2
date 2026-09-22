import { describe, expect, it } from 'vitest';
import { classicOgV07F, classicOgV07G } from '../index.js';

describe('quest roadmap Phase I permanent unlocks', () => {
  it('keeps 0.7-F unchanged and enables the generic unlock catalog only in 0.7-G', () => {
    expect(classicOgV07F.permanentUnlocks).toBeUndefined();
    expect(Object.keys(classicOgV07F.questDefinitions ?? {})).toHaveLength(19);

    expect(Object.keys(classicOgV07G.permanentUnlocks ?? {})).toEqual([
      'WEAPON_SHOTGUN_ACCESS',
      'WEAPON_TEK9_ACCESS',
      'WEAPON_AK47_ACCESS',
      'PRODUCT_METH_ACCESS',
      'PRODUCT_ECSTASY_ACCESS',
      'PRODUCT_COCAINE_ACCESS',
      'PRODUCT_HEROIN_ACCESS',
    ]);
    expect(Object.keys(classicOgV07G.questDefinitions ?? {})).toHaveLength(19);
  });

  it('moves story weapon access onto generic permanent unlock rewards', () => {
    const quests = classicOgV07G.questDefinitions!;
    expect(quests.HEAVY_HANDS.rewards).toContainEqual({
      kind: 'PERMANENT_UNLOCK',
      key: 'WEAPON_SHOTGUN_ACCESS',
    });
    expect(quests.COLLECTION_DAY.rewards).toContainEqual({
      kind: 'PERMANENT_UNLOCK',
      key: 'WEAPON_TEK9_ACCESS',
    });
    expect(quests.PLANT_THE_FLAG.rewards).toContainEqual({
      kind: 'PERMANENT_UNLOCK',
      key: 'WEAPON_AK47_ACCESS',
    });

    for (const key of ['HEAVY_HANDS', 'COLLECTION_DAY', 'PLANT_THE_FLAG'] as const) {
      expect(quests[key].rewards.some((reward) => reward.kind === 'WEAPON_ACCESS')).toBe(false);
    }
  });

  it('turns Pip side work into permanent product-counter progression', () => {
    const quests = classicOgV07G.questDefinitions!;
    expect(quests.PIP_BULK_ORDER.rewards).toContainEqual({
      kind: 'PERMANENT_UNLOCK',
      key: 'PRODUCT_METH_ACCESS',
    });
    expect(quests.PIP_PARTY_FAVORS.rewards).toContainEqual({
      kind: 'PERMANENT_UNLOCK',
      key: 'PRODUCT_ECSTASY_ACCESS',
    });
    expect(quests.PIP_MOVE_THE_WEIGHT.rewards).toEqual(expect.arrayContaining([
      { kind: 'PERMANENT_UNLOCK', key: 'PRODUCT_COCAINE_ACCESS' },
      { kind: 'PERMANENT_UNLOCK', key: 'PRODUCT_HEROIN_ACCESS' },
    ]));
  });

  it('keeps every permanent unlock reward backed by the ruleset catalog', () => {
    const catalog = classicOgV07G.permanentUnlocks!;
    for (const quest of Object.values(classicOgV07G.questDefinitions ?? {})) {
      for (const reward of quest.rewards) {
        if (reward.kind === 'PERMANENT_UNLOCK') {
          expect(catalog[reward.key!]).toBeDefined();
        }
      }
    }
  });

  it('maps the weapon unlock ledger back to the existing store access flags', () => {
    expect(classicOgV07G.permanentUnlocks!.WEAPON_SHOTGUN_ACCESS.effect)
      .toEqual({ kind: 'WEAPON_ACCESS', weapon: 'SHOTGUN' });
    expect(classicOgV07G.permanentUnlocks!.WEAPON_TEK9_ACCESS.effect)
      .toEqual({ kind: 'WEAPON_ACCESS', weapon: 'TEK9' });
    expect(classicOgV07G.permanentUnlocks!.WEAPON_AK47_ACCESS.effect)
      .toEqual({ kind: 'WEAPON_ACCESS', weapon: 'AK47' });
  });

  it('gates Meth, Ecstasy, Cocaine and Heroin purchases while leaving Weed open', () => {
    const productGates = Object.values(classicOgV07G.permanentUnlocks!)
      .filter((unlock) => unlock.effect.kind === 'PRODUCT_PURCHASE_ACCESS')
      .map((unlock) => unlock.effect.productKey)
      .sort();

    expect(productGates).toEqual(['COCAINE', 'ECSTASY', 'HEROIN', 'METH']);
    expect(productGates).not.toContain('WEED');
  });
});
