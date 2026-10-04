import type { LawAttentionSource, LawCityRules, LawLawyerRules, LawOfficialPrice, LawOfficialRules, LawRules, LawWarrantRules, WantedStage } from '@streets/rulesets';

export interface LawPressureState {
  readonly attention: number;
  readonly evidence: number;
}

export interface LawPressureChange {
  readonly attentionBefore: number;
  readonly attentionAfter: number;
  readonly attentionAdded: number;
  readonly evidenceBefore: number;
  readonly evidenceAfter: number;
  readonly evidenceAdded: number;
  readonly wantedLevel: number;
  readonly wantedName: string;
  readonly warrantRisk: boolean;
  readonly informantRisk: boolean;
}

export function lawWantedTier(rules: LawRules, attention: number) {
  const tiers = [...rules.wantedTiers].sort((a, b) => a.startsAt - b.startsAt);
  return tiers.reduce((current, tier) => attention >= tier.startsAt ? tier : current, tiers[0]!);
}

export function addLawPressure(
  rules: LawRules,
  state: LawPressureState,
  source: LawAttentionSource,
  heatOrEventUnits: number,
): LawPressureChange {
  const sourceRule = rules.sources[source];
  const attentionAdded = Math.min(
    sourceRule.maxAttentionPerEvent,
    Math.max(0, Math.round(heatOrEventUnits * sourceRule.attentionPerUnit)),
  );
  const evidenceAdded = Math.max(0, Math.round(attentionAdded * sourceRule.evidenceShare));
  const attentionAfter = Math.min(rules.maxAttention, state.attention + attentionAdded);
  const evidenceAfter = Math.min(rules.investigation.maxEvidence, state.evidence + evidenceAdded);
  const tier = lawWantedTier(rules, attentionAfter);

  return {
    attentionBefore: state.attention,
    attentionAfter,
    attentionAdded: attentionAfter - state.attention,
    evidenceBefore: state.evidence,
    evidenceAfter,
    evidenceAdded: evidenceAfter - state.evidence,
    wantedLevel: tier.level,
    wantedName: tier.name,
    warrantRisk: evidenceAfter >= rules.investigation.warrantStartsAt,
    informantRisk: evidenceAfter >= rules.investigation.informantStartsAt,
  };
}

export function decayLawPressure(state: LawPressureState, intervals: number, rules: LawRules): LawPressureState {
  const cooled = Math.max(0, Math.floor(intervals) * rules.decayPerTurnInterval);
  return { ...state, attention: Math.max(0, state.attention - cooled) };
}

export function corruptionCostCents(attention: number, netWorthCents: bigint | number, rules: LawRules): bigint {
  const wanted = Math.max(0, Math.min(Math.floor(attention), rules.corruption.dailyAttentionCap));
  const worth = typeof netWorthCents === 'bigint' ? netWorthCents : BigInt(Math.max(0, Math.floor(netWorthCents)));
  const positiveWorth = worth > 0n ? worth : 0n;
  const shareNumerator = positiveWorth * BigInt(rules.corruption.netWorthSharePpmPerAttention);
  const worthFloor = (shareNumerator + 999_999n) / 1_000_000n;
  const perPoint = worthFloor > BigInt(rules.corruption.minCentsPerAttention)
    ? worthFloor
    : BigInt(rules.corruption.minCentsPerAttention);
  return perPoint * BigInt(wanted);
}

export const CASE_SCALE = 100;
export const WANTED_STAGES: readonly WantedStage[] = ['QUIET', 'NOTICED', 'INVESTIGATION', 'WARRANT', 'FEDERAL'];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function caseCap(rules: LawRules): number {
  return rules.caseMax * CASE_SCALE;
}

export function caseFromHeat(heat: number, rules: LawRules): number {
  if (!Number.isFinite(heat) || heat <= 0) return 0;
  return Math.round(heat * rules.heatToCase * CASE_SCALE);
}

export function addCase(caseHundredths: number, delta: number, rules: LawRules): number {
  return clamp(Math.round(caseHundredths + delta), 0, caseCap(rules));
}

export function stageStartsAt(stage: WantedStage, rules: LawRules): number {
  switch (stage) {
    case 'QUIET': return 0;
    case 'NOTICED': return rules.stages.noticed * CASE_SCALE;
    case 'INVESTIGATION': return rules.stages.investigation * CASE_SCALE;
    case 'WARRANT': return rules.stages.warrant * CASE_SCALE;
    case 'FEDERAL': return rules.stages.federal * CASE_SCALE;
  }
}

export function wantedStage(caseHundredths: number, rules: LawRules): WantedStage {
  let stage: WantedStage = 'QUIET';
  for (const candidate of WANTED_STAGES) {
    if (caseHundredths >= stageStartsAt(candidate, rules)) stage = candidate;
  }
  return stage;
}

export function stageRank(stage: WantedStage): number {
  return WANTED_STAGES.indexOf(stage);
}

export function nextStage(caseHundredths: number, rules: LawRules): { stage: WantedStage; startsAt: number } | null {
  const next = WANTED_STAGES[stageRank(wantedStage(caseHundredths, rules)) + 1];
  return next ? { stage: next, startsAt: stageStartsAt(next, rules) } : null;
}

const HOUR_MS = 3_600_000;

export function caseFromPoints(points: number): number {
  if (!Number.isFinite(points)) return 0;
  return Math.round(points * CASE_SCALE);
}

export interface CaseClock {
  caseHundredths: number;
  caseAt: Date;
  lastEvidenceAt: Date | null;
}

export function coolingStartsAt(clock: CaseClock, rules: LawRules): Date | null {
  if (!rules.cooling) return null;
  const quietEnds = clock.lastEvidenceAt ? clock.lastEvidenceAt.getTime() + rules.cooling.quietHours * HOUR_MS : -Infinity;
  return new Date(Math.max(clock.caseAt.getTime(), quietEnds));
}

export function coolCase(clock: CaseClock, now: Date, rules: LawRules, coolingSpeed = 1): number {
  const starts = coolingStartsAt(clock, rules);
  if (!starts || !rules.cooling || clock.caseHundredths <= 0) return Math.max(0, clock.caseHundredths);
  const hours = Math.max(0, now.getTime() - starts.getTime()) / HOUR_MS;
  const cooled = Math.floor(hours * rules.cooling.decayPerHour * coolingSpeed * CASE_SCALE);
  return Math.max(0, clock.caseHundredths - cooled);
}

export function lawDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export function currencyReports(dayCents: bigint, movedCents: bigint, rules: LawRules): number {
  const report = rules.currencyReport;
  if (!report || movedCents <= 0n || report.thresholdCents <= 0) return 0;
  const threshold = BigInt(report.thresholdCents);
  const before = dayCents > 0n ? dayCents : 0n;
  return Number((before + movedCents) / threshold - before / threshold);
}

export function launderedCase(heat: number, usedTodayHundredths: number, rules: LawRules): number {
  const wash = rules.laundering;
  if (!wash || !Number.isFinite(heat) || heat <= 0) return 0;
  const room = Math.max(0, wash.dailyCaseCap * CASE_SCALE - Math.max(0, usedTodayHundredths));
  return Math.min(room, Math.floor(heat * wash.casePerHeat * CASE_SCALE));
}

export type WarrantTarget = 'HIDEOUT' | 'BUSINESS' | 'PERSONAL';

const TARGET_ORDER: readonly WarrantTarget[] = ['HIDEOUT', 'BUSINESS', 'PERSONAL'];

export function evidenceTarget(source: string): WarrantTarget | null {
  switch (source) {
    case 'SCOUT': case 'PRODUCE': case 'BUST': case 'ARREST': case 'COMBAT': case 'CONVOY':
      return 'HIDEOUT';
    case 'RACKETS': case 'TORCH': case 'SACK': case 'CRACKDOWN':
      return 'BUSINESS';
    case 'RUN_SALE': case 'ROAD_STOP': case 'HIJACK': case 'CURRENCY_REPORT':
      return 'PERSONAL';
    default:
      return null;
  }
}

export function chooseWarrantTarget(weights: Readonly<Record<WarrantTarget, number>>, reachable: { hideout: boolean; business: boolean }): WarrantTarget {
  const ranked = [...TARGET_ORDER].sort((a, b) => weights[b] - weights[a] || TARGET_ORDER.indexOf(a) - TARGET_ORDER.indexOf(b));
  for (const target of ranked) {
    if (target === 'PERSONAL') return target;
    if (target === 'HIDEOUT' && reachable.hideout) return target;
    if (target === 'BUSINESS' && reachable.business) return target;
  }
  return 'PERSONAL';
}

function shareOf(cents: bigint, share: number): bigint {
  if (cents <= 0n || share <= 0) return 0n;
  return BigInt(Math.floor(Number(cents) * share));
}

export function policeLossRoom(netWorthCents: bigint, lostTodayCents: bigint, rules: LawWarrantRules): bigint {
  const room = shareOf(netWorthCents, rules.dailyLossCapNetWorthShare) - (lostTodayCents > 0n ? lostTodayCents : 0n);
  return room > 0n ? room : 0n;
}

export function lossCapShare(lossCents: bigint, roomCents: bigint): number {
  if (lossCents <= 0n || roomCents >= lossCents) return 1;
  if (roomCents <= 0n) return 0;
  return Number(roomCents) / Number(lossCents);
}

export function retainerCents(netWorthCents: bigint, rules: LawLawyerRules): bigint {
  const share = shareOf(netWorthCents, rules.retainer.netWorthShare);
  const floor = BigInt(rules.retainer.minCents);
  return share > floor ? share : floor;
}

export function lawyerUpCents(estimateCents: bigint, rules: LawLawyerRules): bigint {
  const fee = BigInt(Math.ceil(Number(estimateCents > 0n ? estimateCents : 0n) * rules.lawyerUp.multiplier));
  const floor = BigInt(rules.lawyerUp.minCents);
  return fee > floor ? fee : floor;
}

export function lawPriceCents(netWorthCents: bigint, price: LawOfficialPrice): bigint {
  const share = shareOf(netWorthCents, price.netWorthShare);
  const floor = BigInt(price.minCents);
  return share > floor ? share : floor;
}

export function crossesIaLine(before: number, added: number, rules: LawOfficialRules): boolean {
  return added > 0 && before < rules.exposure.line && before + added >= rules.exposure.line;
}

export function daSlowed(delta: number, slowShare: number): number {
  return delta > 0 ? Math.floor(delta * slowShare) : 0;
}

export function captainHeadsUp(before: number, after: number, headsUpPoints: number, rules: LawRules): boolean {
  if (!rules.warrants) return false;
  const warrantAt = stageStartsAt('WARRANT', rules);
  const warnAt = warrantAt - headsUpPoints * CASE_SCALE;
  return before < warnAt && after >= warnAt && after < warrantAt;
}

const PLAIN_CITY: LawCityRules = { blurb: '', caseSpeed: 1, coolingSpeed: 1, warningHoursMultiplier: 1 };

export function cityLaw(rules: LawRules, slug: string | undefined): LawCityRules {
  return (slug && rules.cities?.[slug]) || PLAIN_CITY;
}

export function cityCaseDelta(delta: number, city: LawCityRules): number {
  return delta > 0 ? Math.round(delta * city.caseSpeed) : delta;
}

export function warrantWindowHours(rules: LawRules, city: LawCityRules, caseHundredths: number, extraHours = 0): number {
  const base = rules.warrants?.warningHours ?? 0;
  const federal = rules.federal && wantedStage(caseHundredths, rules) === 'FEDERAL' ? rules.federal.warningHoursMultiplier : 1;
  return base * city.warningHoursMultiplier * federal + extraHours;
}

export function federalTransfer(leaving: number, arriving: number, rules: LawRules): { arriving: number; leaving: number } | null {
  if (!rules.federal || wantedStage(leaving, rules) !== 'FEDERAL') return null;
  return {
    arriving: Math.max(arriving, leaving),
    leaving: Math.min(leaving, rules.federal.transfer.oldCityCase * CASE_SCALE),
  };
}
