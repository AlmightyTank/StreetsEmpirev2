import type { AllianceTagDto } from './alliance.js';

/** 0.3.0-D. Limits that keep the wire and the rolodex small. Not balance, so they live here. */
export const WIRE_POST_MAX = 280;
export const WIRE_COOLDOWN_SECONDS = 15;
export const WIRE_PAGE_SIZE = 50;
export const CONTACTS_MAX = 100;
export const CONTACT_NOTE_MAX = 280;

export interface WirePostDto {
  id: string;
  author: { publicPimpId: number; displayName: string };
  body: string;
  createdAt: string;
  /** You wrote it, or you lead the alliance. */
  canRemove: boolean;
  isYours: boolean;
}

/** GET /api/game/alliance/wire - only for current members. */
export interface AllianceWireDto {
  posts: WirePostDto[];
  nextBefore: string | null;
  /** Set while your last post is still cooling down. */
  cooldownUntil: string | null;
  roundOpen: boolean;
}

export interface ContactDto {
  publicPimpId: number;
  displayName: string;
  alliance: AllianceTagDto | null;
  note: string;
  addedAt: string;
  /** Their public standing right now. Null once the account is no longer active. */
  standing: {
    netWorthCents: number;
    nationalRank: number;
    city: string;
    lastActiveAt: string;
  } | null;
}

export interface ContactsDto {
  contacts: ContactDto[];
  max: number;
}

export interface ContactLookupDto {
  contact: ContactDto | null;
  isYou: boolean;
  full: boolean;
}

export interface AdminWirePostDto {
  id: string;
  author: { publicPimpId: number; displayName: string; roundPlayerId: string };
  body: string;
  createdAt: string;
  removedAt: string | null;
  removedByName: string | null;
  removedByRole: 'author' | 'leader' | 'admin' | null;
  removedReason: string | null;
}

export interface AdminWireDto {
  alliance: AllianceTagDto;
  posts: AdminWirePostDto[];
}
