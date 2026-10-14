import { describe, expect, it } from 'vitest';
import { AVATAR_FRAME_SPECS, avatarFrameOpeningStyle, avatarFrameSpec } from './avatarFrameOpenings.js';

const STREET_PASS_FRAME_KEYS = [
  'street-pass-s1-frame',
  'street-pass-s1-chrome-serpent-frame',
  'street-pass-s1-phantom-convoy-frame',
  'street-pass-s1-lantern-district-frame',
  'street-pass-s1-siren-breaker-frame',
  'street-pass-s1-block-sovereign-frame',
  'street-pass-s1-gilded-house-frame',
  'street-pass-s1-dead-or-alive-frame',
  'street-pass-s1-laurel-ascendant-frame',
  'street-pass-s1-snowstorm-frame',
  'street-pass-s1-inferno-frame',
] as const;

describe('shared avatar frame openings', () => {
  it('covers every Street Pass frame with identical geometry when equipped', () => {
    for (const rewardKey of STREET_PASS_FRAME_KEYS) {
      const spec = avatarFrameSpec(rewardKey);
      expect(spec, rewardKey).toBeDefined();
      expect(spec?.artUrl).toBe('/items/' + rewardKey + '.svg');
      expect(avatarFrameOpeningStyle(rewardKey)).toEqual(avatarFrameOpeningStyle(spec?.profileKey));
    }
  });

  it('keeps every cutout inside its artwork without obscuring decorative edges', () => {
    for (const { profileKey, opening } of AVATAR_FRAME_SPECS) {
      expect(opening.left, profileKey).toBeGreaterThanOrEqual(0);
      expect(opening.top, profileKey).toBeGreaterThanOrEqual(0);
      expect(opening.width, profileKey).toBeGreaterThan(0);
      expect(opening.height, profileKey).toBeGreaterThan(0);
      expect(opening.left + opening.width, profileKey).toBeLessThanOrEqual(100);
      expect(opening.top + opening.height, profileKey).toBeLessThanOrEqual(100);
      if (opening.shape === 'circle' || opening.shape === 'square') {
        expect(opening.width, profileKey).toBe(opening.height);
      }
    }
  });

  it('keeps square and rectangular artwork openings non-circular', () => {
    expect(avatarFrameSpec('street-pass-s1-frame')?.opening.shape).toBe('square');
    expect(avatarFrameSpec('dead-or-alive-frame')?.opening.shape).toBe('rectangle');
    expect(avatarFrameOpeningStyle('street-pass-s1-dead-or-alive-frame')).toEqual(
      avatarFrameOpeningStyle('dead-or-alive-frame'),
    );
  });

  it('leaves unregistered and unequipped frames unaffected', () => {
    expect(avatarFrameOpeningStyle(null)).toBeUndefined();
    expect(avatarFrameOpeningStyle('unregistered-frame')).toBeUndefined();
  });
});
