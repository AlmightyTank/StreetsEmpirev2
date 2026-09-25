import { describe, expect, it } from 'vitest';
import type { ActivityDto } from '@streets/shared';
import { describeActivity } from '../ActivityFeed.js';

function activity(payload: Record<string, unknown>, type: ActivityDto['type'] = 'WEAPON_UNLOCK'): ActivityDto {
  return {
    id: 'activity-1',
    type,
    payload,
    createdAt: '2026-09-20T12:00:00.000Z',
  };
}

describe('describeActivity', () => {
  it('explains Tommy weapon access unlocks', () => {
    expect(describeActivity(activity({ weapon: 'Shotgun', unlock: 'Worth serving' }), 'crack')).toEqual({
      text: 'Earned Shotgun access at Tommy’s.',
      detail: 'Worth serving · Shotgun purchases are unlocked for the rest of the round. · Buying one still uses Tommy’s shelf and your cash.',
    });
  });

  it('keeps detail for old favor-shaped unlock rows', () => {
    expect(describeActivity(activity({ weapon: 'Tek-9', favor: 'A favor for Tommy' }), 'crack').detail)
      .toContain('A favor for Tommy');
  });

  it('explains legacy unlock rows without a weapon name', () => {
    expect(describeActivity(activity({}), 'crack')).toEqual({
      text: 'Earned weapon access at Tommy’s.',
      detail: 'Tommy’s locked weapon purchases are unlocked for the rest of the round. · Buying one still uses Tommy’s shelf and your cash.',
    });
  });

  it('combines Scout product gains, use, and seizures into one entry per product', () => {
    const result = describeActivity(activity({
      district: 'Casino District',
      turns: 10,
      cashCents: 2500,
      productMovements: [
        { key: 'ECSTASY', name: 'Ecstasy', found: 3, produced: 0, used: 2, seized: 1, change: 0 },
        { key: 'CRACK', name: 'Crack', found: 5, produced: 0, used: 1, seized: 0, change: 4 },
      ],
    }, 'SCOUT'), 'crack');

    expect(result.detail).toContain('Ecstasy: +3 found · −2 used · −1 seized');
    expect(result.detail).toContain('Crack: +5 found · −1 used');
    expect(result.detail?.match(/Ecstasy/g)).toHaveLength(1);
  });

  it('combines Produce output and street finds for the same product', () => {
    const result = describeActivity(activity({
      turns: 10,
      productName: 'Meth',
      product: 12,
      productsFound: [{ key: 'METH', name: 'Meth', quantity: 2 }],
      productMovements: [
        { key: 'METH', name: 'Meth', found: 2, produced: 12, used: 3, seized: 0, change: 11 },
      ],
    }, 'PRODUCE_CRACK'), 'crack');

    expect(result.detail).toContain('Meth: +12 produced · +2 found · −3 used');
    expect(result.detail?.match(/Meth/g)).toHaveLength(1);
  });

  it('uses grouped raid inventory instead of the legacy crack-only summary', () => {
    const result = describeActivity(activity({
      opponent: 'Rival',
      won: true,
      cashCents: 5000,
      crack: 4,
      turns: 10,
      inventoryChanges: [
        { product: 'CRACK', name: 'Crack', change: 1, after: 21, used: 3, gained: 4, lost: 0 },
        { product: 'WEED', name: 'Weed', change: 2, after: 12, used: 0, gained: 2, lost: 0 },
      ],
    }, 'RAID_ATTACK'), 'crack');

    expect(result.detail).toContain('Crack: +4 gained · −3 used');
    expect(result.detail).toContain('Weed: +2 gained');
    expect(result.detail).not.toContain('+4 product');
  });


  it('explains a ready quest and where to collect it', () => {
    expect(describeActivity(activity({ title: 'First Night Out' }, 'QUEST_READY'), 'crack')).toEqual({
      text: 'Job complete: First Night Out.',
      detail: 'Return to Quests to collect payment.',
    });
  });

  it('explains a completed quest objective', () => {
    expect(describeActivity(activity({
      title: 'First Night Out',
      objective: 'Scout for 12 turns.',
    }, 'QUEST_OBJECTIVE_COMPLETE'), 'crack')).toEqual({
      text: 'Objective complete: Scout for 12 turns.',
      detail: 'Job: First Night Out',
    });
  });

  it('summarizes claimed quest rewards', () => {
    expect(describeActivity(activity({
      title: 'First Night Out',
      rewards: ['$2,500', '+5 Mama King reputation'],
    }, 'QUEST_CLAIMED'), 'crack')).toEqual({
      text: 'Collected payment for First Night Out.',
      detail: '$2,500 · +5 Mama King reputation',
    });
  });


  it('renders timed favor activation', () => {
    expect(describeActivity(activity({
      favorKey: 'MAMA_ADVICE',
      name: "Mama's Advice",
      category: 'STREET',
      expiresAt: '2026-09-22T12:10:00.000Z',
    }, 'FAVOR_ACTIVATED'), 'crack')).toMatchObject({
      text: "Activated Mama's Advice.",
    });
  });


  it('renders single-use favor arm and disarm activity', () => {
    expect(describeActivity(activity({
      favorKey: 'TOMMY_VOUCHER',
      name: 'Tommy Voucher',
      category: 'MUSCLE',
    }, 'FAVOR_ARMED'), 'crack')).toEqual({
      text: 'Armed Tommy Voucher.',
      detail: 'MUSCLE · waiting for the next eligible action',
    });

    expect(describeActivity(activity({
      favorKey: 'TOMMY_VOUCHER',
      name: 'Tommy Voucher',
      category: 'MUSCLE',
    }, 'FAVOR_DISARMED'), 'crack')).toEqual({
      text: 'Put Tommy Voucher back in your pocket.',
      detail: 'MUSCLE',
    });
  });

});
