import { describe, expect, it } from 'vitest';
import { classicOgV07X } from '../classic-og-v0.7-x/index.js';
import { classicOgV07Y } from '../classic-og-v0.7-y/index.js';

describe('Phase Y-D global accents and profile frames', () => {
  it('pins a new ruleset without changing quest count', () => {
    expect(classicOgV07Y.meta).toEqual({
      id: 'classic-og-v0.7-y',
      version: '0.7.0-Y',
      name: 'Classic OG - Global Accents & Frames',
    });
    expect(Object.keys(classicOgV07Y.questDefinitions ?? {}))
      .toHaveLength(Object.keys(classicOgV07X.questDefinitions ?? {}).length);
  });

  it('adds six quest accents and six quest profile frames', () => {
    const cosmetics = Object.values(classicOgV07Y.cosmetics ?? {});
    expect(cosmetics.filter((cosmetic) => cosmetic.kind === 'ACCENT')).toHaveLength(6);
    expect(cosmetics.filter((cosmetic) => cosmetic.kind === 'PROFILE_FRAME')).toHaveLength(6);
    expect(cosmetics.filter((cosmetic) => cosmetic.kind === 'TITLE_BADGE')).toHaveLength(6);
  });

  it('gives every appearance cosmetic a stable style key', () => {
    const appearance = Object.values(classicOgV07Y.cosmetics ?? {})
      .filter((cosmetic) => cosmetic.kind === 'ACCENT' || cosmetic.kind === 'PROFILE_FRAME');
    expect(appearance.every((cosmetic) => 'styleKey' in cosmetic && Boolean(cosmetic.styleKey))).toBe(true);
    expect(new Set(appearance.map((cosmetic) => cosmetic.styleKey)).size).toBe(12);
  });

  it('awards matching accent and frame pairs from each one-time Contact finale', () => {
    const expected: Record<string, [string, string]> = {
      MAMA_QUIET_HOUR: ['mama-ghost-violet', 'mama-ghost-frame'],
      PIP_TOP_SHELF: ['pip-top-shelf-teal', 'pip-top-shelf-frame'],
      TOMMY_FULL_RACK: ['tommy-enforcer-red', 'tommy-full-rack-frame'],
      WHEELS_HOME_SAFE: ['wheels-open-road-blue', 'wheels-open-road-frame'],
      VIC_CLEAN_SLATE: ['vic-clean-slate-ice', 'vic-clean-slate-frame'],
      BLOCKS_OUT_OF_TOWN: ['blocks-corner-amber', 'blocks-corner-boss-frame'],
    };

    for (const [questKey, keys] of Object.entries(expected)) {
      const quest = classicOgV07Y.questDefinitions?.[questKey];
      expect(quest?.repeatability).toBe('ONCE');
      for (const key of keys) {
        expect(quest?.rewards).toContainEqual({ kind: 'COSMETIC_UNLOCK', key });
      }
    }
  });

  it('does not put appearance cosmetics into repeatable contracts', () => {
    const repeatable = Object.values(classicOgV07Y.questDefinitions ?? {})
      .filter((quest) => quest.repeatability !== 'ONCE');
    expect(repeatable.flatMap((quest) => quest.rewards.map((reward) => reward.kind)))
      .not.toContain('COSMETIC_UNLOCK');
  });
});
