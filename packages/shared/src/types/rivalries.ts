export const RIVALRY_STATUSES = ['ACTIVE', 'MUTUAL', 'ONE_SIDED', 'SUPPRESSED', 'CEASEFIRE', 'TIMEOUT', 'DEFEATED', 'CLOSED'] as const;
export type RivalryStatus = typeof RIVALRY_STATUSES[number];
export const RIVALRY_VISIBILITIES = ['PARTICIPANT', 'INVOLVED_ONLY', 'PUBLIC', 'SUPPRESSED'] as const;
export type RivalryVisibility = typeof RIVALRY_VISIBILITIES[number];

export interface RivalryHistoryItem {
  readonly id: string;
  readonly sourceKind: string;
  readonly outcome: string;
  readonly settledAt: string;
  readonly visibility: RivalryVisibility;
  readonly scoreDelta: number;
}

export interface RivalryHistoryDto {
  readonly relationshipId: string;
  readonly roundId: string;
  readonly status: RivalryStatus;
  readonly mutuality: 'MUTUAL' | 'ONE_SIDED' | 'SUPPRESSED';
  readonly score: number;
  readonly history: readonly RivalryHistoryItem[];
}

export interface RivalryFeudContractDto {
  readonly id: string;
  readonly relationshipId: string;
  readonly proposerId: string;
  readonly targetId: string;
  readonly status: 'PROPOSED' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED' | 'SETTLED';
  readonly objective: string;
  readonly expiresAt: string;
}

export interface RivalryPublicCardDto {
  readonly relationshipId: string;
  readonly headline: string;
  readonly outcome: string;
  readonly happenedAt: string;
}

export interface RivalryModerationExplanationDto {
  readonly relationshipId: string;
  readonly eligible: boolean;
  readonly reason: string;
  readonly suppressed: boolean;
}
