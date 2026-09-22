import { describe, expect, it } from 'vitest';
import { classicOgV07I, classicOgV07J } from '../index.js';
import { hideoutV2For, hideoutV2Problems } from '../hideout-v2.js';

describe('quest roadmap Phase K timed favors', () => {
  it('keeps 0.7-I inventory-only and adds effects only in 0.7-J', () => {
    expect(classicOgV07I.favors!.MAMA_ADVICE.effect).toBeUndefined();
    expect(classicOgV07I.favors!.TOMMY_VOUCHER.effect).toBeUndefined();

    expect(classicOgV07J.favors!.MAMA_ADVICE.effect)
      .toEqual({ kind: 'SCOUT_BOOST', incomePercent: 10, recruitmentPercent: 10 });
    expect(classicOgV07J.favors!.STREET_FRENZY.effect)
      .toEqual({ kind: 'SCOUT_BOOST', incomePercent: 25, recruitmentPercent: 0 });
    expect(classicOgV07J.favors!.COOKHOUSE_RUSH.effect)
      .toEqual({ kind: 'PRODUCTION_BOOST', outputPercent: 20 });
    expect(classicOgV07J.favors!.PIP_CONNECTION.effect)
      .toEqual({ kind: 'PIP_BUY_DISCOUNT', discountPercent: 10 });
    expect(classicOgV07J.favors!.FIELD_MEDIC.effect)
      .toEqual({ kind: 'TREATMENT_EFFICIENCY', medicineEfficiencyPercent: 20 });
  });

  it('keeps Tommy Voucher single-use for Phase L', () => {
    expect(classicOgV07J.favors!.TOMMY_VOUCHER.activation)
      .toEqual({ kind: 'SINGLE_USE', category: 'MUSCLE' });
    expect(classicOgV07J.favors!.TOMMY_VOUCHER.effect).toBeUndefined();
  });

  it('preserves the Phase J inventory and Phase I permanent unlock catalogs', () => {
    expect(Object.keys(classicOgV07J.favors ?? {})).toEqual(Object.keys(classicOgV07I.favors ?? {}));
    expect(classicOgV07J.permanentUnlocks).toEqual(classicOgV07I.permanentUnlocks);
    expect(classicOgV07J.questDefinitions).toEqual(classicOgV07I.questDefinitions);
  });

  it('preserves the 0.7-G hideout extension', () => {
    expect(hideoutV2For(classicOgV07J)).toEqual(hideoutV2For(classicOgV07I));
    expect(hideoutV2Problems(classicOgV07J)).toEqual([]);
  });

  it('uses one timed favor category for each live effect lane', () => {
    expect(classicOgV07J.favors!.MAMA_ADVICE.activation.category).toBe('STREET');
    expect(classicOgV07J.favors!.STREET_FRENZY.activation.category).toBe('STREET');
    expect(classicOgV07J.favors!.COOKHOUSE_RUSH.activation.category).toBe('UNDERWORLD');
    expect(classicOgV07J.favors!.PIP_CONNECTION.activation.category).toBe('UNDERWORLD');
    expect(classicOgV07J.favors!.FIELD_MEDIC.activation.category).toBe('MUSCLE');
  });
});
