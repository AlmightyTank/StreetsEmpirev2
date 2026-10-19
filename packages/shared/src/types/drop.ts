/**
 * The Drop: Crown wallet, storefront, purchases, Crown packs and Street Pass
 * level skips. Every price, balance and window here comes from the server;
 * the client only displays it. See docs/THE-DROP.md.
 */

export type DropCategoryDto = 'VEHICLES' | 'CREW' | 'WEAPONS' | 'PROFILES' | 'SHELLS';
export type DropReturnPolicyDto = 'MAY_RETURN' | 'PERMANENT' | 'NEVER_RETURNING';
export type DropRarityDto = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
/** Publishing workflow for one catalog entry. Only LIVE entries can be offered. */
export type DropEntryStateDto = 'DRAFT' | 'QA' | 'SCHEDULED' | 'LIVE' | 'VAULTED' | 'ARCHIVED';
/** Where an offer sits in the shop. */
export type DropOfferSlotDto = 'FEATURED' | 'DAILY' | 'CATALOG';
/** The sale badge on an offer. */
export type DropOfferBadgeDto = 'DROP_EXCLUSIVE' | 'DAILY' | 'FEATURED' | 'RETURNING' | 'PERMANENT';
/** What a viewer sees for one offer. */
export type DropOfferStateDto = 'AVAILABLE' | 'OWNED' | 'PARTIALLY_OWNED' | 'COMING_SOON' | 'EXPIRED';

export type DropPreviewDto =
  | { type: 'ITEM'; items: string[]; styleKey: string }
  | { type: 'FRAME'; styleKey: string }
  | { type: 'ACCENT'; styleKey: string; color: string }
  | { type: 'TITLE'; title: string }
  | { type: 'THEME'; styleKey: string }
  /** An avatar wearable: the slot and option to draw on the viewer's built avatar. */
  | { type: 'AVATAR'; part: string; option: string };

export interface DropCollectionDto {
  key: string;
  name: string;
  tagline: string;
  description: string;
  accent: string;
}

export interface DropItemDto {
  key: string;
  slug: string;
  name: string;
  description: string;
  collection: string;
  category: DropCategoryDto;
  rarity: DropRarityDto;
  /** AccountCosmeticUnlock kind: ITEM_COLLECTION, PROFILE_FRAME, ACCENT, TITLE_BADGE, SITE_THEME or AVATAR_PART. */
  kind: string;
  priceCrowns: number;
  returnPolicy: DropReturnPolicyDto;
  preview: DropPreviewDto;
  /** The gameplay item this look dresses; owning the look never grants it. */
  dresses: string | null;
  /** Where to equip it once owned. */
  equipHint: string;
  owned: boolean;
  /** Vaulted entries are not sold now; owners keep them. */
  vaulted: boolean;
}

export interface DropBundleDto {
  key: string;
  slug: string;
  name: string;
  description: string;
  collection: string;
  itemKeys: string[];
  /** Full bundle price, before any partial-ownership adjustment. */
  priceCrowns: number;
  /** The sum of its items at list price. */
  listPriceCrowns: number;
  /** What this account pays now: scaled to the share it does not own. 0 when it owns everything. */
  yourPriceCrowns: number;
  ownedCount: number;
  returnPolicy: DropReturnPolicyDto;
  vaulted: boolean;
}

/**
 * A Drop discount: an active paid supporter's, or a birthday week's. The larger
 * applies; they never stack. Crown packs are never discounted.
 */
export interface DropDiscountDto {
  percent: number;
  reason: 'SUPPORTER' | 'BIRTHDAY';
  /** When a birthday discount ends; null for a supporter's, which lasts while the membership does. */
  endsAt: string | null;
}

export interface DropOfferDto {
  /** Pass this back to purchase. Rotation offers carry their window in the id. */
  id: string;
  kind: 'ITEM' | 'BUNDLE';
  refKey: string;
  slot: DropOfferSlotDto;
  badge: DropOfferBadgeDto;
  /** What this account pays, after any bundle adjustment and discount. */
  priceCrowns: number;
  /** The price before any discount; equals priceCrowns when none applies. */
  basePriceCrowns: number;
  startsAt: string;
  /** Null for a permanent catalog offer. */
  endsAt: string | null;
  state: DropOfferStateDto;
}

export interface DropSwitchesDto {
  storefront: boolean;
  purchases: boolean;
  earning: boolean;
  checkout: boolean;
  streetPassSkips: boolean;
}

export interface DropWalletDto {
  balance: number;
  /** Crowns earned from play in the current round. */
  earnedThisRound: number;
  /** Crowns still earnable from play this round. */
  remainingEarnable: number;
  roundCap: number;
  /** A disputed or refunded pack can freeze spending until support resolves it. */
  held: boolean;
  holdReason: string | null;
}

export interface DropEarnOpportunityDto {
  key: string;
  label: string;
  crowns: number;
  /** Already earned in its window. */
  done: boolean;
  detail: string;
}

export interface DropStorefrontDto {
  enabled: boolean;
  serverTime: string;
  switches: DropSwitchesDto;
  /** Null for a signed-out visitor. */
  wallet: DropWalletDto | null;
  /** The discount this account gets on Drop prices right now, or null. */
  discount: DropDiscountDto | null;
  /** `collection` is the first featured set, kept for older clients; `collections` lists all of them in order. */
  featured: { collection: DropCollectionDto | null; collections: DropCollectionDto[]; endsAt: string };
  daily: { resetsAt: string };
  collections: DropCollectionDto[];
  items: DropItemDto[];
  bundles: DropBundleDto[];
  offers: DropOfferDto[];
}

export interface DropItemDetailDto {
  serverTime: string;
  item: DropItemDto | null;
  bundle: (DropBundleDto & { items: DropItemDto[] }) | null;
  collection: DropCollectionDto | null;
  /** The discount this account gets on Drop prices right now, or null. */
  discount: DropDiscountDto | null;
  /** Offers that sell this item or bundle right now, or start later. */
  offers: DropOfferDto[];
}

export type CrownLedgerKindDto = 'EARN' | 'PAID_GRANT' | 'SPEND' | 'ADJUSTMENT' | 'REVERSAL';

export interface CrownLedgerEntryDto {
  id: string;
  kind: CrownLedgerKindDto;
  delta: number;
  balanceAfter: number;
  source: string;
  label: string;
  createdAt: string;
}

export interface DropWalletDetailDto {
  wallet: DropWalletDto;
  opportunities: DropEarnOpportunityDto[];
  history: CrownLedgerEntryDto[];
  orders: DropOrderDto[];
  packOrders: CrownPackOrderDto[];
}

export interface DropOrderDto {
  id: string;
  kind: 'ITEM' | 'BUNDLE' | 'STREET_PASS_SKIP';
  refKey: string;
  label: string;
  priceCrowns: number;
  grantedKeys: string[];
  createdAt: string;
}

export interface DropPurchaseResultDto {
  order: DropOrderDto;
  wallet: DropWalletDto;
  /** True when this action id had already been applied; nothing was charged again. */
  replayed: boolean;
}

export interface CrownPackDto {
  id: string;
  name: string;
  priceCents: number;
  currency: string;
  crowns: number;
  featured: boolean;
  /** Google Play product id; present only in the Android catalog response. */
  platformProductId?: string | null;
}

export interface CrownPacksDto {
  /** False when checkout is switched off or payments are not configured. */
  available: boolean;
  unavailableReason: string | null;
  packs: CrownPackDto[];
}

export interface CrownPackOrderDto {
  id: string;
  packId: string;
  crowns: number;
  amountCents: number;
  currency: string;
  /** pending, credited, refunded, refund_review, disputed, failed, expired */
  status: string;
  createdAt: string;
  creditedAt: string | null;
}

export interface StreetPassSkipQuoteDto {
  enabled: boolean;
  tier: number;
  tierCount: number;
  /** Tiers that can still be skipped. */
  remaining: number;
  single: number;
  tenPack: number;
  /** The discount this account gets on skips right now, or null. */
  discount: DropDiscountDto | null;
  balance: number | null;
}

export interface StreetPassSkipResultDto {
  fromTier: number;
  toTier: number;
  priceCrowns: number;
  wallet: DropWalletDto;
}

/* ---------- Admin ---------- */

export interface AdminDropEntryDto {
  key: string;
  kind: 'ITEM' | 'BUNDLE';
  name: string;
  collection: string;
  category: DropCategoryDto | 'BUNDLES';
  rarity: DropRarityDto | null;
  state: DropEntryStateDto;
  defaultPriceCrowns: number;
  priceCrowns: number;
  returnPolicy: DropReturnPolicyDto;
  inDailyPool: boolean;
  homepageSlot: number | null;
  owners: number;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface AdminDropOfferDto {
  id: string;
  kind: 'ITEM' | 'BUNDLE';
  refKey: string;
  slot: DropOfferSlotDto;
  badge: DropOfferBadgeDto;
  priceCrowns: number | null;
  startsAt: string;
  endsAt: string | null;
  cancelledAt: string | null;
  createdBy: string;
  note: string | null;
}

export interface AdminDropSettingsDto extends DropSwitchesDto {
  dailyOfferCount: number;
  dailyResetHourUtc: number;
  autoFeatured: boolean;
  roundEarnCap: number;
  /** Grants or removals at or above this need a second admin. */
  largeAdjustmentThreshold: number;
}

export interface AdminCrownAdjustmentDto {
  id: string;
  accountId: string;
  username: string | null;
  delta: number;
  reason: string;
  status: 'PENDING' | 'APPLIED' | 'REJECTED';
  requestedBy: string;
  decidedBy: string | null;
  createdAt: string;
  decidedAt: string | null;
}

export interface AdminDropDashboardDto {
  envEnabled: boolean;
  checkoutConfigured: boolean;
  settings: AdminDropSettingsDto;
  totals: {
    wallets: number;
    balance: number;
    earned: number;
    paidGranted: number;
    spent: number;
    adjusted: number;
    reversed: number;
    heldWallets: number;
  };
  bySource: { source: string; crowns: number; entries: number }[];
  orders: { total: number; last24h: number; crowns: number };
  packOrders: { status: string; count: number; amountCents: number; crowns: number }[];
  /** Wallets whose balance does not equal the sum of their ledger. Should always be empty. */
  mismatches: { accountId: string; balance: number; ledger: number }[];
  pendingAdjustments: AdminCrownAdjustmentDto[];
  recentAdjustments: AdminCrownAdjustmentDto[];
  entries: AdminDropEntryDto[];
  offers: AdminDropOfferDto[];
}

export interface AdminCrownWalletDto {
  accountId: string;
  username: string;
  wallet: DropWalletDto;
  history: CrownLedgerEntryDto[];
  orders: DropOrderDto[];
  packOrders: CrownPackOrderDto[];
}
