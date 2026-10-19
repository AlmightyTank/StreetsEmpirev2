export type AdvisorEvaluationEvent = 'shown' | 'clicked' | 'dismissed' | 'silenced' | 'completed';

export interface AdvisorEvaluationInput {
  event: AdvisorEvaluationEvent;
  ruleId: string;
  suggestionKey: string;
  slot: number;
  focus: string;
  rulesetVersion: string;
  sourceFingerprint?: string;
  outcome?: string;
}
