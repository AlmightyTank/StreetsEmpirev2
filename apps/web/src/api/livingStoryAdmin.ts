import { api } from './client.js';

export interface LivingStoryDraft {
  id: string; key: string; title: string; caseKey: string;
  baseRulesetId: string; baseRulesetVersion: string; eventKinds: string[];
  audience: 'ACTORS' | 'CITY_PLAYERS';
  visibility: 'OWNER_ONLY' | 'PUBLIC_SUMMARY';
  expiresAfterActiveMinutes: number; rewardBudgetCents: number;
  revision: number; enabled: false; createdAt: string; updatedAt: string;
}
export interface LivingStoryOverview {
  round: { id: string; status: string; paused: boolean; rulesetId: string; rulesetVersion: string };
  catalog: Array<{
    key: string; title: string; caseKey: string; sourceKind: string;
    audience: string; visibility: string; enabled: boolean; eventKinds: string[];
    expiresAfterActiveMinutes: number; rewardBudgetCents: number; weight: number;
  }>;
  limits: { maxPerOwnerRound: number; maxPerCityRound: number; maxPerRound: number;
    cooldownActiveMinutes: number; autoActorsPerEvent: number };
  recentSources: Array<{ id: string; kind: string; cityId: string; visibility: string; happenedAt: string }>;
  caseStats: { totalSampled: number; truncated: boolean; rewardCentsSampled: number; byStatus: Record<string, number> };
  drafts: LivingStoryDraft[];
}
export interface LivingStoryDiagnosis {
  eligible: boolean; reason: string; savedSource: true;
  counts: { owner: number; city: number; round: number; cooldown: number };
  limits: LivingStoryOverview['limits'];
  existingCase: { id: string; status: string } | null;
  source: { id: string; kind: string; visibility: string; happenedAt: string };
  expiresAtActive: string | null;
  ruleset: { id: string; version: string };
}
export type LivingStoryDraftInput = {
  roundId: string; key: string; title: string; caseKey: string; eventKinds: string[];
  audience: 'ACTORS' | 'CITY_PLAYERS';
  visibility: 'OWNER_ONLY' | 'PUBLIC_SUMMARY';
  expiresAfterActiveMinutes: number; rewardBudgetCents: number; reason: string;
  expectedRevision?: number;
};
export const livingStoryAdminApi = {
  overview: (roundId: string) =>
    api.get<LivingStoryOverview>(`/admin/living-stories?roundId=${encodeURIComponent(roundId)}`),
  diagnose: (input: { roundId: string; ownerId: string; memoryId: string; storyKey: string }) =>
    api.post<LivingStoryDiagnosis>('/admin/living-stories/diagnose', input),
  simulate: (input: { roundId: string; ownerId: string; storyKey: string;
    eventKind: string; publicSource: boolean; participant: boolean; reason: string }) =>
    api.post<{ dryRun: true; persisted: false; rewardGrantedCents: 0;
      contractEligible: boolean; reason: string; note: string }>('/admin/living-stories/simulate', input),
  saveDraft: (input: LivingStoryDraftInput) =>
    api.post<{ id: string; key: string; revision: number; enabled: false }>('/admin/living-stories/drafts', input),
};
