import { describe, expect, it } from 'vitest';
import { updateAccountProfileSettingsSchema } from '../schemas/auth.js';

describe('account profile settings schema', () => {
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
    expect(result.titlePlacement).toBe('prefix');
    expect(result.itemCosmetics).toEqual({});
    expect(result.crewCosmetics).toEqual({ THUG: 'classic', HOE: 'classic' });
  });

  it('accepts item and crew cosmetic loadouts', () => {
    const result = updateAccountProfileSettingsSchema.parse({
      activeTitleKey: null,
      activeProfileFrameKey: null,
      featuredBadgeKeys: [],
      profileAccent: 'default',
      uiDensity: 'comfortable',
      reducedMotion: false,
      moneyFormat: 'full',
      defaultLanding: 'game',
      itemCosmetics: { AK47: 'gold', CRACK: 'violet' },
      crewCosmetics: { THUG: 'blackout', HOE: 'ice' },
    });

    expect(result.itemCosmetics).toEqual({ AK47: 'gold', CRACK: 'violet' });
    expect(result.crewCosmetics).toEqual({ THUG: 'blackout', HOE: 'ice' });
  });

  it('rejects cosmetics for item keys outside the customizable catalog', () => {
    const result = updateAccountProfileSettingsSchema.safeParse({
      activeTitleKey: null,
      activeProfileFrameKey: null,
      featuredBadgeKeys: [],
      profileAccent: 'default',
      uiDensity: 'comfortable',
      reducedMotion: false,
      moneyFormat: 'full',
      defaultLanding: 'game',
      itemCosmetics: { CASH: 'gold' },
    });

    expect(result.success).toBe(false);
  });

  it('accepts a selected site theme presentation key', () => {
    const result = updateAccountProfileSettingsSchema.parse({
      activeTitleKey: null,
      titlePlacement: 'suffix',
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

  it('normalizes profile text, media URLs, and effects', () => {
    const result = updateAccountProfileSettingsSchema.parse({
      activeTitleKey: null,
      titlePlacement: 'prefix',
      crewName: null,
      profileBio: '  Runs the south side.\r\n\r\n\r\nBring receipts.  ',
      profileImageUrl: ' https://i.imgur.com/avatar.png ',
      profileBannerUrl: '',
      profileEffect: 'scanlines',
      activeProfileFrameKey: null,
      activeSiteThemeKey: null,
      featuredBadgeKeys: [],
      profileAccent: 'default',
      uiDensity: 'comfortable',
      reducedMotion: false,
      moneyFormat: 'full',
      defaultLanding: 'game',
    });

    expect(result.profileBio).toBe('Runs the south side.\n\nBring receipts.');
    expect(result.profileImageUrl).toBe('https://i.imgur.com/avatar.png');
    expect(result.profileBannerUrl).toBeNull();
    expect(result.profileEffect).toBe('scanlines');
  });

  it('rejects non-https profile media URLs', () => {
    const result = updateAccountProfileSettingsSchema.safeParse({
      activeTitleKey: null,
      activeProfileFrameKey: null,
      featuredBadgeKeys: [],
      profileAccent: 'default',
      uiDensity: 'comfortable',
      reducedMotion: false,
      moneyFormat: 'full',
      defaultLanding: 'game',
      profileImageUrl: 'http://example.com/avatar.png',
    });

    expect(result.success).toBe(false);
  });
});
