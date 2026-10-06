import { describe, expect, it } from 'vitest';
import { classicOgV14E } from '../classic-og-v1.4-e/index.js';
import { classicOgV14F } from '../classic-og-v1.4-f/index.js';
import { factionProblems } from '../faction-definitions.js';
import type { Ruleset } from '../types.js';

const loose = classicOgV14F as unknown as Ruleset;

describe('1.4.0-F faction rewards and public flavor ruleset', () => {
  it('is 1.4.0-E plus faction cosmetics and the public block, and nothing else', () => {
    expect(classicOgV14F.meta).toEqual({ id: 'classic-og-v1.4-f', version: '1.4.0-F', name: 'Classic OG - Faction Rewards & Public Flavor' });
    const { meta: _m, cosmetics: _c, factionPublic, ...rest } = classicOgV14F;
    const { meta: _bm, cosmetics: baseCosmetics, ...base } = classicOgV14E;
    expect(rest).toEqual(base);
    for (const [key, cosmetic] of Object.entries(baseCosmetics)) expect(loose.cosmetics![key]).toEqual(cosmetic);
    expect(factionPublic).toMatchObject({ publicFrom: 'CONNECTED', feedFrom: 'INNER_CIRCLE' });
    expect(factionProblems(classicOgV14F)).toEqual([]);
  });

  it('gives every faction a title and an accent at Connected and a frame at Inner Circle', () => {
    for (const faction of Object.keys(classicOgV14F.factions)) {
      const connected = classicOgV14F.factionPublic.rewards.CONNECTED[faction as keyof typeof classicOgV14F.factionPublic.rewards.CONNECTED].map((key) => loose.cosmetics![key]!.kind);
      const inner = classicOgV14F.factionPublic.rewards.INNER_CIRCLE[faction as keyof typeof classicOgV14F.factionPublic.rewards.INNER_CIRCLE].map((key) => loose.cosmetics![key]!.kind);
      expect(connected.sort(), faction).toEqual(['ACCENT', 'TITLE_BADGE']);
      expect(inner, faction).toEqual(['PROFILE_FRAME']);
    }
  });

  it('rejects tier cosmetics that are missing from the catalog or name an unknown faction', () => {
    const bad = { ...classicOgV14F, factionPublic: { ...classicOgV14F.factionPublic, rewards: { CONNECTED: { KINGS: ['nope'], NOBODY: [] } } } } as unknown as Ruleset;
    expect(factionProblems(bad)).toEqual(expect.arrayContaining([
      "KINGS's CONNECTED cosmetic nope is missing from the cosmetics catalog.",
      'CONNECTED cosmetics name unknown faction NOBODY.',
    ]));
  });
});
