import { describe, expect, it } from 'vitest';
import { classicOgV12F, classicOgV13A, classicOgV13B } from '@streets/rulesets';
import { addCase, caseCap, caseFromHeat, caseFromPoints, coolCase, coolingStartsAt, currencyReports, launderedCase, lawDay, nextStage, stageRank, wantedStage, WANTED_STAGES } from '../calculations/law.js';

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

describe('1.3.0-B evidence, cooling and reports', () => {
  const b = classicOgV13B.law;
  const hour = 3_600_000;
  const at = new Date('2026-10-04T00:00:00Z');

  it('adds only evidence, reports, cooling and laundering to 1.3.0-A', () => {
    const { evidence, currencyReport, cooling, laundering, ...rest } = b;
    expect(rest).toEqual(classicOgV13A.law);
    expect(evidence).toEqual({ bust: 8, arrest: 15, roadStop: 4, torch: 6, sack: 6, hijack: 5 });
    expect(currencyReport).toEqual({ thresholdCents: 25_000_000, points: 4 });
    expect(cooling).toEqual({ quietHours: 24, decayPerHour: 0.5 });
    expect(laundering).toEqual({ casePerHeat: 0.1, dailyCaseCap: 8 });
    expect(classicOgV13B.heat).toBe(classicOgV13A.heat);
  });

  it('turns points into hundredths', () => {
    expect(caseFromPoints(8)).toBe(800);
    expect(caseFromPoints(-2.5)).toBe(-250);
    expect(caseFromPoints(Number.NaN)).toBe(0);
  });

  it('cools only after a quiet day, a point every two hours, never below zero', () => {
    const clock = { caseHundredths: 3_000, caseAt: at, lastEvidenceAt: at };
    expect(coolingStartsAt(clock, b)).toEqual(new Date(at.getTime() + 24 * hour));
    expect(coolCase(clock, new Date(at.getTime() + 24 * hour), b)).toBe(3_000);
    expect(coolCase(clock, new Date(at.getTime() + 26 * hour), b)).toBe(2_900);
    expect(coolCase(clock, new Date(at.getTime() + 34 * hour), b)).toBe(2_500);
    expect(coolCase(clock, new Date(at.getTime() + 500 * hour), b)).toBe(0);
  });

  it('cools from when the Case was last written, once the quiet day is behind it', () => {
    const written = new Date(at.getTime() + 30 * hour);
    const clock = { caseHundredths: 2_000, caseAt: written, lastEvidenceAt: at };
    expect(coolCase(clock, new Date(written.getTime() + 2 * hour), b)).toBe(1_900);
    // Only racket Heat or the sweep since: nothing restarted the quiet clock.
    expect(coolCase({ caseHundredths: 500, caseAt: at, lastEvidenceAt: null }, new Date(at.getTime() + 4 * hour), b)).toBe(300);
  });

  it('never cools without cooling rules', () => {
    const clock = { caseHundredths: 3_000, caseAt: at, lastEvidenceAt: at };
    expect(coolingStartsAt(clock, law)).toBeNull();
    expect(coolCase(clock, new Date(at.getTime() + 500 * hour), law)).toBe(3_000);
  });

  it('files a report for each $250,000 a city sees in a day, however it is split', () => {
    expect(currencyReports(0n, 24_999_999n, b)).toBe(0);
    expect(currencyReports(0n, 25_000_000n, b)).toBe(1);
    expect(currencyReports(24_000_000n, 2_000_000n, b)).toBe(1);
    expect(currencyReports(0n, 100_000_000n, b)).toBe(4);
    let day = 0n;
    let reports = 0;
    for (let i = 0; i < 20; i++) {
      reports += currencyReports(day, 5_000_000n, b);
      day += 5_000_000n;
    }
    expect(reports).toBe(4);
    expect(currencyReports(0n, 100_000_000n, law)).toBe(0);
    expect(lawDay(new Date('2026-10-04T23:59:59Z'))).toBe('2026-10-04');
  });

  it('washes a tenth of laundering capacity, up to the daily cap', () => {
    expect(launderedCase(4, 0, b)).toBe(40);
    expect(launderedCase(4, 790, b)).toBe(10);
    expect(launderedCase(4, 800, b)).toBe(0);
    expect(launderedCase(0, 0, b)).toBe(0);
    expect(launderedCase(4, 0, law)).toBe(0);
  });
});
