import { describe, expect, it } from 'vitest';
import { classicOgV165G } from '../classic-og-v1.6.5-g/index.js';
import { classicOgV17A } from '../classic-og-v1.7-a/index.js';
import { hideoutV2For } from '../hideout-v2.js';
import { rulesets } from '../index.js';
import type { Ruleset } from '../types.js';

describe('1.7.0-A individual roster ruleset', () => {
  it('registers a new pinned ruleset and enables the roster only there', () => {
    expect(classicOgV17A.meta).toEqual({ id: 'classic-og-v1.7-a', version: '1.7.0-A', name: 'Classic OG - Individual Roster' });
    expect(rulesets[classicOgV17A.meta.id]).toBe(classicOgV17A);
    expect(Object.values(rulesets).at(-1)).toBe(classicOgV17A);
    const earlier = Object.values(rulesets).filter((ruleset) => !ruleset.meta.id.startsWith('classic-og-v1.7-')) as Ruleset[];
    expect(earlier.length).toBeGreaterThan(100);
    for (const ruleset of earlier) expect(ruleset.crewRoster, ruleset.meta.id).toBeUndefined();
  });

  it('changes no gameplay value from the 1.6.5-G release', () => {
    const { meta: _meta, crewRoster, ...next } = classicOgV17A;
    const { meta: _baseMeta, ...base } = classicOgV165G;
    expect(crewRoster).toEqual({ enabled: true });
    expect(next).toEqual(base);
    expect(hideoutV2For(classicOgV17A)).toBe(hideoutV2For(classicOgV165G));
  });
});
