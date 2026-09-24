import { describe, expect, it } from 'vitest';
import { classicOgV07Y } from '../classic-og-v0.7-y/index.js';
import { classicOgV07Z } from '../classic-og-v0.7-z/index.js';

describe('Phase Y-E player-facing site themes', () => {
  it('pins the site-theme ruleset without changing quest content', () => {
    expect(classicOgV07Z.meta).toEqual({
      id: 'classic-og-v0.7-z',
      version: '0.7.0-Z',
      name: 'Classic OG - Site Themes & Decor',
    });
    expect(classicOgV07Z.questDefinitions).toBe(classicOgV07Y.questDefinitions);
  });

  it('adds Winter Lights and Halloween Moon as site themes', () => {
    expect(classicOgV07Z.cosmetics?.['winter-christmas-2026']).toMatchObject({
      kind: 'SITE_THEME',
      styleKey: 'winter-lights',
      rarity: 'epic',
    });
    expect(classicOgV07Z.cosmetics?.['halloween-moon-2026']).toMatchObject({
      kind: 'SITE_THEME',
      styleKey: 'halloween-moon',
      rarity: 'epic',
    });
  });

  it('keeps Y-E acquisition-neutral for the holiday-event phase', () => {
    const rewardKeys = Object.values(classicOgV07Z.questDefinitions ?? {})
      .flatMap((quest) => quest.rewards)
      .flatMap((reward) => reward.kind === 'COSMETIC_UNLOCK' ? [reward.key] : []);

    expect(rewardKeys).not.toContain('winter-christmas-2026');
    expect(rewardKeys).not.toContain('halloween-moon-2026');
  });
});
