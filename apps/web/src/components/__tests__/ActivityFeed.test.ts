import { describe, expect, it } from 'vitest';
import type { ActivityDto } from '@streets/shared';
import { describeActivity } from '../ActivityFeed.js';

function activity(payload: Record<string, unknown>): ActivityDto {
  return {
    id: 'activity-1',
    type: 'WEAPON_UNLOCK',
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
});
