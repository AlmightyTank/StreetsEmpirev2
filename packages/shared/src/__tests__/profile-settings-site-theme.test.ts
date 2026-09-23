import { describe, expect, it } from 'vitest';
import { updateAccountProfileSettingsSchema } from '../schemas/auth.js';

describe('Phase Y-E profile settings schema', () => {
  it('keeps older clients compatible when site theme is missing', () => {
    const result = updateAccountProfileSettingsSchema.parse({
      activeTitleKey: null,
      activeProfileFrameKey: null,
      featuredBadgeKeys: [],
      profileAccent: 'default',
      uiDensity: 'comfortable',
      reducedMotion: false,
      moneyFormat: 'full',
      defaultLanding: 'game',
    });

    expect(result.activeSiteThemeKey).toBeNull();
  });

  it('accepts a selected site theme presentation key', () => {
    const result = updateAccountProfileSettingsSchema.parse({
      activeTitleKey: null,
      activeProfileFrameKey: null,
      activeSiteThemeKey: 'winter-lights',
      featuredBadgeKeys: [],
      profileAccent: 'default',
      uiDensity: 'comfortable',
      reducedMotion: false,
      moneyFormat: 'full',
      defaultLanding: 'game',
    });

    expect(result.activeSiteThemeKey).toBe('winter-lights');
  });
});
