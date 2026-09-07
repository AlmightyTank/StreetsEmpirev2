/**
 * The contract between apps/server and apps/web.
 *
 * Money crosses the wire as integer cents in a `*Cents` field. The client
 * formats it; nothing multiplies or divides money on the way through.
 */

export type RoundStatus =
  | 'SCHEDULED'
  | 'REGISTRATION'
  | 'ACTIVE'
  | 'ENDED'
  | 'ARCHIVED';

export type ActivityType =
  | 'ROUND_JOINED'
  | 'SCOUT'
  | 'WORK_STREETS'
  | 'PRODUCE_CRACK'
  | 'STORE_BUY'
  | 'STORE_SELL'
  | 'WEAPON_UNLOCK'
  | 'PAYOUT_CHANGE'
  | 'AWAY_BONUS';

export interface ApiErrorBody {
  error: {
    /** Machine readable, e.g. NOT_ENOUGH_TURNS. */
    code: string;
    /** Written for a player, not a developer. Section 50. */
    message: string;
    /** Field level messages for form validation. */
    fields?: Record<string, string>;
  };
}

export interface AccountDto {
  id: string;
  username: string;
  email: string;
  isAdmin: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface CityDto {
  id: string;
  slug: string;
  name: string;
  isEnabled: boolean;
}

export interface RoundDto {
  id: string;
  name: string;
  slug: string;
  status: RoundStatus;
  rulesetId: string;
  rulesetVersion: string;
  startsAt: string;
  endsAt: string;
  registrationOpensAt: string | null;
  /** Milliseconds remaining, or 0 once the round is over. */
  msRemaining: number;
  playerCount: number;
}

export interface TurnsDto {
  turns: number;
  turnCap: number;
  /** ISO timestamp of the next tick. Display only. */
  nextTurnAt: string;
  turnsGeneratedNextTick: number;
}

export interface ResourcesDto {
  cashCents: number;

  whores: number;
  thugs: number;

  condoms: number;
  medicine: number;
  crack: number;
  beer: number;

  pistols: number;
  shotguns: number;
  tek9s: number;
  ak47s: number;

  lowRiders: number;
}

export interface HappinessDto {
  whore: number;
  thug: number;
  /** The wear currently being subtracted, so the UI can explain a low number. */
  whoreFatigue: number;
  thugFatigue: number;
}

export interface RankDto {
  local: number | null;
  national: number | null;
  dailyStartingLocal: number | null;
  dailyStartingNational: number | null;
  /** Positive = climbed since the daily reset. */
  localMovement: number | null;
  nationalMovement: number | null;
}

export interface RoundPlayerDto {
  id: string;
  publicPimpId: number;
  displayName: string;
  city: CityDto;

  payoutPercent: number;
  netWorthCents: number;

  resources: ResourcesDto;
  turns: TurnsDto;
  happiness: HappinessDto;
  rank: RankDto;

  joinedAt: string;
  lastActiveAt: string;
}

export interface ActivityDto {
  id: string;
  type: ActivityType;
  payload: Record<string, unknown>;
  createdAt: string;
}

/** GET /api/game/me - one authoritative dashboard payload. Section 45. */
export interface GameSnapshotDto {
  round: RoundDto;
  player: RoundPlayerDto;
  recentActivity: ActivityDto[];
}

/** A single resource moving. Section 44. */
export interface ResourceChange {
  resource: string;
  before: number;
  after: number;
  change: number;
}

/** Section 43. Every action endpoint answers in this shape. */
export interface PlayerSnapshot {
  cashCents: number;
  netWorthCents: number;
  turns: number;
  whoreHappiness: number;
  thugHappiness: number;
  resources: ResourcesDto;
}

export interface RankChanges {
  localBefore: number | null;
  localAfter: number | null;
  nationalBefore: number | null;
  nationalAfter: number | null;
}

export interface GameActionResult<T> {
  success: true;
  action: string;
  before: PlayerSnapshot;
  after: PlayerSnapshot;
  changes: ResourceChange[];
  result: T;
  rankChanges?: RankChanges;
}

// --- actions ----------------------------------------------------------------

export interface DistrictDto {
  key: string;
  slug: string;
  name: string;
  /** Rough guidance for the player, not the raw balance numbers. */
  recruiting: 'low' | 'medium' | 'high';
  money: 'low' | 'medium' | 'high';
  /**
   * What this district is actually worth to this player right now, after
   * diminishing returns. Shown so a shrinking rate reads as a mechanic rather
   * than a bug.
   */
  expectedWhoresPerTurn: number;
  expectedThugsPerTurn: number;

  /** How many girls one thug can cover on this block. */
  protectionWhoresPerThug: number;
  /** Girls this crew could cover here. */
  coveredWhores: number;
  /** Fraction of the stable that would be standing alone, 0..1. */
  exposedFraction: number;
}

export interface DistrictsDto {
  districts: DistrictDto[];
  /** Recruitment left after the crew's own size, 0..1. */
  recruitment: { whores: number; thugs: number };
}

/** Section 26. Turns spent looking for people. Earns nothing. */
export interface ScoutResult {
  district: DistrictDto;
  whoresRecruited: number;
  thugsRecruited: number;
  /** What the crew's own size did to the headline rates, 0..1. */
  recruitmentMultipliers: { whores: number; thugs: number };
  turnsUsed: number;
  turnsRemaining: number;
}

/** Work the Streets. The only action that makes money. */
export interface WorkResult {
  district: DistrictDto;

  /** Everything the girls brought in. */
  grossEarnedCents: number;
  /** The crew's share, which is what pays their wear back. */
  crewTakeCents: number;
  /** Your share, which is what landed in cash. */
  cashEarnedCents: number;
  payoutPercent: number;

  /** Product turned up on the block rather than bought. */
  crackFound: number;

  condomsUsed: number;
  crackUsed: number;
  beerUsed: number;
  condomsMissing: number;
  beerMissing: number;

  whoresLeft: number;
  thugsLeft: number;

  /** Fraction of the stable that worked with nobody watching, 0..1. */
  exposedFraction: number;
  coveredWhores: number;

  /** Positive means they went home worse off than they left. */
  whoreFatigueChange: number;
  thugFatigueChange: number;
  /** Take against what the night was worth. 1.0 is a fair night. */
  reliefRatio: number;

  turnsUsed: number;
  turnsRemaining: number;
}

/** Section 29. Turns and cash in, crack out. Earns nothing. */
export interface ProduceCrackResult {
  crackProduced: number;
  ingredientCents: number;
  /** True when cash, not thugs, was the limit on the batch. */
  limitedByCash: boolean;

  beerUsed: number;
  whoresLeft: number;
  thugsLeft: number;

  thugFatigueChange: number;

  turnsUsed: number;
  turnsRemaining: number;
}

export interface PayoutResult {
  before: number;
  after: number;
}

export interface StoreItemDto {
  unlock: WeaponUnlockDto | null;
  key: string;
  name: string;
  field: Exclude<keyof ResourcesDto, 'cashCents'>;
  buyCents: number;
  sellCents: number | null;
  owned: number;
  maxBuy: number;
}

export interface WeaponUnlockDto {
  key: 'TEK9' | 'AK47';
  weaponName: string;
  title: string;
  description: string;
  unlocked: boolean;
  workTurns: number;
  workTurnsRequired: number;
  thugs: number;
  thugsRequired: number;
  prerequisiteName: string | null;
  prerequisiteMet: boolean;
  cashCostCents: number;
  crackCost: number;
  reputationMet: boolean;
  canComplete: boolean;
}

export interface WeaponUnlockResult {
  key: 'TEK9' | 'AK47';
  weaponName: string;
  favorTitle: string;
  cashSpentCents: number;
  crackDelivered: number;
}

export interface StoreDto {
  key: string;
  slug: string;
  name: string;
  blurb: string;
  items: StoreItemDto[];
}

export interface StoresDto {
  stores: StoreDto[];
  bulkHelpers: number[];
  lowRiderThugCapacity: number;
}

export interface StoreTradeResult {
  storeKey: string;
  storeName: string;
  itemName: string;
  field: StoreItemDto['field'];
  direction: 'buy' | 'sell';
  quantity: number;
  unitCents: number;
  totalCents: number;
  cashChangeCents: number;
  quantityChange: number;
}
