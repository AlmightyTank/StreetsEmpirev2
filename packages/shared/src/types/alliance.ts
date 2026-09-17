/** 0.3.0-C alliances. Every id a player sees is a tag or a public pimp id, never a row id. */

export interface AllianceTagDto {
  name: string;
  tag: string;
}

export interface AllianceRulesDto {
  maxMembers: number;
  leaveCooldownHours: number;
  inviteExpiresHours: number;
  maxPendingInvites: number;
}

export interface AllianceMemberDto {
  publicPimpId: number;
  displayName: string;
  netWorthCents: number;
  nationalRank: number;
  isLeader: boolean;
  isYou: boolean;
  joinedAt: string;
}

export type AllianceEventType = 'FOUNDED' | 'INVITED' | 'JOINED' | 'LEFT' | 'KICKED' | 'LEADER' | 'RENAMED' | 'DISBANDED';

export interface AllianceEventDto {
  type: AllianceEventType;
  actorName: string | null;
  subjectName: string | null;
  detail: string | null;
  createdAt: string;
}

export interface AllianceOutgoingInviteDto {
  publicPimpId: number;
  displayName: string;
  invitedByName: string;
  expiresAt: string;
}

/** Public alliance page. Members and totals only; nothing a rival could not read off the rankings. */
export interface AllianceDetailDto extends AllianceTagDto {
  rank: number;
  combinedNetWorthCents: number;
  memberCount: number;
  maxMembers: number;
  leader: { publicPimpId: number; displayName: string } | null;
  members: AllianceMemberDto[];
  foundedAt: string;
  isYours: boolean;
  /** 0.3.0-C recruitment thread on the forum, once the leader has posted one. */
  forumUrl: string | null;
}

export interface AllianceIncomingInviteDto extends AllianceTagDto {
  invitedByName: string;
  memberCount: number;
  expiresAt: string;
}

/** GET /api/game/alliance - your own alliance screen. */
export interface MyAllianceDto {
  enabled: boolean;
  rules: AllianceRulesDto | null;
  alliance: AllianceDetailDto | null;
  isLeader: boolean;
  /** Leader only. */
  outgoingInvites: AllianceOutgoingInviteDto[];
  /** Your own alliance's history, newest first. */
  events: AllianceEventDto[];
  incomingInvites: AllianceIncomingInviteDto[];
  /** Set while you cannot join or found an alliance. */
  cooldownUntil: string | null;
  formerAlliance: AllianceTagDto | null;
  roundOpen: boolean;
  /** Forum recruitment: whether this server posts threads, and the last failure (leader only). */
  forum: { enabled: boolean; error: string | null };
}

export interface AllianceRankingEntryDto extends AllianceTagDto {
  rank: number;
  combinedNetWorthCents: number;
  memberCount: number;
  isYours: boolean;
}

export interface AllianceRankingsDto {
  enabled: boolean;
  alliances: AllianceRankingEntryDto[];
}

export interface AdminAllianceDto extends AllianceTagDto {
  id: string;
  memberCount: number;
  combinedNetWorthCents: number;
  leader: { publicPimpId: number; displayName: string; roundPlayerId: string } | null;
  createdAt: string;
  disbandedAt: string | null;
  disbandReason: string | null;
  forumUrl: string | null;
}

export interface AdminAlliancesDto {
  roundId: string;
  enabled: boolean;
  alliances: AdminAllianceDto[];
}
