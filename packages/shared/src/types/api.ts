import type { HeatDto, TripHeatDto, TurfSummaryDto, TurfTripDto, WorkSupplyPlanDto } from './playing-together.js';
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
  | 'DRIVE_BY_ATTACK'
  | 'DRIVE_BY_DEFENSE'
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
  | 'AWAY_BONUS'
  | 'BATTLE_VOIDED'
  | 'ADMIN_GRANT'
  | 'HEAT_BRIBE'
  | 'HIDEOUT_UPGRADE'
  | 'QUEST_OBJECTIVE_COMPLETE'
  | 'QUEST_READY'
  | 'QUEST_CLAIMED'
  | 'FAVOR_ACTIVATED'
  | 'FAVOR_ARMED'
  | 'FAVOR_DISARMED'
  | 'RUN_LAUNCHED'
  | 'RUN_RETURNED'
  | 'RUN_INCIDENT'
  | 'RELOCATION_STARTED'
  | 'RELOCATED'
  | 'CONVOY_TAIL'
  | 'CONVOY_ATTACK'
  | 'CONVOY_DEFENSE'
  | 'CONVOY_BACKUP'
  | 'TURF_CLAIM'
  | 'TURF_POST'
  | 'TURF_PULL'
  | 'TURF_PUSH'
  | 'TURF_PUSH_BACKUP'
  | 'TURF_PUSH_ATTACK'
  | 'TURF_PUSH_DEFENSE'
  | 'TURF_OUTPOST_ESTABLISH'
  | 'TURF_OUTPOST_TRANSFER';

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
  emailVerifiedAt: string | null;
  discordLinked: boolean;
  discordUsername: string | null;
  isAdmin: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface AccountSessionDto {
  id: string;
  current: boolean;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  userAgent: string | null;
  ip: string | null;
}

export interface AccountSessionsResponseDto {
  sessions: AccountSessionDto[];
}

export type ProfileAccent = 'default' | 'crimson' | 'gold' | 'green' | 'blue' | 'purple';
export type UiDensity = 'comfortable' | 'compact';
export type MoneyFormat = 'full' | 'compact';
export type DefaultLanding = 'game' | 'profile' | 'rankings' | 'news';

export interface CosmeticOptionDto {
  key: string;
  label: string;
  description: string | null;
}

export interface BadgeCosmeticOptionDto extends CosmeticOptionDto {
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
  permanent: boolean;
}

export interface AccountProfileSettingsDto {
  activeTitleKey: string | null;
  featuredBadgeKeys: string[];
  profileAccent: ProfileAccent;
  uiDensity: UiDensity;
  reducedMotion: boolean;
  moneyFormat: MoneyFormat;
  defaultLanding: DefaultLanding;
}

export interface AccountProfileSettingsResponseDto {
  settings: AccountProfileSettingsDto;
  options: {
    titles: BadgeCosmeticOptionDto[];
    badges: BadgeCosmeticOptionDto[];
    accents: CosmeticOptionDto[];
    densities: CosmeticOptionDto[];
    moneyFormats: CosmeticOptionDto[];
    defaultLandings: CosmeticOptionDto[];
  };
}

/**
 * Produce Product batches. 0.4.0-D replaces the old placeholder list with catalog keys:
 * what a round can actually cook comes from its ruleset. The old names stay accepted so
 * older clients do not break; they all cook crack, as they always did.
 */
export const LEGACY_PRODUCT_TYPES = ['WEED', 'COKE', 'DOWNERS', 'ECSTASY', 'HEROIN', 'ACID'] as const;
export type ProductTypeDto = string;

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
  /** 0.6.0-A. Thugs standing on held corners, unavailable at home. */
  postedThugs: number;
  armedThugs: number;
  unarmedThugs: number;

  condoms: number;
  medicine: number;
  /** Player-facing alias for the product stash. Kept beside crack during the migration. */
  product: number;
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
  /** 0.3.0-C. Null for solo players and on rounds without alliances. */
  alliance: { name: string; tag: string } | null;
  city: CityDto;

  payoutPercent: number;
  netWorthCents: number;

  resources: ResourcesDto;
  turns: TurnsDto;
  happiness: HappinessDto;
  /** 0.4.0-C. Null on rounds without Heat. */
  heat: HeatDto | null;
  /**
   * Every product the player holds, crack included, in catalog order. Null on rounds
   * where Product is still only crack.
   */
  products: Array<{ key: string; name: string; quantity: number }> | null;
  /** 0.5.0-B. A run out of town, or null. */
  run: { phase: 'road' | 'town'; city: string; cityName: string; until: string } | null;
  /** 0.5.0-D. On the road to a new home, or null. */
  moving: { to: string; toName: string; arrivesAt: string } | null;
  /** 0.5.0-E. Someone on your run's tail, or an ally's call you can answer: the soonest to land. */
  convoyAlert: { kind: 'tailed' | 'call'; cityName: string; landsAt: string } | null;
  /** 0.6.0-B. Home turf and today's house-minted street tax. */
  turf: TurfSummaryDto | null;
  rank: RankDto;
  hideout: SeasonHideoutDto;

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

export interface RoundOverPlayerDto {
  publicPimpId: number;
  displayName: string;
  city: CityDto;
  netWorthCents: number;
  cashCents: number;
  rank: {
    local: number | null;
    national: number | null;
  };
  hideout: SeasonHideoutDto;
  joinedAt: string;
  lastActiveAt: string;
}

export interface SeasonHideoutDto {
  totalLevel: number;
  totalMaxLevel: number;
  rooms: Array<{
    key: HideoutRoomKeyDto;
    name: string;
    level: number;
    maxLevel: number;
    /** 0.7.0-G permanent branch key, null for rooms without a branch or an unchosen branch. */
    specialization?: string | null;
  }>;
}

export type HideoutRoomKeyDto = 'SAFE_ROOM' | 'LOOKOUTS' | 'WORKSHOP' | 'BACK_OFFICE' | 'GARAGE';

export interface HideoutRoomDto {
  key: HideoutRoomKeyDto;
  name: string;
  blurb: string;
  level: number;
  maxLevel: number;
  nextCostCents: number | null;
  currentEffect: string;
  nextEffect: string | null;
}

export interface HideoutDto {
  enabled: boolean;
  seasonScoped: boolean;
  totalLevel: number;
  totalMaxLevel: number;
  rooms: HideoutRoomDto[];
}

export interface RoundOverLegacyDto {
  roundsPlayed: number;
  roundWins: number;
  topTenFinishes: number;
  bestNationalRank: number | null;
  bestLocalRank: number | null;
  totalFinalNetWorthCents: number;
}

export interface RoundOverBadgeDto {
  key: string;
  title: string;
  description: string;
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
}

export interface RoundOverDto {
  round: RoundDto;
  player: RoundOverPlayerDto;
  legacy: RoundOverLegacyDto;
  earnedLegacyBadges: RoundOverBadgeDto[];
  newLegacyBadges: RoundOverBadgeDto[];
}

export interface CurrentRoundDto {
  /** Current active or registration round, usually the next season after round-over. */
  round: RoundDto | null;
  /** The account's player in the current round, when already joined. */
  me: RoundPlayerDto | null;
  canJoin: boolean;
  /** Most recent finished round for this account, for the round-over screen. */
  roundOver: RoundOverDto | null;
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
  /** City-specific street flavor. Older rulesets may omit it. */
  blurb?: string;
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
  /** Fit thugs without weapons; E/F rounds do not count them as street cover. */
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
export interface FoundProductDto {
  key: string;
  name: string;
  quantity: number;
}

export interface ScoutResult {
  district: DistrictDto;
  /** 0.6.0-B. Hold bonus or street tax applied to this trip. */
  turf?: TurfTripDto;
  /** 0.4.0-B. How the trip was supplied, on rounds with work supply. */
  supply?: WorkSupplyPlanDto;
  /** 0.4.0-C. On rounds with Heat. */
  heat?: TripHeatDto;

  whoresRecruited: number;
  thugsRecruited: number;

  /** Everything the girls brought in. */
  grossEarnedCents: number;
  /** The crew's share of the night. */
  crewTakeCents: number;
  /** Your share, which is what landed in cash. */
  cashEarnedCents: number;
  hideoutBonusCents?: number;
  favorIncomePercent?: number;
  favorRecruitmentPercent?: number;
  payoutPercent: number;

  /** Crack-only compatibility field. On product rounds, this is the Crack slice of productsFound. */
  crackFound: number;
  /** 0.4.0+ product rounds: everything picked up on the street during the trip. */
  productsFound?: FoundProductDto[];

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
  /** 0.4.0-B. How the girls' shift was supplied, on rounds with work supply. */
  supply?: WorkSupplyPlanDto;
  /** 0.4.0-C. On rounds with Heat. */
  /** 0.4.0-C. What the cooking thugs burned, on rounds where they burn product. */
  cook?: WorkSupplyPlanDto;
  heat?: TripHeatDto;

  productType: ProductTypeDto;
  productName: string;
  productProduced: number;
  hideoutBonusProduct?: number;
  favorProductionPercent?: number;
  crackProduced: number;
  hideoutBonusCrack?: number;
  ingredientCents: number;
  /** 0.7.0-D. Workshop ingredient-cost reduction used for this batch. */
  hideoutIngredientEfficiencyPercent?: number;
  /** 0.7.0-D. Ingredient cash saved compared with the base recipe for the same base output. */
  hideoutIngredientSavingsCents?: number;
  /** Effective ingredient price after Workshop efficiency. */
  ingredientCentsPerUnit?: number;
  /** True when cash, not thugs, was the limit on the batch. */
  limitedByCash: boolean;

  /** What the unsupervised shift still brought in. */
  grossEarnedCents: number;
  crewTakeCents: number;
  cashEarnedCents: number;
  hideoutBonusCents?: number;
  payoutPercent: number;

  /** Crack-only compatibility field. On product rounds, this is the Crack slice of productsFound. */
  crackFound: number;
  /** Product the girls found while the thugs were cooking. */
  productsFound?: FoundProductDto[];
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

export interface HideoutUpgradeResult {
  room: HideoutRoomKeyDto;
  roomName: string;
  levelBefore: number;
  levelAfter: number;
  costCents: number;
  effect: string;
}

export interface StoreItemDto {
  unlock: WeaponUnlockDto | null;
  key: string;
  name: string;
  field: Exclude<keyof ResourcesDto, 'cashCents' | 'fitThugs' | 'woundedThugs'>;
  buyCents: number;
  /** Present when an armed single-use favor lowered the current buy quote. */
  baseBuyCents?: number;
  favorDiscountPercent?: number;
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

export type PlayerQuestStatusDto =
  | 'LOCKED'
  | 'AVAILABLE'
  | 'ACTIVE'
  | 'READY_TO_TURN_IN'
  | 'COMPLETED'
  | 'FAILED'
  | 'EXPIRED';

export interface QuestObjectiveDto {
  id: string;
  kind: string;
  description: string;
  format?: 'NUMBER' | 'CURRENCY';
  current: number;
  target: number;
  completed: boolean;
  bonus: boolean;
}

export interface QuestRewardDto {
  kind: string;
  key: string | null;
  amount: number | null;
  label: string;
}

export interface QuestBranchReputationDto {
  contactKey: string;
  contactName: string;
  amount: number;
  label: string;
}

export interface QuestBranchChoiceDto {
  key: string;
  title: string;
  description: string;
  rewards: QuestRewardDto[];
  reputationDeltas: QuestBranchReputationDto[];
}

export interface QuestContactDto {
  key: string;
  name: string;
  shortName: string;
  role: string;
  description: string;
  points: number;
  standing: string;
  nextStandingAt: number | null;
}

export interface PlayerQuestDto {
  key: string;
  attempt: number;
  title: string;
  description: string;
  contactKey: string | null;
  contactName: string | null;
  type: string;
  category: string;
  difficulty: string;
  status: PlayerQuestStatusDto;
  isTracked: boolean;
  chosenBranch: string | null;
  branchChoices: QuestBranchChoiceDto[];
  objectives: QuestObjectiveDto[];
  rewards: QuestRewardDto[];
  communityEvent?: {
    startsAt: string;
    endsAt: string;
    contributionCurrent: number;
    contributionTarget: number;
    contributionLabel: string;
    contributionFormat: 'NUMBER' | 'CURRENCY';
    sharedCompleted: boolean;
  };
  acceptedAt: string | null;
  completedAt: string | null;
  claimedAt: string | null;
  expiresAt: string | null;
}

export interface QuestPermanentUnlockDto {
  key: string;
  name: string;
  description: string;
  category: string;
  sourceQuestKey: string | null;
  awardedAt: string;
}

export interface QuestActiveFavorDto {
  key: string;
  name: string;
  description: string;
  category: 'STREET' | 'UNDERWORLD' | 'MUSCLE';
  startedAt: string;
  expiresAt: string;
}

export interface QuestArmedFavorDto {
  key: string;
  name: string;
  description: string;
  category: 'STREET' | 'UNDERWORLD' | 'MUSCLE';
  armedAt: string;
}

export interface FavorArmResult {
  favorKey: string;
  name: string;
  category: 'STREET' | 'UNDERWORLD' | 'MUSCLE';
  armed: boolean;
  quantityRemaining: number;
}

export interface FavorActivationResult {
  favorKey: string;
  name: string;
  category: 'STREET' | 'UNDERWORLD' | 'MUSCLE';
  startedAt: string;
  expiresAt: string;
  quantityRemaining: number;
}

export interface QuestFavorDto {
  key: string;
  name: string;
  description: string;
  contactKey: string;
  activationKind: 'TIMED' | 'SINGLE_USE';
  activatable: boolean;
  category: string;
  durationMinutes: number | null;
  quantity: number;
  totalGranted: number;
  lastSourceQuestKey: string | null;
}

export interface QuestPageDto {
  /** Server clock used by the client to age timed favor expiries without trusting its wall clock. */
  serverTime: string;
  dailyContracts: {
    enabled: boolean;
    slots: number;
    resetAt: string | null;
  };
  weeklyContracts: {
    enabled: boolean;
    slots: number;
    resetAt: string | null;
  };
  cityContracts: {
    enabled: boolean;
    slots: number;
    resetAt: string | null;
  };
  activeLimit: number;
  trackedLimit: number;
  counts: {
    available: number;
    active: number;
    ready: number;
    completed: number;
  };
  contacts: QuestContactDto[];
  permanentUnlocks: QuestPermanentUnlockDto[];
  activeFavors: QuestActiveFavorDto[];
  armedFavors: QuestArmedFavorDto[];
  favors: QuestFavorDto[];
  quests: PlayerQuestDto[];
}

export interface QuestClaimResult {
  questKey: string;
  title: string;
  chosenBranch: string | null;
  rewards: QuestRewardDto[];
  reputationChanges: QuestBranchReputationDto[];
  newlyAvailable: string[];
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
  items: StoreItemDto[];
}

export interface StoresDto {
  stores: StoreDto[];
  bulkHelpers: number[];
  lowRiderThugCapacity: number;
  /** 0.4.0-D. Pip deals every product at his counter. */
  productCounter?: boolean;
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
  favorKey?: string;
  favorDiscountPercent?: number;
  baseUnitCents?: number;
}

/** 0.4.0-A. One product the round knows about, with the player's stock. */
export interface ProductStockDto {
  key: string;
  name: string;
  blurb: string;
  quantity: number;
  /** 0.4.0-D. What one unit adds to net worth. Absent before product values. */
  netWorthCents?: number;
  /** 0.4.0-D. Pip's counter for this product. Absent for crack, which Pip sells as Product. */
  pip?: {
    buyCents: number;
    sellCents: number;
    stock: number;
    cap: number;
    perInterval: number;
    intervalMinutes: number;
    nextAt: string | null;
    maxBuy: number;
    /** Phase I. Selling stays open; this only gates buying from Pip. */
    purchaseUnlocked: boolean;
    unlockName: string | null;
    unlockDescription: string | null;
    favorDiscountPercent?: number;
  } | null;
  /** 0.4.0-D. Present where Produce can cook it. */
  recipe?: { perThugPerTurn: number; ingredientCentsPerUnit: number; heatPerUnit: number } | null;
}

/** 0.4.0-D. POST /api/game/products/trade. */
export interface ProductTradeResult {
  product: string;
  productName: string;
  direction: 'buy' | 'sell';
  quantity: number;
  unitCents: number;
  totalCents: number;
  cashChangeCents: number;
  quantityAfter: number;
  stockAfter: number | null;
  reputationGained: number;
  favorDiscountPercent?: number;
}

/** GET /api/game/products. Disabled on rounds where Product is still only crack. */
export interface ProductsDto {
  enabled: boolean;
  /** 0.4.0-D. True where Pip deals, and Produce cooks, more than crack. */
  economy?: boolean;
  products: ProductStockDto[];
}
