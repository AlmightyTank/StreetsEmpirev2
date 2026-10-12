import { describe, expect, it } from 'vitest';
import { classicOgV165E2 } from '../classic-og-v1.6.5-e2/index.js';
import { classicOgV165G } from '../classic-og-v1.6.5-g/index.js';
import { rulesets } from '../index.js';

describe('1.6.5-G loan shark release ruleset', () => {
  it('registers the release snapshot for the ruleset picker', () => {
    expect(classicOgV165G.meta).toEqual({
      id: 'classic-og-v1.6.5-g',
      version: '1.6.5-G',
      name: 'Classic OG - Loan Shark Release',
    });
    expect(rulesets[classicOgV165G.meta.id]).toBe(classicOgV165G);
  });

  it('preserves the prior gameplay rules without silently changing balance', () => {
    const { meta: _releaseMeta, ...releaseRules } = classicOgV165G;
    const { meta: _priorMeta, ...priorRules } = classicOgV165E2;
    expect(releaseRules).toEqual(priorRules);
    expect(classicOgV165G.loanShark?.collections).toEqual(classicOgV165E2.loanShark?.collections);
  });
});
