import { describe, expect, it } from 'vitest';
import {
  classicOgV06F,
  classicOgV07A,
  classicOgV07B,
  classicOgV07C,
  classicOgV07D,
  hideoutV2For,
  hideoutV2Problems,
} from '../index.js';

describe('classic-og-v0.7-a hideout foundation', () => {
  it('keeps the 0.6 hideout balance and adds extension metadata only to 0.7', () => {
    expect(classicOgV07A.hideout).toEqual(classicOgV06F.hideout);
    expect(hideoutV2For(classicOgV06F)).toBeNull();

    const extension = hideoutV2For(classicOgV07A);
    expect(extension?.version).toBe(2);
    expect(extension?.rooms.SAFE_ROOM?.requirements?.[3]).toEqual([
      { key: 'RAIDS_DONE', label: 'Raids completed', amount: 1 },
    ]);
    expect(extension?.rooms.WORKSHOP?.specialization?.choices.map((choice) => choice.key))
      .toEqual(['DRUG_LAB', 'GARAGE']);
  });

  it('passes the static extension validator', () => {
    expect(hideoutV2Problems(classicOgV07A)).toEqual([]);
  });

  it('adds capped Safe Room product protection only in 0.7-B', () => {
    expect(classicOgV07B.hideout).toEqual(classicOgV07A.hideout);
    expect(hideoutV2For(classicOgV07A)?.assetProtection).toBeUndefined();
    expect(hideoutV2For(classicOgV07B)?.assetProtection?.protectedProductUnitsBySafeRoomLevel)
      .toEqual([0, 0, 0, 25, 60, 100]);
    expect(hideoutV2Problems(classicOgV07B)).toEqual([]);
  });
  it('adds Lookouts warning tiers, turf gates and inactive specialization hooks only in 0.7-C', () => {
    const extension = hideoutV2For(classicOgV07C);
    expect(classicOgV07C.hideout).toEqual(classicOgV07B.hideout);
    expect(hideoutV2For(classicOgV07B)?.security).toBeUndefined();
    expect(extension?.security?.warningTierByLookoutsLevel)
      .toEqual(['NONE', 'PRESENCE', 'PRESENCE', 'SOURCE', 'SOURCE', 'SOURCE']);
    expect(extension?.security?.historyHoursByLookoutsLevel).toEqual([0, 1, 4, 8, 12, 24]);
    expect(extension?.rooms.LOOKOUTS?.requirements?.[4])
      .toEqual([{ key: 'TURF_BLOCKS_HELD', label: 'Turf blocks held', amount: 1 }]);
    expect(extension?.rooms.LOOKOUTS?.requirements?.[5])
      .toEqual([{ key: 'TURF_BLOCKS_HELD', label: 'Turf blocks held', amount: 3 }]);
    expect(extension?.security?.specializationHooks).toMatchObject({
      streetEyesWarningHoursBonus: 12,
      armedWatchDefenseBonusPercent: 5,
    });
    expect(hideoutV2Problems(classicOgV07C)).toEqual([]);
  });

  it('adds Workshop efficiency and Garage logistics only in 0.7-D', () => {
    const extension = hideoutV2For(classicOgV07D);
    expect(classicOgV07D.hideout).toEqual(classicOgV07C.hideout);
    expect(hideoutV2For(classicOgV07C)?.workshop).toBeUndefined();
    expect(hideoutV2For(classicOgV07C)?.garage).toBeUndefined();

    expect(extension?.workshop?.outputBonusPercentByWorkshopLevel)
      .toEqual([0, 3, 6, 9, 12, 15]);
    expect(extension?.workshop?.ingredientEfficiencyPercentByWorkshopLevel)
      .toEqual([0, 0, 2, 4, 6, 8]);
    expect(extension?.garage?.runLimitByGarageLevel).toEqual([1, 2]);
    expect(extension?.garage?.relocationFeeDiscountPercentByGarageLevel).toEqual([0, 5]);
    expect(extension?.rooms.GARAGE?.requirements?.[1])
      .toEqual([{ key: 'LOW_RIDERS', label: 'Low-Riders owned', amount: 2 }]);
    expect(hideoutV2Problems(classicOgV07D)).toEqual([]);
  });


});
