import { describe, expect, it } from 'vitest';
import { classicOgV12F, classicOgV13A } from '@streets/rulesets';
import { addCase, caseCap, caseFromHeat, nextStage, stageRank, wantedStage, WANTED_STAGES } from '../calculations/law.js';

const law = classicOgV13A.law;

describe('1.3.0-A Case foundation ruleset', () => {
  it('adds only the law block to 1.2.0-F', () => {
    const { meta, law: added, ...rest } = classicOgV13A;
    const { meta: _meta, ...base } = classicOgV12F;
    expect(meta).toEqual({ id: 'classic-og-v1.3-a', version: '1.3.0-A', name: 'Classic OG - Case Foundation' });
    expect(added).toEqual({ caseMax: 100, stages: { noticed: 20, investigation: 40, warrant: 65, federal: 85 }, heatToCase: 0.1 });
    expect(rest).toEqual(base);
    expect(classicOgV13A.heat).toBe(classicOgV12F.heat);
  });

  it('leaves every older ruleset without a Case', () => {
    expect((classicOgV12F as { law?: unknown }).law).toBeUndefined();
  });
});

describe('Case math', () => {
  it('turns a tenth of drawn Heat into Case, in hundredths', () => {
    expect(caseFromHeat(10, law)).toBe(100);
    expect(caseFromHeat(3, law)).toBe(30);
    expect(caseFromHeat(2.5, law)).toBe(25);
    expect(caseFromHeat(0, law)).toBe(0);
    expect(caseFromHeat(-4, law)).toBe(0);
    expect(caseFromHeat(Number.NaN, law)).toBe(0);
  });

  it('holds a Case between zero and the cap', () => {
    expect(caseCap(law)).toBe(10_000);
    expect(addCase(9_950, 100, law)).toBe(10_000);
    expect(addCase(50, -100, law)).toBe(0);
    expect(addCase(1_234, 66, law)).toBe(1_300);
  });

  it('reads each stage from its threshold, with no roll', () => {
    expect(wantedStage(0, law)).toBe('QUIET');
    expect(wantedStage(1_999, law)).toBe('QUIET');
    expect(wantedStage(2_000, law)).toBe('NOTICED');
    expect(wantedStage(3_999, law)).toBe('NOTICED');
    expect(wantedStage(4_000, law)).toBe('INVESTIGATION');
    expect(wantedStage(6_500, law)).toBe('WARRANT');
    expect(wantedStage(8_499, law)).toBe('WARRANT');
    expect(wantedStage(8_500, law)).toBe('FEDERAL');
    expect(wantedStage(10_000, law)).toBe('FEDERAL');
  });

  it('names the next stage up, and nothing past Federal', () => {
    expect(nextStage(0, law)).toEqual({ stage: 'NOTICED', startsAt: 2_000 });
    expect(nextStage(4_200, law)).toEqual({ stage: 'WARRANT', startsAt: 6_500 });
    expect(nextStage(9_000, law)).toBeNull();
    expect(WANTED_STAGES.map(stageRank)).toEqual([0, 1, 2, 3, 4]);
  });
});
