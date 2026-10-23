import { describe, expect, it, vi } from 'vitest';
import { classicOgV19C } from '@streets/rulesets';
import { ONBOARDING_GUIDE_STEPS } from '@streets/shared';
import { guideProgress } from '../onboarding.service.js';

describe('2.0 origin onboarding', () => {
  it('shows exactly four beats and derives each from real activity', async () => {
    const db = {
      $queryRaw: vi.fn(async () => [{ scouted: true, business: true, encounter: false, career: false }]),
    } as any;

    const progress = await guideProgress(db, { id: 'player-1' }, classicOgV19C);

    expect(ONBOARDING_GUIDE_STEPS).toEqual(['meet_contact', 'open_front', 'face_encounter', 'choose_career']);
    expect(progress).toEqual({ meet_contact: true, open_front: true, face_encounter: false, choose_career: false });
  });
});
