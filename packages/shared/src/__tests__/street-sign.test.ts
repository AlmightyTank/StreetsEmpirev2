import { describe, expect, it } from 'vitest';
import { DEFAULT_STREET_SIGN, readStreetSignDesign, streetSignDesignSchema, streetSignForCrewName } from '../street-sign.js';
import { updateAccountProfileSettingsSchema } from '../schemas/auth.js';

describe('street sign design', () => {
  it('accepts and normalizes a classic street sign', () => {
    expect(streetSignDesignSchema.parse({ ...DEFAULT_STREET_SIGN, streetName: '  Cedar   Avenue ' })).toMatchObject({
      shape: 'classic',
      streetName: 'Cedar Avenue',
      streetType: 'DR',
    });
  });

  it('uses the crew name as sign lettering while preserving the saved sign styling', () => {
    const design = { ...DEFAULT_STREET_SIGN, streetName: 'Old Name', tag: 'NIGHT SHIFT' };
    expect(streetSignForCrewName(design, 'Syndicate')).toMatchObject({
      streetName: 'Syndicate',
      streetType: 'DR',
      tag: 'NIGHT SHIFT',
      shape: 'classic',
    });
    expect(streetSignForCrewName(design, null)?.streetName).toBe('Old Name');
  });

  it('accepts the wide shape and curated font keys', () => {
    expect(streetSignDesignSchema.parse({ ...DEFAULT_STREET_SIGN, shape: 'wide', streetName: 'Cedar', font: 'stencil' }).shape).toBe('wide');
  });

  it('normalizes v1 signs to v2 controls without changing their visible design', () => {
    const legacy = {
      version: 1,
      shape: 'wide',
      streetName: 'Cedar',
      streetType: 'AVE',
      font: 'stencil',
      tag: 'NIGHT SHIFT',
      tagFont: 'handstyle',
      backgroundColor: '#172c47',
      textColor: '#ffffff',
      tagColor: '#ffd34e',
    };
    expect(readStreetSignDesign(legacy)).toMatchObject({
      version: 2,
      streetName: 'Cedar',
      shape: 'wide',
      tagScale: 'medium',
      tagPlacement: 'lower-right',
      trim: 'double',
      shadow: 'soft',
      treatment: 'reflective',
    });
  });

  it.each(['shield', 'octagon', 'wood'])('rejects unsupported sign style %s', (shape) => {
    expect(streetSignDesignSchema.safeParse({ ...DEFAULT_STREET_SIGN, shape }).success).toBe(false);
  });

  it('rejects markup and malformed colors', () => {
    expect(streetSignDesignSchema.safeParse({ ...DEFAULT_STREET_SIGN, streetName: '<img src=x>' }).success).toBe(false);
    expect(streetSignDesignSchema.safeParse({ ...DEFAULT_STREET_SIGN, tagColor: 'red' }).success).toBe(false);
  });

  it('returns null rather than trusting malformed persisted JSON', () => {
    expect(readStreetSignDesign({ version: 99, streetName: '<svg>' })).toBeNull();
  });

  it('accepts only a valid sign as part of account profile settings', () => {
    const parsed = updateAccountProfileSettingsSchema.safeParse({
      activeTitleKey: null,
      titlePlacement: 'prefix',
      activeProfileFrameKey: null,
      activeSiteThemeKey: null,
      featuredBadgeKeys: [],
      profileAccent: 'default',
      uiDensity: 'comfortable',
      reducedMotion: false,
      moneyFormat: 'full',
      defaultLanding: 'game',
      streetSign: { ...DEFAULT_STREET_SIGN, shape: 'wide', streetName: 'Cedar' },
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.streetSign?.streetName).toBe('Cedar');
  });

  it('accepts v1 designs from older open clients and upgrades them to v2', () => {
    const parsed = updateAccountProfileSettingsSchema.safeParse({
      activeTitleKey: null,
      titlePlacement: 'prefix',
      activeProfileFrameKey: null,
      activeSiteThemeKey: null,
      featuredBadgeKeys: [],
      profileAccent: 'default',
      uiDensity: 'comfortable',
      reducedMotion: false,
      moneyFormat: 'full',
      defaultLanding: 'game',
      streetSign: {
        version: 1,
        shape: 'classic', streetName: 'Cedar', streetType: 'DR', font: 'road-condensed',
        tag: '', tagFont: 'handstyle', backgroundColor: '#00691d', textColor: '#ffffff', tagColor: '#ffd34e',
      },
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.streetSign).toMatchObject({ version: 2, trim: 'double' });
  });

  it('requires street text before saving a sign', () => {
    expect(streetSignDesignSchema.safeParse(DEFAULT_STREET_SIGN).success).toBe(false);
  });
});
