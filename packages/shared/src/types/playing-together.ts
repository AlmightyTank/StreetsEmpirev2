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

/** 0.4.0-B. What one job burns, in order. */
export interface WorkSupplyPolicyDto {
  primary: string;
  fallback: string | null;
  emergency: string | null;
  strict: boolean;
}

export interface WorkSupplySliceDto {
  product: string | null;
  productName: string | null;
  state: 'supplied' | 'substituted' | 'dry';
  units: number;
  share: number;
  turns: number;
  takeMultiplier: number;
}

/** The plan a trip follows: preview before clicking, and the same plan on the receipt. */
export interface WorkSupplyPlanDto {
  job: string;
  policy: WorkSupplyPolicyDto;
  need: number;
  perTurn: number;
  takeMultiplier: number;
  switchesAtTurn: number | null;
  consumed: Record<string, number>;
  slices: WorkSupplySliceDto[];
}

/** GET /api/game/work-supply. */
export interface WorkSupplyDto {
  enabled: boolean;
  products: Array<{ key: string; name: string; quantity: number }>;
  jobs: Array<{ key: string; name: string; policy: WorkSupplyPolicyDto; isDefault: boolean }>;
}
