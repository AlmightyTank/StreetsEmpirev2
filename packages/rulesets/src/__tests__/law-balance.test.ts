import { describe, expect, it } from 'vitest';
import { classicOgV13F } from '../classic-og-v1.3-f/index.js';
import { classicOgV13G } from '../classic-og-v1.3-g/index.js';

describe('1.3.0-G pinned law numbers', () => {
  it('changes only the law block on top of F', () => {
    expect(classicOgV13G.meta).toEqual({ id: 'classic-og-v1.3-g', version: '1.3.0-G', name: 'Classic OG - Law Balance & Release' });
    expect({ ...classicOgV13G, meta: null, law: null }).toEqual({ ...classicOgV13F, meta: null, law: null });
  });

  it('keeps the ladder, the systems and the city pace, and pins the volumes qa:law tuned', () => {
    const { law } = classicOgV13G;
    const before = classicOgV13F.law;
    expect(law.stages).toBe(before.stages);
    expect(law.lawyer).toBe(before.lawyer);
    expect(law.officials).toBe(before.officials);
    expect(law.informants).toBe(before.informants);
    expect(law.cities).toBe(before.cities);
    expect({ ...law.warrants, caseAfterServed: null }).toEqual({ ...before.warrants, caseAfterServed: null });
    expect(law.heatToCase).toBe(0.005);
    expect(law.cooling).toEqual({ quietHours: 6, decayPerHour: 0.5 });
    expect(law.currencyReport).toEqual({ thresholdCents: 100_000_000, points: 2 });
    expect(law.warrants.caseAfterServed).toBe(20);
  });

  it('keeps a served warrant below a lawyered one, and both inside the ladder', () => {
    const { law } = classicOgV13G;
    expect(law.warrants.caseAfterServed).toBeLessThan(law.warrants.caseAfterAnswered);
    expect(law.warrants.caseAfterAnswered).toBeLessThan(law.stages.warrant);
    expect(law.warrants.caseAfterServed).toBeGreaterThanOrEqual(law.stages.noticed);
  });
});
