import { describe, expect, it } from 'vitest';
import { classicOgV13F } from '@streets/rulesets';
import { addLawPressure, corruptionCostCents, decayLawPressure, lawWantedTier } from '../calculations/law.js';

const law = classicOgV13F.law!;

describe('1.3.0-F law pressure', () => {
  it('maps attention into pinned wanted tiers', () => {
    expect(lawWantedTier(law, 0).name).toBe('Quiet');
    expect(lawWantedTier(law, 20).name).toBe('Known');
    expect(lawWantedTier(law, 40).name).toBe('Watched');
    expect(lawWantedTier(law, 65).name).toBe('Wanted');
    expect(lawWantedTier(law, 85).name).toBe('Most Wanted');
  });

  it('adds source-specific attention and evidence without exceeding caps', () => {
    const result = addLawPressure(law, { attention: 92, evidence: 94 }, 'CONVOY_HIJACK', 100);

    expect(result).toMatchObject({
      attentionBefore: 92,
      attentionAfter: 100,
      attentionAdded: 8,
      evidenceBefore: 94,
      evidenceAfter: 100,
      evidenceAdded: 6,
      wantedLevel: 4,
      wantedName: 'Most Wanted',
      warrantRisk: true,
      informantRisk: true,
    });
  });

  it('cools attention on the turn clock without erasing evidence', () => {
    expect(decayLawPressure({ attention: 42, evidence: 30 }, 7, law)).toEqual({ attention: 35, evidence: 30 });
    expect(decayLawPressure({ attention: 3, evidence: 30 }, 7, law)).toEqual({ attention: 0, evidence: 30 });
  });

  it('prices corruption by net worth and caps daily attention cleared', () => {
    expect(corruptionCostCents(4, 10_000_000n, law)).toBe(200_000n);
    expect(corruptionCostCents(25, 1_000_000_000n, law)).toBe(5_000_000n);
  });
});
