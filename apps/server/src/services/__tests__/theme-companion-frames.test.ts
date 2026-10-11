import { describe, expect, it } from 'vitest';
import { rulesets, SITE_THEME_COMPANION_FRAMES, STREET_PASS_S1_COSMETICS } from '@streets/rulesets';
import { withThemeCompanionFrames } from '../quest-cosmetic.service.js';
import { PROFILE_EFFECTS } from '../account-profile.service.js';

const themeStyles = new Set(
  Object.values(rulesets).flatMap((ruleset) => Object.values(ruleset.cosmetics ?? {}))
    .filter((cosmetic) => cosmetic.kind === 'SITE_THEME')
    .map((cosmetic) => cosmetic.styleKey ?? cosmetic.key),
);

describe('site theme companion frames', () => {
  it('pairs real site themes with real profile frames', () => {
    for (const [themeStyle, frameKey] of Object.entries(SITE_THEME_COMPANION_FRAMES)) {
      expect(themeStyles.has(themeStyle), themeStyle).toBe(true);
      expect(STREET_PASS_S1_COSMETICS[frameKey].kind, frameKey).toBe('PROFILE_FRAME');
    }
  });

  it('pairs each theme with the frame the Street Pass already awards beside it', () => {
    for (const [themeStyle, frameKey] of Object.entries(SITE_THEME_COMPANION_FRAMES)) {
      const passThemes = Object.values(STREET_PASS_S1_COSMETICS)
        .filter((cosmetic) => cosmetic.kind === 'SITE_THEME' && cosmetic.styleKey === themeStyle);
      expect(passThemes.length, themeStyle).toBeGreaterThan(0);
      expect(frameKey in STREET_PASS_S1_COSMETICS).toBe(true);
    }
    // Every animated frame has a theme that brings it.
    const animatedFrames = Object.values(STREET_PASS_S1_COSMETICS)
      .filter((cosmetic) => cosmetic.kind === 'PROFILE_FRAME' && cosmetic.key !== 'street-pass-s1-frame')
      .map((cosmetic) => cosmetic.key);
    expect(new Set(Object.values(SITE_THEME_COMPANION_FRAMES))).toEqual(new Set(animatedFrames));
    expect(PROFILE_EFFECTS.length - 1).toBe(animatedFrames.length);
  });

  it('adds the frame for each owned theme once, and nothing for themes without one', () => {
    const themes = [
      { key: 'motor-city-iron', label: 'Motor City Iron', description: null },
      { key: 'back-office', label: 'Back Office', description: null },
      { key: 'dragon-fire', label: 'Dragon Fire', description: null },
    ];
    const earned = [{ key: 'inferno-drake', label: 'Inferno Frame', description: null }];
    const frames = withThemeCompanionFrames(earned, themes);
    expect(frames.map((frame) => frame.key)).toEqual(['inferno-drake', 'chrome-serpent-frame']);
    expect(withThemeCompanionFrames([], [])).toEqual([]);
  });
});
