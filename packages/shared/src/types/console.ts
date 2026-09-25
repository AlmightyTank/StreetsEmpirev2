export const MESSAGE_SUBJECT_MAX = 80;
export const MESSAGE_BODY_MAX = 2_000;
export const MESSAGE_REPORT_REASON_MAX = 500;
export const MESSAGE_PAGE_SIZE = 30;

export type ConsoleFolder = 'inbox' | 'sent' | 'archived';

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
}

export interface ConsoleCountsDto {
  inbox: number;
  unread: number;
  sent: number;
  archived: number;
  blocked: number;
}

export interface PimpConsoleDto {
  folder: ConsoleFolder;
  counts: ConsoleCountsDto;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  messages: DirectMessageDto[];
}

export interface BlockedPlayerDto {
  publicPimpId: number;
  displayName: string;
  blockedAt: string;
}

export interface ConsoleBlocksDto {
  blocked: BlockedPlayerDto[];
}

export interface SendMessageResultDto {
  message: DirectMessageDto;
  replayed: boolean;
}
