import { describe, expect, it } from 'vitest';
import { classicOgV14C2 } from '../classic-og-v1.4-c2/index.js';
import { classicOgV14D } from '../classic-og-v1.4-d/index.js';
import { FACTION_NUDGE_CAP_PERCENT, factionProblems } from '../faction-definitions.js';
import type { Ruleset } from '../types.js';

describe('1.4.0-D faction perks ruleset', () => {
  it('is 1.4.0-C2 plus a factionPerks block and nothing else', () => {
    expect(classicOgV14D.meta).toEqual({ id: 'classic-og-v1.4-d', version: '1.4.0-D', name: 'Classic OG - Faction Perks' });
    const { meta: _meta, factionPerks: _perks, ...rest } = classicOgV14D;
    const { meta: _baseMeta, ...base } = classicOgV14C2;
    expect(rest).toEqual(base);
    expect(factionProblems(classicOgV14D)).toEqual([]);
  });

  it('gives every first-release faction one small nudge, each of a different kind', () => {
    const nudges = Object.entries(classicOgV14D.factionPerks.nudges);
    expect(nudges.map(([key]) => key).sort()).toEqual(Object.keys(classicOgV14D.factions).sort());
    expect(new Set(nudges.map(([, nudge]) => nudge.kind)).size).toBe(nudges.length);
    for (const [, nudge] of nudges) expect(nudge.percent).toBeLessThanOrEqual(FACTION_NUDGE_CAP_PERCENT);
  });

  it('rejects nudges over the cap, shared kinds, unknown factions and bad warnings', () => {
    const bad = {
      ...classicOgV14D,
      factionPerks: {
        nudges: {
          KINGS: { kind: 'CORNER_UPKEEP', percent: 25 },
          OUTFIT: { kind: 'CORNER_UPKEEP', percent: 5 },
          NOPE: { kind: 'PIP_PRODUCT', percent: 5 },
        },
        warnings: { ...classicOgV14D.factionPerks.warnings, supplyLeadHours: 0, hotRoadChance: 1.5 },
      },
    } as unknown as Ruleset;
    const problems = factionProblems(bad);
    expect(problems).toContain(`KINGS's nudge must be a whole percent from 1 to ${FACTION_NUDGE_CAP_PERCENT}.`);
    expect(problems).toContain('Two factions share the CORNER_UPKEEP nudge.');
    expect(problems).toContain('Nudge names unknown faction NOPE.');
    expect(problems).toContain('Warning supplyLeadHours must be above 0 and at most 72.');
    expect(problems).toContain('A hot road must be a stop chance between 0 and 1.');
  });

  it('leaves 1.4.0-C2 and older without perks', () => {
    expect((classicOgV14C2 as Ruleset).factionPerks).toBeUndefined();
  });
});
