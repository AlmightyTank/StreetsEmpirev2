import { describe, expect, it } from 'vitest';
import { SUPPORTER_COSMETICS } from '../supporter.js';

describe('supporter crew banners', () => {
  it('keeps each banner independently entitled and art-addressable', () => {
    const banners = Object.values(SUPPORTER_COSMETICS).filter((cosmetic) => cosmetic.kind === 'CREW_BANNER');
    expect(banners.map((banner) => banner.key)).toEqual([
      'midnight-chrome-crew-banner',
      'midnight-chrome-crew-banner-night',
    ]);
    expect(new Set(banners.map((banner) => banner.styleKey)).size).toBe(banners.length);
    for (const banner of banners) expect(banner.description).toMatch(/Cosmetic only/i);
  });

  it('ships the curated Slice D themes as permanent cosmetic unlocks', () => {
    const themes = Object.values(SUPPORTER_COSMETICS).filter((cosmetic) => cosmetic.kind === 'SITE_THEME');
    expect(themes.map((theme) => theme.key)).toEqual(['neon-afterhours', 'blacktop-royalty', 'crimson-circuit']);
    expect(new Set(themes.map((theme) => theme.styleKey)).size).toBe(themes.length);
    for (const theme of themes) expect(theme.description).toMatch(/Cosmetic only/i);
  });
});
