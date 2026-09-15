import type { RoundDto } from './api.js';

/** 0.3.0-B. Lifecycle moves an admin can make on a round in its current status. */
export type AdminRoundAction = 'open-registration' | 'start' | 'end-early' | 'archive';

export interface AdminRoundDto extends RoundDto {
  createdAt: string;
  actions: AdminRoundAction[];
}

export interface AdminRulesetOptionDto {
  id: string;
  version: string;
  name: string;
}

export interface AdminRoundsDto {
  now: string;
  rounds: AdminRoundDto[];
  /** Newest first. */
  rulesets: AdminRulesetOptionDto[];
}

export interface AdminRoundResultDto {
  round: AdminRoundDto;
}

export interface AdminScheduleRoundInput {
  name: string;
  slug?: string;
  rulesetId: string;
  startsAt: string;
  /** Defaults to the ruleset's season length after startsAt. */
  endsAt?: string;
  registrationOpensAt?: string | null;
}

export interface AdminAuditEntryDto {
  id: string;
  actorAccountId: string | null;
  actorUsername: string;
  action: string;
  targetType: string;
  targetId: string | null;
  reason: string | null;
  before: unknown;
  after: unknown;
  createdAt: string;
}

export interface AdminAuditLogDto {
  entries: AdminAuditEntryDto[];
}
