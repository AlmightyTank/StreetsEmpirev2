import type { ActivityDto } from './api.js';

export const MESSAGE_SUBJECT_MAX = 80;
export const MESSAGE_BODY_MAX = 2_000;
export const MESSAGE_REPORT_REASON_MAX = 500;
export const MESSAGE_PAGE_SIZE = 30;
export const CONSOLE_ACTIVITY_PAGE_SIZE = 50;

export type ConsoleFolder = 'inbox' | 'sent' | 'archived';
export type ConsoleActivityFilter = 'all' | 'combat' | 'turf' | 'travel' | 'market' | 'progress' | 'street' | 'system';

export interface DirectMessagePartyDto {
  publicPimpId: number;
  displayName: string;
}

export interface DirectMessageDto {
  id: string;
  direction: 'in' | 'out';
  counterpart: DirectMessagePartyDto;
  subject: string;
  body: string;
  createdAt: string;
  readAt: string | null;
  archived: boolean;
  reported: boolean;
  blocked: boolean;
  /** 0.9.0-H. The viewer muted this counterpart; never told to the other side. */
  muted: boolean;
}

/** 0.9.0-H. A moderator's messaging restriction on the viewer, if any. */
export interface CommsRestrictionDto {
  permanent: boolean;
  until: string | null;
}

export interface ConsoleCountsDto {
  inbox: number;
  unread: number;
  sent: number;
  archived: number;
  blocked: number;
  /** 0.9.0-H. Players this account muted. Optional for older servers. */
  muted?: number;
  notifications: number;
  activity: number;
  attacks: number;
}

export interface PimpConsoleDto {
  folder: ConsoleFolder;
  counts: ConsoleCountsDto;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  messages: DirectMessageDto[];
  /** 0.9.0-H. Present while a moderator has paused the viewer's messaging. */
  restriction?: CommsRestrictionDto | null;
}

export interface ConsoleActivityEntryDto {
  activity: ActivityDto;
  group: Exclude<ConsoleActivityFilter, 'all'>;
  href: string;
}

export interface ConsoleActivityDto {
  filter: ConsoleActivityFilter;
  counts: Record<ConsoleActivityFilter, number>;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  events: ConsoleActivityEntryDto[];
}

export interface BlockedPlayerDto {
  publicPimpId: number;
  displayName: string;
  blockedAt: string;
}

export interface MutedPlayerDto {
  publicPimpId: number;
  displayName: string;
  mutedAt: string;
}

export interface ConsoleBlocksDto {
  blocked: BlockedPlayerDto[];
  /** 0.9.0-H. Players whose messages go straight to Archived without alerts. */
  muted: MutedPlayerDto[];
}

export interface SendMessageResultDto {
  message: DirectMessageDto;
  replayed: boolean;
}
