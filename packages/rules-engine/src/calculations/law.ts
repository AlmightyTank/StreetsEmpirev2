import type { LawAttentionSource, LawRules } from '@streets/rulesets';

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
