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
  | 'RAID_ATTACK'
  | 'RAID_DEFENSE'
  | 'COMBAT_TREATMENT'
  | 'COMBAT_RECON'
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
  fitThugs: number;
  woundedThugs: number;
  armedThugs: number;
  unarmedThugs: number;

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

/** One line of the happiness sum, so a low number can explain itself. */
export interface HappinessTermDto {
  key: string;
  label: string;
  penalty: number;
  max: number;
  fix: string | null;
}

export interface HappinessDto {
  whore: number;
  thug: number;
  /** What is actually costing them, biggest drag first. */
  whoreTerms: HappinessTermDto[];
  thugTerms: HappinessTermDto[];
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
  /*
   * There is deliberately no pay band and no recruit rate here.
   *
   * What a block pays depends on the clients out on it, which rotates hourly
   * and is never posted. What you can recruit there depends on how many you
   * already run. Publishing either would be a spoiler at best and a lie at
   * worst, so the only numbers on this DTO are the ones a player could see
   * standing on the corner: how much muscle the block wants, and how much of
   * their crew is currently uncovered.
   */

  /** How many girls one thug can cover on this block. */
  protectionWhoresPerThug: number;
  /** Girls this crew could cover here. */
  coveredWhores: number;
  /** Fraction of the stable that would be standing alone, 0..1. */
  exposedFraction: number;
  /** Fit thugs with weapons counted for this block. */
  armedThugs: number;
  /** Fit thugs without weapons; E rounds do not count them as street cover. */
  unarmedThugs: number;
  requiresArmedThugs: boolean;
}

export interface DistrictsDto {
  districts: DistrictDto[];
}

/**
 * Manual 3.1. One trip: the girls work the block while you pick people up, so
 * a scout result carries both the night's take and who you found.
 */
export interface ScoutResult {
  district: DistrictDto;

  whoresRecruited: number;
  thugsRecruited: number;

  /** Everything the girls brought in. */
  grossEarnedCents: number;
  /** The crew's share of the night. */
  crewTakeCents: number;
  /** Your share, which is what landed in cash. */
  cashEarnedCents: number;
  payoutPercent: number;

  crackFound: number;

  condomsUsed: number;
  crackUsed: number;
  beerUsed: number;
  condomsMissing: number;
  beerMissing: number;

  whoresLeft: number;
  thugsLeft: number;

  /** Who caught something working without enough condoms. */
  infected: number;
  /** Of those, how many the medicine on hand covered. */
  treated: number;
  medicineUsed: number;
  /** Untreated, and gone. */
  lostToInfection: number;

  /** Fraction of the stable that worked with nobody watching, 0..1. */
  exposedFraction: number;
  coveredWhores: number;
  armedThugs: number;
  unarmedThugs: number;

  turnsUsed: number;
  turnsRemaining: number;
}

/**
 * Manual 3.2. The girls still go out while the thugs cook - they just earn a
 * fraction of a scouted night, because nobody is out there running them.
 */
export interface ProduceCrackResult {

  crackProduced: number;
  ingredientCents: number;
  /** True when cash, not thugs, was the limit on the batch. */
  limitedByCash: boolean;

  /** What the unsupervised shift still brought in. */
  grossEarnedCents: number;
  crewTakeCents: number;
  cashEarnedCents: number;
  payoutPercent: number;

  crackFound: number;
  condomsUsed: number;
  crackUsed: number;
  beerUsed: number;
  condomsMissing: number;
  beerMissing: number;

  whoresLeft: number;
  thugsLeft: number;

  /** Who caught something working without enough condoms. */
  infected: number;
  /** Of those, how many the medicine on hand covered. */
  treated: number;
  medicineUsed: number;
  /** Untreated, and gone. */
  lostToInfection: number;

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
  field: Exclude<keyof ResourcesDto, 'cashCents' | 'fitThugs' | 'woundedThugs'>;
  buyCents: number;
  sellCents: number | null;
  owned: number;
  maxBuy: number;
  /** Null when the store can sell as many as you can pay for. */
  restock: StoreRestockDto | null;
}

/** What the store has on the shelf, and when the next one lands. */
export interface StoreRestockDto {
  stock: number;
  cap: number;
  intervalMinutes: number;
  /** How many arrive per delivery. */
  perInterval: number;
  /** ISO timestamp, or null when the shelf is already full. */
  nextAt: string | null;
}

export interface WeaponUnlockDto {
  key: 'SHOTGUN' | 'TEK9' | 'AK47';
  weaponName: string;
  title: string;
  description: string;
  unlocked: boolean;
  /** Standing across every trader, and what this rung wants. */
  totalRep: number;
  totalRepRequired: number;
  prerequisiteName: string | null;
  prerequisiteMet: boolean;
  canComplete: boolean;
}

export interface WeaponUnlockResult {
  key: 'SHOTGUN' | 'TEK9' | 'AK47';
  weaponName: string;
  /** Unlocking costs standing only; buying the gun is a separate trade. */
  title: string;
}

/** One trader's standing, and the favour they are asking for. */
export interface ReputationDto {
  trader: string;
  traderName: string;
  keeper: string;
  points: number;
  max: number;
  standing: string;
  /** How much sooner this shop restocks for you, as a percentage. */
  restockSpeedup: number;
  quest: QuestDto;
}

export interface QuestDto {
  key: string;
  title: string;
  description: string;
  done: boolean;
  have: number;
  need: number;
  /** Set when something other than the counted goal is in the way. */
  blockedBy: string | null;
  canComplete: boolean;
  reward: number;
}

export interface ReputationSummaryDto {
  traders: ReputationDto[];
  totalRep: number;
  unlocks: WeaponUnlockDto[];
}

export interface QuestCompleteResult {
  trader: string;
  traderName: string;
  title: string;
  reputationGained: number;
  totalRep: number;
  crackDelivered: number;
  lowRidersHandedOver: number;
  /** Weapons this favour just put on the menu. */
  unlocked: string[];
}

export interface StoreDto {
  key: string;
  slug: string;
  name: string;
  /** Who is behind the counter, for copy that talks about the stock. */
  keeper: string;
  blurb: string;
  /** What this shopkeeper makes of you: Stranger, Known, Regular, Family. */
  standing: string;
  reputation: number;
  /** How much sooner they restock for you at that standing, as a percentage. */
  restockSpeedup: number;
  /** The favour this trader is asking for. Done where the trader is. */
  quest: QuestDto;
  items: StoreItemDto[];
}

export interface StoresDto {
  stores: StoreDto[];
  bulkHelpers: number[];
  lowRiderThugCapacity: number;
}

export interface StoreTradeResult {
  /**
   * Standing earned by dealing with them today. Zero when the day's credit is
   * already paid or the trade cap is reached - trading more does not buy more.
   */
  reputationGained: number;
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
