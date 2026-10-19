/** Owner-only facts exposed to the deterministic Empire Advisor. */
export interface AdvisorSignalSnapshot {
  cashCents: number;
  turns: number;
  turnCap: number;
  crewSize: number;
  heat: number | null;
  heatMax: number | null;
  products: Array<{ key: string; quantity: number }> | null;
  holdingsAvailable: boolean;
  quest: {
    key: string;
    status: 'ACTIVE' | 'READY_TO_TURN_IN';
    progressLabel?: string;
  } | null;
  paused: boolean;
  rules: {
    heat: boolean;
    holdings: boolean;
    quests: boolean;
  };
}

export type AdvisorFocus = 'balanced' | 'money' | 'territory' | 'crew' | 'quests';
export type AdvisorCardKind = 'urgent' | 'growth' | 'info';

export interface AdvisorSuggestionDto {
  key: string;
  ruleId: string;
  kind: AdvisorCardKind;
  title: string;
  reason: string;
  href: string | null;
  actionable: boolean;
  sourceId: string | null;
}

export interface AdvisorDto {
  suggestions: AdvisorSuggestionDto[];
  focus: AdvisorFocus;
  generatedAt: string;
}
