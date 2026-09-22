import { describe, expect, it } from 'vitest';
import { classicOgV07J, classicOgV07K } from '../index.js';
import { hideoutV2For, hideoutV2Problems } from '../hideout-v2.js';

describe('quest roadmap Phase L single-use favors', () => {
  it('keeps 0.7-J pinned without live single-use effects', () => {
    expect('effect' in classicOgV07J.favors!.TOMMY_VOUCHER).toBe(false);
    expect('BURNER_PHONE' in classicOgV07J.favors!).toBe(false);
    expect('DOCTOR_FAVOR' in classicOgV07J.favors!).toBe(false);
  });

  it('adds three armed single-use effects in 0.7-K', () => {
    expect(classicOgV07K.favors!.TOMMY_VOUCHER.effect).toEqual({
      kind: 'STORE_BUY_DISCOUNT',
      storeKey: 'TOMMY',
      itemKeys: ['PISTOL', 'SHOTGUN', 'TEK9', 'AK47'],
      discountPercent: 20,
    });
    expect(classicOgV07K.favors!.BURNER_PHONE.effect).toEqual({ kind: 'FREE_RECON' });
    expect(classicOgV07K.favors!.DOCTOR_FAVOR.effect).toEqual({ kind: 'FREE_TREATMENT' });
  });

  it('awards Burner Phone and Doctor Favor from Tommy side jobs', () => {
    const quests = classicOgV07K.questDefinitions!;
    expect(quests.TOMMY_TWO_COLLECTIONS.rewards).toContainEqual({
      kind: 'FAVOR_ITEM', key: 'BURNER_PHONE', amount: 1,
    });
    expect(quests.TOMMY_PATCH_JOB.rewards).toContainEqual({
      kind: 'FAVOR_ITEM', key: 'DOCTOR_FAVOR', amount: 1,
    });
    expect(quests.TOMMY_STOCK_THE_CREW.rewards).toContainEqual({
      kind: 'FAVOR_ITEM', key: 'TOMMY_VOUCHER', amount: 1,
    });
  });

  it('preserves timed favors, permanent unlocks, quests and hideout behavior', () => {
    expect(classicOgV07K.favors!.MAMA_ADVICE.effect).toEqual(classicOgV07J.favors!.MAMA_ADVICE.effect);
    expect(classicOgV07K.permanentUnlocks).toEqual(classicOgV07J.permanentUnlocks);
    expect(Object.keys(classicOgV07K.questDefinitions ?? {})).toHaveLength(19);
    expect(hideoutV2For(classicOgV07K)).toEqual(hideoutV2For(classicOgV07J));
    expect(hideoutV2Problems(classicOgV07K)).toEqual([]);
  });

  it('uses separate armed slots for the initial one-shot patterns', () => {
    expect(classicOgV07K.favors!.TOMMY_VOUCHER.activation)
      .toEqual({ kind: 'SINGLE_USE', category: 'MUSCLE' });
    expect(classicOgV07K.favors!.BURNER_PHONE.activation)
      .toEqual({ kind: 'SINGLE_USE', category: 'UNDERWORLD' });
    expect(classicOgV07K.favors!.DOCTOR_FAVOR.activation)
      .toEqual({ kind: 'SINGLE_USE', category: 'MUSCLE' });
  });
});
