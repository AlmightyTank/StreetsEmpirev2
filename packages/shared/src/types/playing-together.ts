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
  /** 0.4.0-C. */
  recruitmentMultiplier: number;
  departureMultiplier: number;
  morale: number;
  heat: number;
  /** 0.4.0-E. Share of a fighting squad wounded; 1 for other roles. */
  woundMultiplier: number;
}

/** The plan a trip follows: preview before clicking, and the same plan on the receipt. */
export interface WorkSupplyPlanDto {
  job: string;
  /** 0.4.0-C. The girls working, or the thugs cooking; 0.4.0-E adds thugs in a fight. */
  role: 'hoes' | 'thugs' | 'fighters';
  policy: WorkSupplyPolicyDto;
  need: number;
  perTurn: number;
  /** The take, or production output for thugs. */
  takeMultiplier: number;
  /** 0.4.0-C. Share-weighted across the trip. */
  recruitmentMultiplier: number;
  departureMultiplier: number;
  morale: number;
  woundMultiplier: number;
  /** 0.4.0-C. Heat the trip adds, before rounding. */
  heat: number;
  switchesAtTurn: number | null;
  consumed: Record<string, number>;
  slices: WorkSupplySliceDto[];
}

/** 0.4.0-C. GET /api/game/heat, and the Heat block on the player. */
export interface HeatDto {
  heat: number;
  max: number;
  /** Heat lost per turn interval. */
  decayPerInterval: number;
  intervalMinutes: number;
  dragStartsAt: number;
  bustStartsAt: number;
  /** What Heat is doing to the take right now, 0..1. */
  takeMultiplier: number;
  /** Chance the next Scout or Produce trip is busted. */
  bustChance: number;
  bust: { productSeizedFraction: number; cashFineFraction: number; heatDrop: number };
  /** Price of one point off today. */
  bribeCentsPerPoint: number;
}

/** 0.4.0-C. What a trip did to Heat, on the receipt. */
export interface TripHeatDto {
  before: number;
  added: number;
  after: number;
  max: number;
  /** What Heat did to this trip's take. */
  takeMultiplier: number;
  bustChance: number;
  busted: boolean;
  /** Units seized, by product. */
  seized: Record<string, number>;
  fineCents: number;
}

/** 0.4.0-E. GET /api/game/work-supply/preview: the plan, plus what the screen should warn about. */
export interface WorkSupplyPreviewDto extends WorkSupplyPlanDto {
  status: {
    /** Turns the allowed stock lasts at this crew size; null when the job burns nothing. */
    turnsOfSupply: number | null;
    /** Workers left without product on this trip. */
    shortWorkers: number;
    /**
     * Roughly what running short costs you: take for girls, cents; for cooks and fighters, null.
     * Ignores the hour's clients and cover, so it is an estimate, not a promise.
     */
    estimatedLossCents: number | null;
  };
}

/** GET /api/game/work-supply. */
export interface WorkSupplyDto {
  enabled: boolean;
  /** `pip` and `cookable` say where more comes from: Pip's counter, the Produce shift, or both. */
  products: Array<{ key: string; name: string; quantity: number; pip: boolean; cookable: boolean }>;
  /**
   * `role` and `optIn` since 0.4.0-E. An opt-in job (a fight) burns nothing until a policy is
   * saved; `active` says whether this job burns product at all right now.
   */
  jobs: Array<{ key: string; name: string; role: 'hoes' | 'thugs' | 'fighters'; optIn: boolean; active: boolean; policy: WorkSupplyPolicyDto; isDefault: boolean }>;
}
