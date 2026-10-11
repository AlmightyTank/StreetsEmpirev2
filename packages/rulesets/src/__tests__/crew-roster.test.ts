import { describe, expect, it } from 'vitest';
import { classicOgV165G } from '../classic-og-v1.6.5-g/index.js';
import { classicOgV17A } from '../classic-og-v1.7-a/index.js';
import { classicOgV17B } from '../classic-og-v1.7-b/index.js';
import { classicOgV17C } from '../classic-og-v1.7-c/index.js';
import { classicOgV17D } from '../classic-og-v1.7-d/index.js';
import { classicOgV17E } from '../classic-og-v1.7-e/index.js';
import { classicOgV18E } from '../classic-og-v1.8-e/index.js';
import { classicOgV18F } from '../classic-og-v1.8-f/index.js';
import { classicOgV18G } from '../classic-og-v1.8-g/index.js';
import { hideoutV2For } from '../hideout-v2.js';
import { rulesets } from '../index.js';
import type { Ruleset } from '../types.js';

describe('1.7.0 crew profile rulesets', () => {
  it('keeps A pinned and enables the roster only on 1.7 rulesets', () => {
    expect(classicOgV17A.meta).toEqual({ id: 'classic-og-v1.7-a', version: '1.7.0-A', name: 'Classic OG - Individual Roster' });
    expect(rulesets[classicOgV17A.meta.id]).toBe(classicOgV17A);
    // 1.8.0-E builds on 1.7.0-E; later rulesets retain the crew roster.
    expect(Object.values(rulesets).at(-1)).toBe(classicOgV18G);
    expect(classicOgV18E.crewRoster).toBe(classicOgV17E.crewRoster);
    const earlier = Object.values(rulesets).filter((ruleset) => !/^classic-og-v1\.[78]-/.test(ruleset.meta.id)) as Ruleset[];
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

  it('keeps 1.7.0-B pinned without changing A gameplay values', () => {
    expect(classicOgV17B.meta).toEqual({ id: 'classic-og-v1.7-b', version: '1.7.0-B', name: 'Classic OG - Crew Careers' });
    expect(rulesets[classicOgV17B.meta.id]).toBe(classicOgV17B);
    const { meta: _meta, ...next } = classicOgV17B;
    const { meta: _baseMeta, ...base } = classicOgV17A;
    expect(next).toEqual(base);
    expect(hideoutV2For(classicOgV17B)).toBe(hideoutV2For(classicOgV165G));
  });

  it('pins 1.7.0-C XP awards and specialty caps', () => {
    expect(classicOgV17C.meta.version).toBe('1.7.0-C');
    expect(classicOgV17C.crewRoster).toMatchObject({ experiencePerCompletedJob: 5, specialtyUnlockExperience: 20, specialtyTierTwoExperience: 100, specialtyBonusPercent: { tierOne: 2, tierTwo: 5, cap: 5 } });
    expect(rulesets[classicOgV17C.meta.id]).toBe(classicOgV17C);
    expect(hideoutV2For(classicOgV17C)).toBe(hideoutV2For(classicOgV165G));
  });

  it('pins 1.7.0-D training costs, caps and career management', () => {
    expect(classicOgV17D.meta.version).toBe('1.7.0-D');
    expect(classicOgV17D.crewRoster.training).toEqual({ turnCost: 1, cashCostCents: 500_000, experience: 5, earnedExperienceRatioPercent: 25 });
    expect(rulesets[classicOgV17D.meta.id]).toBe(classicOgV17D);
    expect(hideoutV2For(classicOgV17D)).toBe(hideoutV2For(classicOgV165G));
  });

  it('pins the 1.7.0-E operational team ruleset without changing crew progression', () => {
    expect(classicOgV17E.meta).toEqual({ id: 'classic-og-v1.7-e', version: '1.7.0-E', name: 'Classic OG - Operational Teams' });
    expect(classicOgV17E.crewRoster).toEqual(classicOgV17D.crewRoster);
    expect(rulesets[classicOgV17E.meta.id]).toBe(classicOgV17E);
    expect(hideoutV2For(classicOgV17E)).toBe(hideoutV2For(classicOgV17D));
  });

  it('carries the 1.8.0-E crew rules and hideout into the 1.8.0-F cookhouse ladder unchanged', () => {
    expect(classicOgV18F.crewRoster).toBe(classicOgV18E.crewRoster);
    expect(hideoutV2For(classicOgV18F)).toBe(hideoutV2For(classicOgV18E));
  });

  it('carries crew and hideout configuration into the 1.8.0-G event ruleset', () => {
    expect(classicOgV18G.crewRoster).toBe(classicOgV18E.crewRoster);
    expect(hideoutV2For(classicOgV18G)).toBe(hideoutV2For(classicOgV18E));
  });
});
