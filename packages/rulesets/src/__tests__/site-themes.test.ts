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

  it('adds permanent identity themes plus Winter Lights and Halloween Moon as site themes', () => {
    expect(classicOgV07Z.cosmetics?.['neon-vice']).toMatchObject({
      kind: 'SITE_THEME',
      styleKey: 'neon-vice',
      rarity: 'epic',
    });
    expect(classicOgV07Z.cosmetics?.['motor-city-iron']).toMatchObject({
      kind: 'SITE_THEME',
      styleKey: 'motor-city-iron',
      rarity: 'epic',
    });
    expect(classicOgV07Z.cosmetics?.['rain-city-wire']).toMatchObject({
      kind: 'SITE_THEME',
      styleKey: 'rain-city-wire',
      rarity: 'epic',
    });
    expect(classicOgV07Z.cosmetics?.['open-road']).toMatchObject({
      kind: 'SITE_THEME',
      styleKey: 'open-road',
      rarity: 'epic',
    });
    expect(classicOgV07Z.cosmetics?.['blue-heat']).toMatchObject({
      kind: 'SITE_THEME',
      styleKey: 'blue-heat',
      rarity: 'epic',
    });
    expect(classicOgV07Z.cosmetics?.['back-office']).toMatchObject({
      kind: 'SITE_THEME',
      styleKey: 'back-office',
      rarity: 'epic',
    });
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
