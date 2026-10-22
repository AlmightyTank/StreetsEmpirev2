import { describe, expect, it } from 'vitest';
import { DEFAULT_STREET_SIGN, STREET_SIGN_BACKDROPS, readStreetSignDesign, streetSignDesignSchema, streetSignForCrewName } from '../street-sign.js';
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
    expect(streetSignForCrewName(design, null)).toBeNull();
  });

  it('accepts the wide shape and curated font keys', () => {
    expect(streetSignDesignSchema.parse({ ...DEFAULT_STREET_SIGN, shape: 'wide', streetName: 'Cedar', font: 'stencil' }).shape).toBe('wide');
  });

  it('normalizes v1 signs to v3 controls without changing their visible design', () => {
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
      version: 3,
      backdrop: 'plain',
      streetName: 'Cedar',
      shape: 'wide',
      tagScale: 'medium',
      tagPlacement: 'lower-right',
      trim: 'double',
      shadow: 'soft',
      treatment: 'reflective',
    });
  });

  it('reads saved v2 signs as a plain backdrop and keeps their controls', () => {
    const { backdrop: _backdrop, ...v2 } = { ...DEFAULT_STREET_SIGN, version: 2, streetName: 'Cedar', trim: 'beveled' };
    expect(readStreetSignDesign(v2)).toMatchObject({ version: 3, backdrop: 'plain', trim: 'beveled', streetName: 'Cedar' });
  });

  it('accepts every collection backdrop and rejects unknown ones', () => {
    for (const backdrop of STREET_SIGN_BACKDROPS) {
      expect(streetSignDesignSchema.safeParse({ ...DEFAULT_STREET_SIGN, streetName: 'Cedar', backdrop: backdrop.key }).success).toBe(true);
    }
    expect(streetSignDesignSchema.safeParse({ ...DEFAULT_STREET_SIGN, streetName: 'Cedar', backdrop: 'url(evil.png)' }).success).toBe(false);
    expect(streetSignDesignSchema.safeParse({ ...DEFAULT_STREET_SIGN, streetName: 'Cedar', version: 3, backdrop: undefined }).success).toBe(false);
  });

  it('gives each backdrop readable default lettering', () => {
    const luminance = (color: string) => {
      const [r, g, b] = (color.slice(1).match(/.{2}/g) ?? []).map((part) => {
        const srgb = Number.parseInt(part, 16) / 255;
        return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
    };
    const contrast = (a: string, b: string) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);
    for (const backdrop of STREET_SIGN_BACKDROPS) {
      expect(contrast(backdrop.text, backdrop.background), backdrop.key).toBeGreaterThanOrEqual(4.5);
      expect(contrast(backdrop.tag, backdrop.background), backdrop.key).toBeGreaterThanOrEqual(3);
    }
    expect(new Set(STREET_SIGN_BACKDROPS.map((backdrop) => backdrop.key)).size).toBe(STREET_SIGN_BACKDROPS.length);
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

  it('accepts v1 designs from older open clients and upgrades them to v3', () => {
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
    if (parsed.success) expect(parsed.data.streetSign).toMatchObject({ version: 3, trim: 'double', backdrop: 'plain' });
  });

  it('requires street text before saving a sign', () => {
    expect(streetSignDesignSchema.safeParse(DEFAULT_STREET_SIGN).success).toBe(false);
  });
});
