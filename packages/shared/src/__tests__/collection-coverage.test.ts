import { describe, expect, it } from 'vitest';
import { collectionCovers, CREW_COSMETIC_KEYS, CUSTOMIZABLE_ITEM_KEYS } from '../cosmetics.js';
import { crewCosmeticLoadoutSchema, itemCosmeticLoadoutSchema, profileSurfaceSchema, updateAccountProfileSettingsSchema } from '../schemas/auth.js';

describe('collection coverage', () => {
  it('lets every older collection cover every item and crew type', () => {
    for (const style of ['classic', 'midnight-ops', 'urban-ghost', 'cartel-gold']) {
      for (const key of [...CUSTOMIZABLE_ITEM_KEYS, ...CREW_COSMETIC_KEYS]) expect(collectionCovers(style, key)).toBe(true);
    }
  });

  it('limits Midnight Chrome to the crew and the rides it was drawn for', () => {
    const covered = [...CUSTOMIZABLE_ITEM_KEYS, ...CREW_COSMETIC_KEYS].filter((key) => collectionCovers('midnight-chrome', key));
    expect(covered.sort()).toEqual(['HOE', 'LOW_RIDER', 'SEDAN', 'THUG', 'VAN']);
  });

  it('refuses a collection on an item it has no art for', () => {
    expect(itemCosmeticLoadoutSchema.safeParse({ VAN: 'midnight-chrome' }).success).toBe(true);
    const refused = itemCosmeticLoadoutSchema.safeParse({ AK47: 'midnight-chrome' });
    expect(refused.success).toBe(false);
    expect(refused.error?.issues[0]?.message).toBe('That collection has no artwork for this item.');
    expect(crewCosmeticLoadoutSchema.parse({ THUG: 'midnight-chrome', HOE: 'classic' })).toEqual({ THUG: 'midnight-chrome', HOE: 'classic' });
  });

  it('accepts the Signature card surface and the chrome glint', () => {
    expect(profileSurfaceSchema.options).toEqual(['brushed', 'carbon', 'engine-turned']);
    const base = {
      activeTitleKey: null,
      activeProfileFrameKey: 'midnight-chrome-frame',
      featuredBadgeKeys: [],
      profileAccent: 'default',
      uiDensity: 'comfortable',
      reducedMotion: false,
      moneyFormat: 'full',
      defaultLanding: 'game',
    };
    const parsed = updateAccountProfileSettingsSchema.parse({ ...base, profileEffect: 'midnight-chrome', profileSurface: 'carbon' });
    expect(parsed).toMatchObject({ profileEffect: 'midnight-chrome', profileSurface: 'carbon' });
    expect(updateAccountProfileSettingsSchema.safeParse({ ...base, profileSurface: 'gold-leaf' }).success).toBe(false);
  });
});
