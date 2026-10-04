import { describe, expect, it } from 'vitest';
import { classicOgV12F, classicOgV13A, classicOgV13B, classicOgV13C, classicOgV13D } from '@streets/rulesets';
import { airportCheckChance, rollAirport, tripRules } from '../index.js';
import { addCase, captainHeadsUp, crossesIaLine, daSlowed, lawPriceCents, caseCap, chooseWarrantTarget, evidenceTarget, lawyerUpCents, lossCapShare, policeLossRoom, retainerCents, caseFromHeat, caseFromPoints, coolCase, coolingStartsAt, currencyReports, launderedCase, lawDay, nextStage, stageRank, wantedStage, WANTED_STAGES } from '../calculations/law.js';

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

describe('1.3.0-C warrants and lawyers', () => {
  const c = classicOgV13C.law;

  it('adds only warrants and lawyers to 1.3.0-B', () => {
    const { warrants, lawyer, ...rest } = c;
    expect(rest).toEqual(classicOgV13B.law);
    expect(warrants).toMatchObject({ warningHours: 12, caseAfterServed: 30, caseAfterAnswered: 45, dailyLossCapNetWorthShare: 0.15 });
    expect(lawyer.lawyerUp).toEqual({ multiplier: 1.25, minCents: 1_000_000 });
    expect(classicOgV13C.heat).toBe(classicOgV13B.heat);
  });

  it('points each kind of evidence at a target', () => {
    expect(evidenceTarget('SCOUT')).toBe('HIDEOUT');
    expect(evidenceTarget('ARREST')).toBe('HIDEOUT');
    expect(evidenceTarget('RACKETS')).toBe('BUSINESS');
    expect(evidenceTarget('TORCH')).toBe('BUSINESS');
    expect(evidenceTarget('CURRENCY_REPORT')).toBe('PERSONAL');
    expect(evidenceTarget('ROAD_STOP')).toBe('PERSONAL');
    expect(evidenceTarget('COOLING')).toBeNull();
  });

  it('names the heaviest reachable target, and can always name the boss', () => {
    const all = { hideout: true, business: true };
    expect(chooseWarrantTarget({ HIDEOUT: 10, BUSINESS: 30, PERSONAL: 5 }, all)).toBe('BUSINESS');
    expect(chooseWarrantTarget({ HIDEOUT: 10, BUSINESS: 30, PERSONAL: 5 }, { hideout: true, business: false })).toBe('HIDEOUT');
    expect(chooseWarrantTarget({ HIDEOUT: 10, BUSINESS: 30, PERSONAL: 5 }, { hideout: false, business: false })).toBe('PERSONAL');
    expect(chooseWarrantTarget({ HIDEOUT: 7, BUSINESS: 7, PERSONAL: 7 }, all)).toBe('HIDEOUT');
    expect(chooseWarrantTarget({ HIDEOUT: 0, BUSINESS: 0, PERSONAL: 9 }, all)).toBe('PERSONAL');
  });

  it('caps a day of police losses at 15% of net worth', () => {
    expect(policeLossRoom(100_000_000n, 0n, c.warrants)).toBe(15_000_000n);
    expect(policeLossRoom(100_000_000n, 10_000_000n, c.warrants)).toBe(5_000_000n);
    expect(policeLossRoom(100_000_000n, 20_000_000n, c.warrants)).toBe(0n);
    expect(lossCapShare(4_000_000n, 5_000_000n)).toBe(1);
    expect(lossCapShare(10_000_000n, 5_000_000n)).toBe(0.5);
    expect(lossCapShare(10_000_000n, 0n)).toBe(0);
    expect(lossCapShare(0n, 0n)).toBe(1);
  });

  it('prices lawyers off net worth and off what the warrant would take', () => {
    expect(retainerCents(100_000_000n, c.lawyer)).toBe(2_500_000n);
    expect(retainerCents(1_000_000_000n, c.lawyer)).toBe(10_000_000n);
    expect(lawyerUpCents(4_000_000n, c.lawyer)).toBe(5_000_000n);
    expect(lawyerUpCents(0n, c.lawyer)).toBe(1_000_000n);
  });
});

describe('1.3.0-D officials and informants', () => {
  const d = classicOgV13D.law;

  it('adds only officials and informants to 1.3.0-C', () => {
    const { officials, informants, ...rest } = d;
    expect(rest).toEqual(classicOgV13C.law);
    expect(Object.keys(officials.roles)).toEqual(['CAPTAIN', 'DA', 'JUDGE', 'CUSTOMS']);
    expect(officials.exposure).toMatchObject({ line: 60, iaWarningHours: 24, stingPoints: 25 });
    expect(informants.sweep.minCents).toBeGreaterThan(0);
    expect(classicOgV13D.heat).toBe(classicOgV13C.heat);
  });

  it('prices a week of an official like a bribe', () => {
    expect(lawPriceCents(100_000_000n, d.officials.roles.DA)).toBe(4_000_000n);
    expect(lawPriceCents(1_000_000_000n, d.officials.roles.DA)).toBe(8_000_000n);
  });

  it('opens an Internal Affairs file once, on the favor that crosses the line', () => {
    expect(crossesIaLine(50, 5, d.officials)).toBe(false);
    expect(crossesIaLine(55, 5, d.officials)).toBe(true);
    expect(crossesIaLine(60, 5, d.officials)).toBe(false);
    expect(crossesIaLine(59, 0, d.officials)).toBe(false);
  });

  it('slows a rise by the DA’s share and never a fall', () => {
    expect(daSlowed(800, 0.25)).toBe(200);
    expect(daSlowed(-800, 0.25)).toBe(0);
  });

  it('lets Customs halve an airport check, and nothing else', () => {
    const airport = tripRules(classicOgV13D)!.airport!;
    const chance = airportCheckChance(airport, 95);
    expect(chance).toBeGreaterThan(0);
    const rng = () => chance * 0.75;
    expect(rollAirport(airport, { heat: 95, bankrollCents: 1_000_000n, rng }).pulled).toBe(true);
    expect(rollAirport(airport, { heat: 95, bankrollCents: 1_000_000n, rng, chanceMultiplier: 1 - d.officials.roles.CUSTOMS.checkCut }).pulled).toBe(false);
  });

  it('has the Captain warn a few points short of the Warrant line', () => {
    expect(captainHeadsUp(5_000, 6_100, 5, d)).toBe(true);
    expect(captainHeadsUp(6_000, 6_200, 5, d)).toBe(false);
    expect(captainHeadsUp(5_000, 6_600, 5, d)).toBe(false);
    expect(captainHeadsUp(5_000, 6_100, 5, classicOgV13B.law)).toBe(false);
  });
});
