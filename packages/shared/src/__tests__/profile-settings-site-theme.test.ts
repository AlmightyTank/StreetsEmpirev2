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
    expect(result.showThemeOnProfile).toBe(true);
    expect(result.showLookOnProfile).toBe(true);
  });

  it('keeps profile showcase toggles a player turns off', () => {
    const result = updateAccountProfileSettingsSchema.parse({
      activeTitleKey: null,
      activeProfileFrameKey: null,
      featuredBadgeKeys: [],
      profileAccent: 'default',
      uiDensity: 'comfortable',
      reducedMotion: false,
      moneyFormat: 'full',
      defaultLanding: 'game',
      showThemeOnProfile: false,
      showLookOnProfile: false,
    });

    expect(result.showThemeOnProfile).toBe(false);
    expect(result.showLookOnProfile).toBe(false);
  });

  it('accepts the released Classic weapon and ride loadout', () => {
    const result = updateAccountProfileSettingsSchema.parse({
      activeTitleKey: null,
      activeProfileFrameKey: null,
      featuredBadgeKeys: [],
      profileAccent: 'default',
      uiDensity: 'comfortable',
      reducedMotion: false,
      moneyFormat: 'full',
      defaultLanding: 'game',
      itemCosmetics: { AK47: 'classic', LOW_RIDER: 'classic' },
      crewCosmetics: { THUG: 'classic', HOE: 'classic' },
    });

    expect(result.itemCosmetics).toEqual({ AK47: 'classic', LOW_RIDER: 'classic' });
    expect(result.crewCosmetics).toEqual({ THUG: 'classic', HOE: 'classic' });
  });

  it('accepts every released Slice A collection', () => {
    const itemCosmetics = {
      PISTOL: 'midnight-ops',
      SHOTGUN: 'urban-ghost',
      TEK9: 'cartel-gold',
      AK47: 'midnight-ops',
      LOW_RIDER: 'cartel-gold',
    };
    const result = updateAccountProfileSettingsSchema.parse({
      activeTitleKey: null,
      activeProfileFrameKey: null,
      featuredBadgeKeys: [],
      profileAccent: 'default',
      uiDensity: 'comfortable',
      reducedMotion: false,
      moneyFormat: 'full',
      defaultLanding: 'game',
      itemCosmetics,
    });

    expect(result.itemCosmetics).toEqual(itemCosmetics);
  });

  it('rejects artwork keys that are not in the catalog', () => {
    const result = updateAccountProfileSettingsSchema.safeParse({
      activeTitleKey: null,
      activeProfileFrameKey: null,
      featuredBadgeKeys: [],
      profileAccent: 'default',
      uiDensity: 'comfortable',
      reducedMotion: false,
      moneyFormat: 'full',
      defaultLanding: 'game',
      itemCosmetics: { AK47: 'gilded-ghost' },
    });

    expect(result.success).toBe(false);
  });

  it('accepts Slice B product and supply packaging', () => {
    const itemCosmetics = { CRACK: 'cartel-gold', WEED: 'urban-ghost', BEER: 'midnight-ops' };
    const result = updateAccountProfileSettingsSchema.parse({
      activeTitleKey: null,
      activeProfileFrameKey: null,
      featuredBadgeKeys: [],
      profileAccent: 'default',
      uiDensity: 'comfortable',
      reducedMotion: false,
      moneyFormat: 'full',
      defaultLanding: 'game',
      itemCosmetics,
    });

    expect(result.itemCosmetics).toEqual(itemCosmetics);
  });

  it('accepts released Slice C crew outfits', () => {
    const result = updateAccountProfileSettingsSchema.parse({
      activeTitleKey: null,
      activeProfileFrameKey: null,
      featuredBadgeKeys: [],
      profileAccent: 'default',
      uiDensity: 'comfortable',
      reducedMotion: false,
      moneyFormat: 'full',
      defaultLanding: 'game',
      crewCosmetics: { THUG: 'cartel-gold', HOE: 'urban-ghost' },
    });

    expect(result.crewCosmetics).toEqual({ THUG: 'cartel-gold', HOE: 'urban-ghost' });
  });

  it('defaults a missing crew outfit to Classic and rejects unknown outfits', () => {
    const base = {
      activeTitleKey: null,
      activeProfileFrameKey: null,
      featuredBadgeKeys: [],
      profileAccent: 'default',
      uiDensity: 'comfortable',
      reducedMotion: false,
      moneyFormat: 'full',
      defaultLanding: 'game',
    };

    expect(updateAccountProfileSettingsSchema.parse({ ...base, crewCosmetics: { THUG: 'midnight-ops' } }).crewCosmetics)
      .toEqual({ THUG: 'midnight-ops', HOE: 'classic' });
    expect(updateAccountProfileSettingsSchema.safeParse({ ...base, crewCosmetics: { HOE: 'gilded-ghost' } }).success).toBe(false);
  });

  it('rejects cosmetics for items without authored variants', () => {
    const result = updateAccountProfileSettingsSchema.safeParse({
      activeTitleKey: null,
      activeProfileFrameKey: null,
      featuredBadgeKeys: [],
      profileAccent: 'default',
      uiDensity: 'comfortable',
      reducedMotion: false,
      moneyFormat: 'full',
      defaultLanding: 'game',
      itemCosmetics: { CASH: 'classic' },
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
