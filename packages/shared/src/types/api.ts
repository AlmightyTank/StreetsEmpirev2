import type { HeatDto, TripHeatDto, TurfSummaryDto, TurfTripDto, WorkSupplyPlanDto } from './playing-together.js';
import type { LawSummaryDto } from './law.js';
import type { CrewCosmeticLoadout, ItemCosmeticLoadout } from '../cosmetics.js';
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
  | 'GAME_ANNOUNCEMENT'
  | 'HEAT_BRIBE'
  /** Retired: the withdrawn law-pressure draft's bribe. Kept so older feed rows still read. */
  | 'LAW_CORRUPTION'
  | 'HIDEOUT_UPGRADE'
  | 'QUEST_OBJECTIVE_COMPLETE'
  | 'QUEST_READY'
  | 'QUEST_CLAIMED'
  | 'STREET_PASS_CLAIMED'
  | 'FAVOR_ACTIVATED'
  | 'FAVOR_ARMED'
  | 'FAVOR_DISARMED'
  | 'RUN_LAUNCHED'
  | 'RUN_RETURNED'
  | 'RUN_INCIDENT'
  | 'RELOCATION_STARTED'
  | 'RELOCATED'
  | 'TRIP_STARTED'
  | 'TRIP_RETURNED'
  | 'BOSS_HIT'
  | 'BOSS_HIT_ATTACK'
  | 'BOSS_HIT_DEFENSE'
  | 'BOSS_HIT_BACKUP'
  | 'OUTPOST_VISIT'
  | 'SIT_DOWN'
  | 'SIT_DOWN_AGREED'
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
  | 'TURF_OUTPOST_TRANSFER'
  // 0.9.0-G clock events written by the alert collector.
  | 'CONVOY_TAILED'
  | 'TURF_PUSH_INCOMING'
  | 'ALLIANCE_CALL'
  | 'REVENGE_EXPIRING'
  | 'SPECIAL_ORDER_READY'
  | 'BUSINESS_BUILD'
  | 'BUSINESS_STAFF'
  | 'BUSINESS_COLLECT'
  | 'BUSINESS_RACKET'
  | 'BUSINESS_TORCH'
  | 'BLOCK_WAR_DECLARED'
  | 'BLOCK_WAR_FIGHT'
  | 'BLOCK_WAR_ENDED'
  | 'BLOCK_WAR_CALL'
  | 'CASINO_BUY_CHIPS'
  | 'CASINO_REDEEM_CHIPS'
  | 'CASINO_SESSION_OPENED'
  | 'CASINO_SESSION_CLOSED'
  | 'CASINO_STATUS_UP'
  | 'CASINO_COMP_HOTEL'
  | 'CASE_STAGE_UP'
  /** 1.4.0-B. Standing with a faction reached a new tier. */
  | 'FACTION_TIER_UP'
  /** 1.4.0-D. An early warning from a faction the player is Trusted with. */
  | 'FACTION_WARNING'
  /** 1.6.0-H. A lane shipment landed: clean, partly searched, or seized. */
  | 'SUPPLY_LANE_ARRIVED'
  /** 1.6.5-D. Loan shark: a loan taken, a payment (scheduled or manual), a missed installment. */
  | 'LOAN_TAKEN'
  | 'LOAN_PAYMENT'
  | 'LOAN_INSTALLMENT_MISSED'
  /** 1.6.5-E. Into collections, or out of it into recovery or good standing. */
  | 'LOAN_COLLECTIONS'
  | 'WARRANT_DRAFTED'
  | 'WARRANT_SERVED'
  | 'WARRANT_LAWYERED'
  | 'LAWYER_RETAINED'
  | 'OFFICIAL_HIRED'
  | 'OFFICIAL_IA_OPENED'
  | 'OFFICIAL_CUT'
  | 'OFFICIAL_STUNG'
  | 'WARRANT_QUASHED'
  | 'CAPTAIN_TIP'
  | 'INFORMANT_TIP'
  | 'CASE_FOLLOWED';

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
  /** True until this account may play: verify the email, or sign in with Discord. */
  verificationRequired: boolean;
  /** True until the player accepts the current game rules (RULES_VERSION). */
  rulesAcceptanceRequired: boolean;
  /**
   * rc.2. An admin signed in with a password while admin tools require a Discord
   * sign-in: the admin pages are closed until they sign in with Discord.
   */
  adminSignInRequired: boolean;
  /** rc.3. Sign-in asks for an authenticator code. */
  twoFactorEnabled: boolean;
}

export interface AccountSessionDto {
  id: string;
  current: boolean;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  userAgent: string | null;
  ip: string | null;
  /** rc.2. PASSWORD or DISCORD. */
  method: string;
  /** rc.3. The sign-in passed an authenticator code. */
  twoFactor: boolean;
  /** rc.4. "Keep me signed in": renews while used. False: ends with the browser or after a short idle time. */
  remember: boolean;
  /** rc.4. The latest this session can last, however active: the password is asked again then. */
  endsBy: string;
}

export interface AccountSessionsResponseDto {
  sessions: AccountSessionDto[];
}

export type ProfileAccent =
  | 'default'
  | 'crimson'
  | 'gold'
  | 'green'
  | 'blue'
  | 'purple'
  | 'ghost-violet'
  | 'top-shelf-teal'
  | 'enforcer-red'
  | 'open-road-blue'
  | 'clean-slate-ice'
  | 'corner-amber'
  | 'velvet-rose'
  | 'kings-gold'
  | 'outfit-oxblood'
  | 'saints-chrome'
  | 'cartel-jade'
  | 'civic-seal';
export type UiDensity = 'comfortable' | 'compact';
export type MoneyFormat = 'full' | 'compact';
export type DefaultLanding = 'game' | 'profile' | 'rankings' | 'news';
export type ProfileTitlePlacement = 'prefix' | 'suffix';
export type ProfileEffect =
  | 'none'
  | 'chrome-serpent'
  | 'phantom-convoy'
  | 'lantern-district'
  | 'siren-breaker'
  | 'block-sovereign'
  | 'gilded-house'
  | 'dead-or-alive'
  | 'laurel-ascendant'
  | 'snowstorm'
  | 'inferno';

export interface CosmeticOptionDto {
  key: string;
  label: string;
  description: string | null;
}

/** An item art collection; non-classic collections are earned on the Street Pass. */
export interface CollectionOptionDto extends CosmeticOptionDto {
  locked: boolean;
  /** How to earn a locked collection, e.g. "Street Pass · Season 1, tier 18". */
  unlockHint: string | null;
}

export interface BadgeCosmeticOptionDto extends CosmeticOptionDto {
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
  permanent: boolean;
}

export interface AccountProfileSettingsDto {
  activeTitleKey: string | null;
  titlePlacement: ProfileTitlePlacement;
  /** 0.9.0-F. Optional public crew name. */
  crewName: string | null;
  /** Plain-text public profile description. */
  profileBio: string | null;
  /** Direct HTTPS image URL used for the profile avatar. */
  profileImageUrl: string | null;
  /** Direct HTTPS image URL used for the public profile banner/background. */
  profileBannerUrl: string | null;
  profileEffect: ProfileEffect;
  activeProfileFrameKey: string | null;
  /** Independently equipped avatar frame. Optional for older clients. */
  activeAvatarFrameKey?: string | null;
  activeSiteThemeKey: string | null;
  /** Player-selected skin per item. Optional for backward-compatible clients. */
  itemCosmetics?: ItemCosmeticLoadout;
  /** Whole-crew visual style for thugs and hoes. Optional for backward-compatible clients. */
  crewCosmetics?: CrewCosmeticLoadout;
  /** Slice E. Visitors see this player's site theme on their profile. Optional for older clients. */
  showThemeOnProfile?: boolean;
  /** Slice E. Visitors see this player's item and crew look on their profile. Optional for older clients. */
  showLookOnProfile?: boolean;
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
    frames: CosmeticOptionDto[];
    themes: CosmeticOptionDto[];
    effects: CosmeticOptionDto[];
    /** Universal item/crew skins, locked ones included. Optional so older fixture payloads stay valid. */
    itemStyles?: CollectionOptionDto[];
    crewStyles?: CollectionOptionDto[];
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
  /** 1.0.0-E. Set while admins have paused the season: player actions wait until it lifts. */
  paused: { since: string; reason: string | null } | null;
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
  /** 1.1.0-B. Thugs and girls working a business: still yours, never fit or working at home. */
  businessThugs: number;
  /** 1.6.0-A. Thugs assigned to dealer crews: still yours, unavailable for other work. */
  dealerThugs: number;
  businessWhores: number;
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
  /** 1.5.0-B/E2. Ready class vehicles; Charlie sells them from 1.5.0-E2. */
  sedans: number;
  vans: number;
}

export type SupplyOrderStatusDto = 'OPEN' | 'PARTIALLY_COLLECTED' | 'FULFILLED' | 'CANCELLED';

export interface SupplyOfferDto {
  productKey: string;
  productName: string;
  unitCostCents: number;
  minOrderQuantity: number;
  maxOrderQuantity: number;
  availableQuantity: number;
}

export interface SupplySupplierDto {
  key: string;
  name: string;
  citySlug: string;
  cityName: string;
  description: string;
  offers: SupplyOfferDto[];
}

export interface SupplyOrderDto {
  id: string;
  supplierKey: string;
  supplierName: string;
  supplierCitySlug: string;
  supplierCityName: string;
  productKey: string;
  productName: string;
  quantityOrdered: number;
  quantityCollected: number;
  quantityRemaining: number;
  unitCostCents: number;
  totalPaidCents: number;
  status: SupplyOrderStatusDto;
  createdAt: string;
}

export interface SupplyPageDto {
  enabled: boolean;
  maxOpenOrders: number;
  openOrderCount: number;
  suppliers: SupplySupplierDto[];
  orders: SupplyOrderDto[];
  /** 1.6.0-C. Collecting orders in vehicle loads. Null before pickups open. */
  pickups?: SupplyPickupPlanningDto | null;
  /** 1.6.0-F. The network's money and stock, this round. */
  ledger?: SupplyLedgerDto | null;
  /** 1.6.0-F. What moved, newest first. */
  history?: SupplyHistoryItemDto[];
}

/** 1.6.0-F. Every cent the supply network took and made, and where every unit is. */
export interface SupplyLedgerDto {
  wholesaleCents: number;
  propertyCents: number;
  upkeepCents: number;
  /** 1.6.0-H. What route cards cost. */
  laneFeesCents: number;
  grossSalesCents: number;
  dealerCutCents: number;
  wagesCents: number;
  /** What sales paid in after the cut, less wages, wholesale, properties and upkeep. */
  netCents: number;
  unitsSold: number;
  stock: { awaitingPickup: number; inTransit: number; stored: number; withCrews: number };
}

export interface SupplyHistoryItemDto {
  at: string;
  /** LANE: 1.6.0-H, a lane shipment landing, searched or not. */
  kind: 'ORDERED' | 'PICKED_UP' | 'STORED' | 'ASSIGNED_TO_DEALER' | 'SOLD' | 'RETURNED' | 'LANE' | 'CORRECTED';
  productName: string;
  units: number;
  text: string;
}

export type SupplyPickupStatusDto = 'PLANNED' | 'IN_TRANSIT' | 'DELIVERED' | 'FAILED' | 'CANCELLED';
/** 1.6.0-C. A road's police pressure in words. Never a chance. */
export type SupplyRouteRiskDto = 'QUIET' | 'WATCHED' | 'HEAVY';
export type SupplyVehicleClassId = 'LOW_RIDER' | 'SEDAN' | 'VAN';

/** 1.6.0-C. One load of a paid order: driving out, riding home, or done. */
export interface SupplyPickupDto {
  id: string;
  /** Null for a 1.6.0-F shipment between warehouses. */
  orderId: string | null;
  /** 1.6.0-F. A shipment moves the player's own stock between warehouses. */
  shipment: boolean;
  /** 1.6.0-H. A contracted lane from abroad, and how it landed once it has. */
  lane: { route: SupplyLaneRouteKeyDto; routeName: string; outcome: 'CLEAN' | 'PARTIAL' | 'SEIZED' | null } | null;
  runId: string | null;
  productKey: string;
  productName: string;
  supplierName: string;
  originCitySlug: string;
  originCityName: string;
  destinationCitySlug: string;
  destinationCityName: string;
  /** 1.6.0-D. The warehouse it goes to. */
  warehouseName: string;
  /** Loaded, or to be loaded at the supplier. */
  quantity: number;
  /** In storage once the pickup is home. */
  deliveredQuantity: number;
  /** Lost on the road: only known once the pickup is home. */
  lostQuantity: number;
  vehicleLoadout: Record<SupplyVehicleClassId, number>;
  status: SupplyPickupStatusDto;
  /** From a supplier in the player's own city: no road, straight into storage. */
  local: boolean;
  dispatchedAt: string | null;
  loadedAt: string | null;
  expectedArrivalAt: string | null;
  deliveredAt: string | null;
}

/** 1.6.0-C. One way to a supplier, as it would go if the pickup left now. */
export interface SupplyRouteOptionDto {
  index: number;
  cities: Array<{ slug: string; name: string }>;
  /** 1.6.0-D. Every stop in order, home last: the supplier, and the warehouse when it is elsewhere. */
  stops: Array<{ slug: string; name: string }>;
  /** Out to the supplier. */
  gameMinutes: number;
  /** Out, the loading window and home again. */
  roundTripMinutes: number;
  turns: number;
  police: number;
  risk: SupplyRouteRiskDto;
  arriveAt: string;
  backAt: string;
}

export interface SupplyPickupOrderPlanDto {
  orderId: string;
  local: boolean;
  /** Neither loaded nor promised to a pickup still driving out. */
  availableQuantity: number;
  /** Promised to pickups still driving out. */
  reservedQuantity: number;
  /** Ways to bring a load home to the home stash. */
  routes: SupplyRouteOptionDto[];
  /** 1.6.0-D. Every storage it can go to, by `SupplyStashDto.key`, with the ways there. */
  destinations: Array<{ key: string; local: boolean; routes: SupplyRouteOptionDto[] }>;
}

/** 1.6.0-C. Where pickups land: the home stash, and from 1.6.0-D bought warehouses. */
export interface SupplyStashDto {
  /** The warehouse id, or `stash` for a home stash nothing has landed in yet. */
  key: string;
  /** 1.6.0-D. */
  kind: 'STASH' | 'WAREHOUSE';
  name: string;
  citySlug: string;
  cityName: string;
  capacityUnits: number;
  storedUnits: number;
  /** Loads on their way here, already holding room. */
  inboundUnits: number;
  roomUnits: number;
  stock: Array<{ productKey: string; productName: string; quantity: number }>;
  /** 1.6.0-D. Upkeep each period, and how far it is paid. Zero and null for the stash. */
  upkeepCents: number;
  paidThrough: string | null;
  /** Upkeep fell due and cash could not cover it: no new deliveries until it is paid. */
  behind: boolean;
}

/** 1.6.0-D. What each city sells, and what the player holds there. */
export interface SupplyPropertyMarketDto {
  maxWarehouses: number;
  ownedWarehouses: number;
  maxSafehouses: number;
  ownedSafehouses: number;
  upkeepPeriodHours: number;
  cities: SupplyPropertyCityDto[];
}

export interface SupplyPropertyCityDto {
  citySlug: string;
  cityName: string;
  isHome: boolean;
  /** Home, or a safehouse that is paid up: a warehouse can be bought here. */
  foothold: boolean;
  warehouse: { costCents: number; upkeepCents: number; capacityUnits: number; ownedId: string | null; blockedReason: string | null };
  /** Null at home: the home city needs no safehouse. */
  safehouse: { costCents: number; upkeepCents: number; ownedId: string | null; paidThrough: string | null; behind: boolean; blockedReason: string | null } | null;
}

export interface SupplyPropertyActionResult {
  kind: 'WAREHOUSE' | 'SAFEHOUSE';
  action: 'BOUGHT' | 'CLOSED';
  propertyId: string;
  citySlug: string;
  cityName: string;
  chargedCents: number;
}

export interface SupplyPickupVehicleDto {
  classId: SupplyVehicleClassId;
  name: string;
  /** Ready at home. Damaged, disabled and away vehicles cannot go. */
  ready: number;
  /** Cargo per vehicle, before the round's cargo bonus. Fractional for some classes. */
  cargoUnits: number;
  crewSeats: number;
  routeProfile: 'NORMAL' | 'LOW_PROFILE' | 'HIGH_VISIBILITY';
  routeRiskPercent: number;
}

export interface SupplyPickupPlanningDto {
  homeCitySlug: string;
  homeCityName: string;
  turns: number;
  fitThugs: number;
  runLimit: number;
  activeRuns: number;
  /** Extra cargo share from rackets; capacity is floor(sum of vehicle cargo × (1 + this)). */
  cargoShare: number;
  localPickupTurns: number;
  townWindowMinutes: number;
  vehicles: SupplyPickupVehicleDto[];
  /** The home stash. */
  stash: SupplyStashDto;
  /** 1.6.0-D. Every place a load can go, the home stash first. */
  storage: SupplyStashDto[];
  /** 1.6.0-D. Null before properties open. */
  properties: SupplyPropertyMarketDto | null;
  /** 1.6.0-H. Suppliers abroad and the route cards to them. Null before lanes open. */
  lanes: SupplyLanesDto | null;
  /** 1.6.0-F. Ways stock can be shipped between storage in different cities. Null before shipments open. */
  shipmentLanes: Array<{ from: string; to: string; routes: SupplyRouteOptionDto[] }> | null;
  orders: SupplyPickupOrderPlanDto[];
  /** Active pickups first, then the most recent finished ones. */
  pickups: SupplyPickupDto[];
}

export type SupplyLaneRouteKeyDto = 'FREIGHT' | 'OVERLAND' | 'AIR' | 'NORTHERN';
export type SupplyLaneRiskDto = 'LOW' | 'MODERATE' | 'HIGH';

/** 1.6.0-H. A route card: what it carries, costs and takes, and how it looks in each city it lands in. */
export interface SupplyLaneRouteDto {
  key: SupplyLaneRouteKeyDto;
  name: string;
  description: string;
  capacityUnits: number;
  baseFeeCents: number;
  feeCentsPerUnit: number;
  transitHours: number;
  /** Where it lands, the chance of a search there in words, and the player's storage that can take it. */
  entries: Array<{ citySlug: string; cityName: string; risk: SupplyLaneRiskDto; storage: Array<{ key: string; name: string; roomUnits: number }> }>;
}

export interface SupplyLaneSupplierDto {
  key: string;
  name: string;
  origin: string;
  description: string;
  routes: SupplyLaneRouteKeyDto[];
  offers: SupplyOfferDto[];
}

export interface SupplyLanesDto {
  maxInTransit: number;
  inTransit: number;
  routes: SupplyLaneRouteDto[];
  suppliers: SupplyLaneSupplierDto[];
}

export interface SupplyLaneResult {
  pickup: SupplyPickupDto;
  goodsCents: number;
  feeCents: number;
  chargedCents: number;
  replayed: boolean;
}

export interface SupplyShipmentResult {
  pickup: SupplyPickupDto;
  turns: number;
  risk: SupplyRouteRiskDto | null;
  replayed: boolean;
}

export interface SupplyPickupDispatchResult {
  pickup: SupplyPickupDto;
  order: SupplyOrderDto;
  turns: number;
  capacityUnits: number;
  risk: SupplyRouteRiskDto | null;
  replayed: boolean;
}

export interface SupplyOrderPlacementResult {
  order: SupplyOrderDto;
  chargedCents: number;
  replayed: boolean;
}

/** 1.6.0-A. One individual's persisted dealer career, assigned or released. */
export interface DealerStaffDto {
  id: string;
  crewId: string | null;
  experiencePoints: number;
  assignedAt: string;
  releasedAt: string | null;
}

export interface DealerStaffActionResult {
  staff: DealerStaffDto;
  dealerThugs: number;
  availableThugs: number;
  replayed: boolean;
}

export type DemandWordDto = 'STRONG' | 'STEADY' | 'MODEST' | 'THIN';

/** 1.6.0-E. One dealer's career: his experience, the tier it earns him, and his cut. */
export interface DealerCareerDto {
  id: string;
  crewId: string | null;
  experiencePoints: number;
  tierKey: string;
  tierName: string;
  cutPercent: number;
  /** Experience to the next tier, or null at the top. */
  nextTierAt: number | null;
}

/** 1.6.0-E. A crew, its offering and what it is expected to do. */
export interface DealerCrewDto {
  id: string;
  citySlug: string;
  cityName: string;
  districtKey: string;
  districtName: string;
  status: 'ACTIVE' | 'PAUSED';
  /** False when the safehouse it relies on is gone or behind. */
  foothold: boolean;
  productKey: string | null;
  productName: string | null;
  priceCents: number | null;
  streetPriceCents: number | null;
  priceRange: { minCents: number; maxCents: number } | null;
  demand: DemandWordDto | null;
  /** The district's foot traffic, 1 ordinary. */
  traffic: number;
  capacityUnits: number;
  inventoryUnits: number;
  dealers: DealerCareerDto[];
  /** What it would do now, at this price, with this stock. Sales themselves begin in 1.6.0-F. */
  pace: {
    unitsPerHour: number;
    cutPercent: number;
    operatingCentsPerHour: number;
    grossCentsPerHour: number;
    /** After the dealers' cut and operating costs. */
    netCentsPerHour: number;
    /** Until the stock it holds runs out; null when it is not selling. */
    hoursToSellOut: number | null;
  };
  /** Storage in its city it can be stocked from, with what each holds of its product. */
  warehouses: Array<{ id: string; name: string; available: number; roomUnits: number }>;
  /** What it could sell in this city. */
  products: Array<{ key: string; name: string; streetPriceCents: number; demand: DemandWordDto; stored: number }>;
  /** 1.6.0-F. What it has sold this round, and its latest batches. Null before sales open. */
  sales: {
    units: number;
    grossCents: number;
    cutCents: number;
    netCents: number;
    wagesCents: number;
    recent: Array<{ at: string; units: number; priceCents: number; netCents: number }>;
  } | null;
}

export interface DealerPageDto {
  enabled: boolean;
  rules: {
    maxCrews: number;
    maxDealersPerCrew: number;
    unitsPerDealer: number;
    setupTurns: number;
    operatingCentsPerDealerHour: number;
    priceRange: { min: number; max: number };
    tiers: Array<{ key: string; name: string; minExperience: number; cutPercent: number; paceBonus: number }>;
    /** 1.6.0-F. Crews sell on the server's clock. */
    selling: boolean;
    salesIntervalMinutes: number | null;
  } | null;
  turns: number;
  fitThugs: number;
  dealerThugs: number;
  /** Cities with a foothold, and their districts. */
  cities: Array<{ citySlug: string; cityName: string; isHome: boolean; districts: Array<{ key: string; name: string; traffic: number; taken: boolean }> }>;
  crews: DealerCrewDto[];
  /** Released dealers, who come back with their experience when a crew needs hands. */
  careers: DealerCareerDto[];
}

export interface DealerCrewActionResult {
  crew: DealerCrewDto | null;
  message: string;
}

/** 1.7.0-A. Where a crew member is. Every status but RELEASED is counted in the crew. */
export type CrewMemberStatusDto = 'AVAILABLE' | 'ASSIGNED' | 'IN_TRANSIT' | 'RECOVERING' | 'RELEASED';
export type CrewAssignmentKindDto = 'BUSINESS' | 'DEALER' | 'TURF';
export type CrewMemberSpecialtyDto = 'GENERALIST' | 'ENFORCER' | 'WHEELMAN' | 'SCOUT' | 'DEALER' | 'SERVICE';

export interface CrewMemberHistoryDto {
  kind: 'JOINED' | 'ASSIGNED' | 'UNASSIGNED' | 'RELEASED' | 'REHIRED' | 'WORK_COMPLETED' | 'TRAINED';
  label: string;
  at: string;
}

/** 1.7.0-A. One thug or worker with a stable identity. */
export interface CrewMemberDto {
  id: string;
  name: string;
  role: 'THUG' | 'WORKER';
  /** Order of joining this round's roster. */
  serial: number;
  status: CrewMemberStatusDto;
  assignment: { kind: CrewAssignmentKindDto; ref: string | null; label: string } | null;
  experiencePoints: number;
  specialty: CrewMemberSpecialtyDto;
  specialtyExperiencePoints: number;
  specialtyLevel: 0 | 1 | 2;
  specialtyEffectPercent: number;
  nextSpecialtyMilestone: number | null;
  /** Descriptive identity tags. They have no gameplay modifiers in 1.7.0-B. */
  traits: string[];
  unavailableReason: string | null;
  history: CrewMemberHistoryDto[];
  /** The 1.6 dealer career this member carries, if any. */
  dealerStaffId: string | null;
  joinedAt: string;
  statusSince: string;
}

/** 1.7.0-A. The crew as individual members, alongside the counts they follow. */
export interface CrewRosterDto {
  enabled: boolean;
  /** When the roster was first built from this player's counts; null before then. */
  migratedAt: string | null;
  totals: Array<{
    role: 'THUG' | 'WORKER';
    /** Members in the crew: always the matching count. */
    members: number;
    byStatus: Record<Exclude<CrewMemberStatusDto, 'RELEASED'>, number>;
    byAssignment: Record<CrewAssignmentKindDto, number>;
    released: number;
  }>;
  members: CrewMemberDto[];
  /** Members in the crew matching the filter, for paging. */
  total: number;
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
   * Every product the player holds, crack i…36985 tokens truncated…n reversed this battle. Voided battles stay visible but no longer count for
  /// revenge, trophies, repeat-target limits, stats or the raid feed.
  voidedAt           DateTime?
  voidedByUsername   String?
  voidReason         String?
  /// 0.3.0-C. The defender's alliance when the hit landed. Shared revenge reads this, so
  /// the victim leaving afterwards cannot take the window away from the alliance.
  defenderAllianceId String?
  /// 0.3.0-E. The attacker's alliance when the hit landed, and whose recon they had
  /// (own, ally or none), so alliance rounds can be balanced from real battles.
  attackerAllianceId String?
  attackerIntel      String?
  /// 0.9.0-G. When the defender's "revenge expiring" check ran for this hit.
  revengeAlertedAt   DateTime?

  @@unique([attackerId, actionId])
  @@index([attackerId, createdAt(sort: Desc), id])
  @@index([defenderId, createdAt(sort: Desc), id])
  @@index([defenderAllianceId, attackerId, createdAt])
  @@index([revengeAlertedAt, createdAt])
}

model CombatInjury {
  id            String    @id @default(cuid())
  roundPlayerId String
  battleId      String?
  thugs         Int
  recoverAt     DateTime
  createdAt     DateTime  @default(now())
  treatedAt     DateTime?

  roundPlayer RoundPlayer @relation(fields: [roundPlayerId], references: [id], onDelete: Cascade)
  battle      RaidBattle? @relation(fields: [battleId], references: [id], onDelete: Cascade)

  @@index([roundPlayerId, recoverAt])
  @@index([battleId])
}

model CombatIntel {
  id         String      @id @default(cuid())
  observerId String
  targetId   String
  observer   RoundPlayer @relation("IntelObserver", fields: [observerId], references: [id], onDelete: Cascade)
  target     RoundPlayer @relation("IntelTarget", fields: [targetId], references: [id], onDelete: Cascade)
  report     Json
  expiresAt  DateTime
  createdAt  DateTime    @default(now())
  updatedAt  DateTime    @updatedAt

  @@unique([observerId, targetId])
  @@index([observerId, expiresAt])
  @@index([targetId])
}

model PlayerActivity {
  id String @id @default(cuid())

  roundPlayerId String
  roundPlayer   RoundPlayer        @relation(fields: [roundPlayerId], references: [id], onDelete: Cascade)
  notification  InAppNotification?

  type    ActivityType
  payload Json

  createdAt DateTime @default(now())

  @@index([roundPlayerId, createdAt(sort: Desc)])
}

/// 1.6.0-F. Durable action-triggered street situations.
model RandomEncounter {
  id String @id @default(cuid())

  roundPlayerId String
  roundPlayer   RoundPlayer @relation(fields: [roundPlayerId], references: [id], onDelete: Cascade)

  /// SCOUT, PRODUCE, TRAVEL, etc.
  trigger String
  key     String
  title   String
  text    String
  tone    String
  status  String @default("RESOLVED")

  effects Json @default("{}")
  choices Json @default("[]")

  selectedChoice String?
  result         Json?

  sourceActivityId String?
  resolvedAt       DateTime?
  expiresAt        DateTime?
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt

  @@index([roundPlayerId, status, createdAt(sort: Desc)])
  @@index([roundPlayerId, trigger, createdAt(sort: Desc)])
  @@index([expiresAt, status])
}

/// Durable in-game notification receipt for a toast-worthy activity.
/// The notification id intentionally matches the activity id so a live toast can
/// acknowledge itself without another lookup.
/// 0.9.0-G. Something that happens by the clock rather than by a write, e.g. a special
/// order arriving. The alert collector fires it once when due.
model ScheduledAlert {
  id String @id @default(cuid())

  roundPlayerId String
  roundPlayer   RoundPlayer @relation(fields: [roundPlayerId], references: [id], onDelete: Cascade)

  /// SPECIAL_ORDER
  kind    String
  dueAt   DateTime
  payload Json
  firedAt DateTime?

  createdAt DateTime @default(now())

  @@index([firedAt, dueAt])
  @@index([roundPlayerId])
}

model InAppNotification {
  id String @id

  roundPlayerId String
  roundPlayer   RoundPlayer @relation(fields: [roundPlayerId], references: [id], onDelete: Cascade)

  activityId String         @unique
  activity   PlayerActivity @relation(fields: [activityId], references: [id], onDelete: Cascade)

  readAt    DateTime?
  createdAt DateTime  @default(now())

  @@index([roundPlayerId, readAt, createdAt(sort: Desc)])
}

/// 0.7.0-E. Durable economic lines for the Back Office ledger.
/// Positive amounts are income; negative amounts are expenses. Internal transfers
/// (for example cash loaded into a run) are intentionally not recorded here.
model EconomyLedgerEntry {
  id String @id @default(cuid())

  roundPlayerId String
  roundPlayer   RoundPlayer @relation(fields: [roundPlayerId], references: [id], onDelete: Cascade)

  source          String
  label           String
  amountCents     BigInt
  metadata        Json?
  /// 1.6.5-E. When this income line was considered for a loan collection garnish (taken from
  /// or not). Set once, so no income is ever garnished twice.
  loanCollectedAt DateTime?

  createdAt DateTime @default(now())

  @@index([roundPlayerId, createdAt(sort: Desc)])
}

// ---------------------------------------------------------------------------
// Turf (0.6.0-A)
// ---------------------------------------------------------------------------

/// One district in one city: forty blocks a round with all eight cities enabled. A row is
/// created for every block when the round first reads its turf, held by the locals.
///
/// A null `holderId` means no player holds it. Before `localsReclaimAt` it is vacant;
/// afterwards the locals have it. `localsThugs` grows back from `localsAt` on the
/// ruleset's clock, exactly like Pip's shelves: nothing sweeps this table.
model Turf {
  id String @id @default(cuid())

  roundId String
  round   Round  @relation(fields: [roundId], references: [id], onDelete: Cascade)

  cityId String
  city   City   @relation(fields: [cityId], references: [id])

  /// Ruleset district key, e.g. CASINO.
  district String

  /// The crew standing on it, or null for the locals.
  holderId       String?
  holder         RoundPlayer? @relation("TurfHolder", fields: [holderId], references: [id], onDelete: SetNull)
  /// The holder's posted thugs on this corner. Part of the holder's `postedThugs`.
  cornerThugs    Int          @default(0)
  /// Their guns have physically left the holder's home arsenal while posted.
  cornerPistols  Int          @default(0)
  cornerShotguns Int          @default(0)
  cornerTek9s    Int          @default(0)
  cornerAk47s    Int          @default(0)
  heldSince      DateTime?
  /// 0.6.0-C. Taken blocks cannot be taken again until this passes.
  shieldUntil    DateTime?

  /// What the locals hold it with, and when that was last worked out.
  localsThugs     Int
  localsAt        DateTime  @default(now())
  /// 0.6.0-C. A released block stays vacant until this time, then the locals return.
  /// Null means the locals are already on a holderless block, or a player currently holds it.
  localsReclaimAt DateTime?

  /// 0.6.0-B. Last corner-upkeep boundary settled.
  upkeepAt DateTime @default(now())

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  /// 1.1.0-D. War fatigue (devastation), 0..ruleset max, as of `fatigueAt`; it heals while
  /// no war is on the block. `capturedAts` keeps when the block changed hands, for scarring.
  fatigue        Float      @default(0)
  fatigueAt      DateTime   @default(now())
  capturedAts    DateTime[]
  /// Set while a block war's siege is on: registers stop filling and the hold clock pauses.
  siegedSince    DateTime?
  /// The ally's cut of this block's business income during the truce after a war.
  warCutPlayerId String?
  warCutShare    Float      @default(0)
  warCutUntil    DateTime?

  pushes       TurfPush[]
  outpost      TurfOutpost?
  holdSegments TurfHoldSegment[]
  businesses   Business[]
  blockWars    BlockWar[]

  @@unique([roundId, cityId, district])
  @@index([roundId, holderId])
}

/// 1.1.0-A. One business lot on a block. Every block has three, fixed by its district,
/// and they start empty (level 0). The business belongs to the block, not to a player:
/// whoever holds the block runs it, and a block war hands it over with its level intact.
/// Read-only in A; 1.1.0-B adds building, staff, supply and the register.
model Business {
  id String @id @default(cuid())

  roundId String
  round   Round  @relation(fields: [roundId], references: [id], onDelete: Cascade)

  turfId String
  turf   Turf   @relation(fields: [turfId], references: [id], onDelete: Cascade)

  /// 1-based lot on the block. Lot 1 opens first.
  lot   Int
  /// Ruleset business key, e.g. CASINO_FRONT.
  kind  String
  /// 0 is an empty lot.
  level Int    @default(0)

  /// 1.1.0-B. Staff working it: thugs, or girls for a Strip Club. Still counted in the
  /// owner's `thugs`/`whores`, and marked there as `businessThugs`/`businessWhores`.
  staff           Int             @default(0)
  /// How many staff the crew wants here: up to the level's max, 0 to close it.
  staffTarget     Int             @default(0)
  /// Replace staff who desert or are lured from the fit crew, up to the target, on settle.
  autoStaff       Boolean         @default(true)
  /// Whose staff they are. Only earns while this crew holds the block; when it no longer
  /// does, the staff go home on the owner's next settle and the register is lost.
  staffOwnerId    String?
  staffOwner      RoundPlayer?    @relation("BusinessStaffOwner", fields: [staffOwnerId], references: [id], onDelete: SetNull)
  /// Income waiting to be collected, capped at the ruleset's register hours.
  registerCents   BigInt          @default(0)
  /// Whole hours of income and supply are settled up to here.
  accruedAt       DateTime        @default(now())
  /// 1.1.0-C. The ruleset racket key this business runs on top of its front, if any.
  /// Cleared when another crew takes it over.
  racket          String?
  /// When the racket was last set or switched; the switch cooldown runs from here.
  racketSince     DateTime?
  /// 1.1.0-D. A torch the holder lit during a war: it burns down at `torchUntil`.
  torchUntil      DateTime?
  torchById       String?
  /// 1.3.0-C. A business raid shuts the racket (never the front) for this window.
  racketShutFrom  DateTime?
  racketShutUntil DateTime?
  warrants        PlayerWarrant[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([turfId, lot])
  @@index([roundId])
  @@index([staffOwnerId])
}

/// 1.2.0-A. Chips never sit on RoundPlayer cash. Every city owns a separate wallet.
model CasinoWallet {
  id String @id @default(cuid())

  roundPlayerId String
  roundPlayer   RoundPlayer @relation(fields: [roundPlayerId], references: [id], onDelete: Cascade)

  cityId String
  city   City   @relation(fields: [cityId], references: [id], onDelete: Cascade)

  chipsCents BigInt   @default(0)
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  @@unique([roundPlayerId, cityId])
  @@index([cityId])
}

/// One in-person casino bankroll. Later games mutate bankrollCents under the same player lock.
model CasinoSession {
  id String @id @default(cuid())

  roundPlayerId String
  roundPlayer   RoundPlayer @relation(fields: [roundPlayerId], references: [id], onDelete: Cascade)

  cityId String
  city   City   @relation(fields: [cityId], references: [id], onDelete: Cascade)

  status        String    @default("OPEN")
  bankrollCents BigInt
  openedAt      DateTime  @default(now())
  closedAt      DateTime?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  ledger CasinoLedgerEntry[]

  @@index([roundPlayerId, status, openedAt(sort: Desc)])
  @@index([cityId, status])
}

/// 1.2.0-B. One durable non-retriggering free-spin bundle per player.
/// The wager configuration that earned it is frozen until the bundle is consumed.
model CasinoFreeSpinBonus {
  id String @id @default(cuid())

  roundPlayerId String      @unique
  roundPlayer   RoundPlayer @relation(fields: [roundPlayerId], references: [id], onDelete: Cascade)

  citySlug          String
  machineKey        String
  betPerLineCents   BigInt
  activePaylineKeys Json
  awardedSpins      Int
  remainingSpins    Int
  totalWonCents     BigInt   @default(0)
  sourceActionId    String
  awardedAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  @@index([machineKey])
  @@index([citySlug])
}

/// 1.2.0-C. Server-owned shuffled shoe for one player/table.
/// The cursor advances only under the RoundPlayer row lock.
model CasinoBlackjackShoe {
  id String @id @default(cuid())

  roundPlayerId String
  roundPlayer   RoundPlayer @relation(fields: [roundPlayerId], references: [id], onDelete: Cascade)

  tableKey      String
  cards         Json
  cursor        Int      @default(0)
  shuffleNumber Int      @default(1)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@unique([roundPlayerId, tableKey])
  @@index([tableKey])
}

/// 1.2.0-C. Reconnect-safe blackjack hand. Player/dealer cards and split-hand
/// state stay server-owned; settled rows double as durable hand history.
model CasinoBlackjackHand {
  id String @id @default(cuid())

  roundPlayerId String
  roundPlayer   RoundPlayer @relation(fields: [roundPlayerId], references: [id], onDelete: Cascade)

  sessionId           String
  cityId              String
  tableKey            String
  status              String    @default("ACTIVE")
  wagerCents          BigInt
  committedWagerCents BigInt
  playerHands         Json
  dealerCards         Json
  activeHandIndex     Int       @default(0)
  totalReturnCents    BigInt    @default(0)
  bankrollAfterCents  BigInt    @default(0)
  shoeRemainingCards  Int       @default(0)
  shuffleNumber       Int       @default(1)
  initialActionId     String
  settledAt           DateTime?
  createdAt           DateTime  @default(now())
  updatedAt           DateTime  @updatedAt

  @@unique([roundPlayerId, initialActionId])
  @@index([roundPlayerId, status, createdAt(sort: Desc)])
  @@index([sessionId, status])
  @@index([cityId, createdAt(sort: Desc)])
}

/// Idempotency receipt for blackjack Deal / Hit / Stand / Double / Split.
/// response is the exact post-action hand snapshot returned on retry.
model CasinoBlackjackAction {
  id String @id @default(cuid())

  roundPlayerId String
  roundPlayer   RoundPlayer @relation(fields: [roundPlayerId], references: [id], onDelete: Cascade)

  handId    String
  actionId  String
  kind      String
  response  Json
  createdAt DateTime @default(now())

  @@unique([roundPlayerId, actionId])
  @@index([handId, createdAt])
}

/// 1.2.0-D. One reconnect-safe Street Dice pass-line cycle.
/// The line and odds wagers stay committed until the point resolves.
model CasinoStreetDiceRound {
  id String @id @default(cuid())

  roundPlayerId String
  roundPlayer   RoundPlayer @relation(fields: [roundPlayerId], references: [id], onDelete: Cascade)

  sessionId String
  cityId    String
  tableKey  String
  status    String @default("ACTIVE")

  lineWagerCents BigInt
  oddsWagerCents BigInt  @default(0)
  point          Int?
  lastDice       Json    @default("[]")
  lastOutcome    String?
  rollCount      Int     @default(0)

  totalReturnCents   BigInt @default(0)
  bankrollAfterCents BigInt @default(0)

  initialActionId String
  settledAt       DateTime?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  @@unique([roundPlayerId, initialActionId])
  @@index([roundPlayerId, status, createdAt(sort: Desc)])
  @@index([sessionId, status])
  @@index([cityId, createdAt(sort: Desc)])
}

/// Idempotency receipt for Street Dice start / roll / odds actions.
model CasinoStreetDiceAction {
  id String @id @default(cuid())

  roundPlayerId String
  roundPlayer   RoundPlayer @relation(fields: [roundPlayerId], references: [id], onDelete: Cascade)

  diceRoundId String
  actionId    String
  kind        String
  response    Json
  createdAt   DateTime @default(now())

  @@unique([roundPlayerId, actionId])
  @@index([diceRoundId, createdAt])
}

/// 1.2.0-E. Server-owned solo Hold’em hand. The JSON game state includes bot cards
/// and is never returned directly; the service builds viewer-safe DTOs from it.
model CasinoPokerHand {
  id String @id @default(cuid())

  roundPlayerId String
  roundPlayer   RoundPlayer @relation(fields: [roundPlayerId], references: [id], onDelete: Cascade)

  sessionId          String
  cityId             String
  tableKey           String
  status             String    @default("ACTIVE")
  buyInCents         BigInt
  state              Json
  bankrollAfterCents BigInt
  initialActionId    String
  settledAt          DateTime?
  createdAt          DateTime  @default(now())
  updatedAt          DateTime  @updatedAt

  @@unique([roundPlayerId, initialActionId])
  @@index([roundPlayerId, status, createdAt(sort: Desc)])
  @@index([sessionId, status])
  @@index([cityId, createdAt(sort: Desc)])
}

/// Idempotent action receipt for solo Hold’em, including the exact safe response.
model CasinoPokerAction {
  id String @id @default(cuid())

  roundPlayerId String
  roundPlayer   RoundPlayer @relation(fields: [roundPlayerId], references: [id], onDelete: Cascade)

  handId    String
  actionId  String
  kind      String
  response  Json
  createdAt DateTime @default(now())

  @@unique([roundPlayerId, actionId])
  @@index([handId, createdAt])
}

/// 1.2.0-F. Multiplayer Hold’em lobby table; gameplay is added in the next slice.
model CasinoPokerTable {
  id                   String                 @id @default(cuid())
  roundId              String
  round                Round                  @relation(fields: [roundId], references: [id], onDelete: Cascade)
  cityId               String
  name                 String
  visibility           String                 @default("PUBLIC")
  inviteCodeHash       String?
  creatorRoundPlayerId String
  createActionId       String
  maxPlayers           Int                    @default(6)
  buyInCents           BigInt
  status               String                 @default("WAITING")
  dealerSeatNo         Int?
  createdAt            DateTime               @default(now())
  updatedAt            DateTime               @updatedAt
  seats                CasinoPokerSeat[]
  hands                CasinoPokerTableHand[]

  @@unique([creatorRoundPlayerId, createActionId])
  @@index([roundId, status, visibility, createdAt])
  @@index([cityId, status])
}

model CasinoPokerSeat {
  id            String           @id @default(cuid())
  tableId       String
  table         CasinoPokerTable @relation(fields: [tableId], references: [id], onDelete: Cascade)
  roundPlayerId String
  roundPlayer   RoundPlayer      @relation(fields: [roundPlayerId], references: [id], onDelete: Cascade)
  sessionId     String
  actionId      String
  seatNo        Int
  stackCents    BigInt
  status        String           @default("WAITING")
  joinedAt      DateTime         @default(now())
  leftAt        DateTime?

  @@unique([tableId, seatNo])
  @@unique([roundPlayerId, actionId])
  @@index([roundPlayerId, status])
  @@index([tableId, status, seatNo])
}

model CasinoPokerTableHand {
  id        String                   @id @default(cuid())
  tableId   String
  table     CasinoPokerTable         @relation(fields: [tableId], references: [id], onDelete: Cascade)
  handNo    Int
  status    String                   @default("ACTIVE")
  state     Json
  outcome   String?
  startedAt DateTime                 @default(now())
  settledAt DateTime?
  createdAt DateTime                 @default(now())
  updatedAt DateTime                 @updatedAt
  actions   CasinoPokerTableAction[]

  @@unique([tableId, handNo])
  @@index([tableId, status, handNo])
}

model CasinoPokerTableAction {
  id            String               @id @default(cuid())
  roundPlayerId String
  roundPlayer   RoundPlayer          @relation(fields: [roundPlayerId], references: [id], onDelete: Cascade)
  handId        String
  hand          CasinoPokerTableHand @relation(fields: [handId], references: [id], onDelete: Cascade)
  actionId      String
  kind          String
  response      Json
  createdAt     DateTime             @default(now())

  @@unique([roundPlayerId, actionId])
  @@index([handId, createdAt])
}

/// Immutable retry receipt for every casino money movement.
model CasinoLedgerEntry {
  id String @id @default(cuid())

  roundPlayerId String
  roundPlayer   RoundPlayer @relation(fields: [roundPlayerId], references: [id], onDelete: Cascade)

  cityId String
  city   City   @relation(fields: [cityId], references: [id], onDelete: Cascade)

  sessionId String?
  session   CasinoSession? @relation(fields: [sessionId], references: [id], onDelete: SetNull)

  actionId               String
  kind                   String
  cashDeltaCents         BigInt   @default(0)
  walletChipDeltaCents   BigInt   @default(0)
  sessionChipDeltaCents  BigInt   @default(0)
  walletChipsAfterCents  BigInt
  sessionChipsAfterCents BigInt   @default(0)
  metadata               Json     @default("{}")
  createdAt              DateTime @default(now())

  @@unique([roundPlayerId, actionId])
  @@index([roundPlayerId, createdAt(sort: Desc)])
  @@index([sessionId, createdAt])
  @@index([cityId, createdAt(sort: Desc)])
}

/// 1.2.0-E. Rated play for one player at one city's casino. Every charged wager adds its
/// theoretical house win (wager x pinned edge), never its result. Network status is the
/// sum of theo across cities; comps are earned as a share of theo and spent on Boss Trip
/// hotel nights. Basis columns hold cents x basis points so small wagers lose nothing to
/// rounding; whole cents are basis / 10,000. Status and comps never feed any game's odds.
model CasinoRating {
  id String @id @default(cuid())

  roundPlayerId String
  roundPlayer   RoundPlayer @relation(fields: [roundPlayerId], references: [id], onDelete: Cascade)

  cityId String
  city   City   @relation(fields: [cityId], references: [id], onDelete: Cascade)

  /// Charged chips wagered here. Free spins and comped play add nothing.
  wageredCents    BigInt    @default(0)
  /// Theoretical house win in cents x bps.
  theoBasis       BigInt    @default(0)
  /// Comps earned here in cents x bps.
  compBasis       BigInt    @default(0)
  /// Whole comp cents redeemed while the boss was in this city.
  compsSpentCents BigInt    @default(0)
  ratedWagers     Int       @default(0)
  /// 1.2.0-F. Season casino feats: wagers placed at VIP tables, progressive jackpots hit,
  /// and the biggest net win on one settled hand, spin, roll or poker hand.
  vipWagers       Int       @default(0)
  jackpots        Int       @default(0)
  biggestWinCents BigInt    @default(0)
  lastRatedAt     DateTime?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  @@unique([roundPlayerId, cityId])
  @@index([cityId])
}

/// 1.2.0-B. One progressive pool per round/machine. It is house money, never player net worth.
model CasinoJackpot {
  id String @id @default(cuid())

  roundId String
  round   Round  @relation(fields: [roundId], references: [id], onDelete: Cascade)

  machineKey String
  poolCents  BigInt
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  @@unique([roundId, machineKey])
  @@index([machineKey])
}

/// 0.6.0-D. The box attached to one away-held block. A home block never needs one.
/// Runs are the only intended way to move stock in or out; later D slices enforce that.
model TurfOutpost {
  id String @id @default(cuid())

  turfId String @unique
  turf   Turf   @relation(fields: [turfId], references: [id], onDelete: Cascade)

  ownerId String
  owner   RoundPlayer @relation(fields: [ownerId], references: [id], onDelete: Cascade)

  cashCents BigInt @default(0)
  beer      Int    @default(0)
  /// Product-key -> quantity. Crack is stored here too because this is not home inventory.
  products  Json   @default("{}")

  /// Trips D2. The boss walked this corner: its crew stays put until `moraleUntil`.
  visitedAt   DateTime?
  moraleUntil DateTime?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([ownerId])
}

/// 0.6.0-A. Turns a crew has worked on a block lately. You cannot claim a block you have
/// never worked, and presence fades on the ruleset's half-life, settled from `at` on read.
model TurfPresence {
  id String @id @default(cuid())

  roundPlayerId String
  roundPlayer   RoundPlayer @relation(fields: [roundPlayerId], references: [id], onDelete: Cascade)

  cityId String
  city   City   @relation(fields: [cityId], references: [id])

  /// Ruleset district key, e.g. CASINO.
  district String

  /// Turns worked, as of `at`. Faded on read, never by a sweep.
  turns Float    @default(0)
  at    DateTime @default(now())

  @@unique([roundPlayerId, cityId, district])
}

/// 0.6.0-C. A player-vs-player attempt to take one block. The attacking squad
/// is committed at start and the fight lands after the warning window.
enum TurfPushStatus {
  PENDING
  LANDED
}

model TurfPush {
  id String @id @default(cuid())

  roundId String
  round   Round  @relation(fields: [roundId], references: [id], onDelete: Cascade)

  turfId String
  turf   Turf   @relation(fields: [turfId], references: [id], onDelete: Cascade)

  attackerId         String
  attacker           RoundPlayer @relation("TurfPushAttacker", fields: [attackerId], references: [id], onDelete: Cascade)
  /// Alliance snapshots make shared revenge stable if either player later leaves.
  attackerAllianceId String?

  /// Holder when the push started. The block may be abandoned before it lands.
  defenderId         String
  defender           RoundPlayer @relation("TurfPushDefender", fields: [defenderId], references: [id], onDelete: Cascade)
  defenderAllianceId String?

  squad              Int
  /// Morale and the exact guns committed from home.
  attackerCrew       Json
  turnsSpent         Int
  actionId           String
  startedAt          DateTime
  landsAt            DateTime
  status             TurfPushStatus   @default(PENDING)
  settledAt          DateTime?
  /// True only when this push actually transferred the block to the attacker.
  captured           Boolean          @default(false)
  result             Json?
  attackerCreditedAt DateTime?
  alliesCalledAt     DateTime?
  /// Public turf-feed claim, parallel to RaidBattle.discordPostedAt.
  discordPostedAt    DateTime?
  /// 0.9.0-G. When the holder was told their block is being pushed (once their Lookouts saw it),
  /// and when their alliance was told about the call for help.
  defenderAlertedAt  DateTime?
  alliesAlertedAt    DateTime?
  /// Private notification collection is independent from the public feed.
  alertsCollectedAt  DateTime?
  backups            TurfPushBackup[]

  @@unique([attackerId, actionId])
  @@index([turfId, status])
  @@index([roundId, status, landsAt])
  @@index([roundId, captured, settledAt(sort: Desc)])
  @@index([alertsCollectedAt, settledAt])
  @@index([attackerId, turfId, startedAt(sort: Desc)])
  @@index([attackerId, captured, settledAt(sort: Desc)])
  @@index([defenderAllianceId, attackerId, captured, settledAt(sort: Desc)])
  @@index([attackerId, attackerCreditedAt])
}

/// Real home/alliance help committed to a pending turf push. C landing decides
/// whether an ally's uncertain reinforcement actually arrives.
model TurfPushBackup {
  id String @id @default(cuid())

  pushId String
  push   TurfPush @relation(fields: [pushId], references: [id], onDelete: Cascade)

  playerId String
  player   RoundPlayer @relation(fields: [playerId], references: [id], onDelete: Cascade)

  /// OWNER or ALLY.
  kind       String
  thugs      Int
  crew       Json
  sentAt     DateTime
  showedUp   Boolean?
  wounded    Int       @default(0)
  creditedAt DateTime?

  @@unique([pushId, playerId])
  @@index([playerId, creditedAt])
}

/// 0.6.0-E. One continuous stretch where a crew held a block with one alliance
/// identity. Alliance membership changes split the segment so old hours never move
/// retroactively to a new alliance.
model TurfHoldSegment {
  id String @id @default(cuid())

  roundId String
  round   Round  @relation(fields: [roundId], references: [id], onDelete: Cascade)

  turfId String
  turf   Turf   @relation(fields: [turfId], references: [id], onDelete: Cascade)

  holderId String
  holder   RoundPlayer @relation(fields: [holderId], references: [id], onDelete: Cascade)

  holderPublicPimpId Int
  holderName         String

  /// Snapshot only. We deliberately do not FK this because disband/rename history must survive.
  allianceId   String?
  allianceName String?
  allianceTag  String?

  startedAt DateTime
  endedAt   DateTime?

  createdAt DateTime @default(now())

  @@index([roundId, holderId, startedAt])
  @@index([roundId, allianceId, startedAt])
  @@index([turfId, endedAt])
}

/// 0.6.0-E. One durable alliance city-control change. Snapshot names/tags keep
/// history readable if an alliance later renames or disbands.
model TurfControlEvent {
  id String @id @default(cuid())

  roundId String
  round   Round  @relation(fields: [roundId], references: [id], onDelete: Cascade)

  cityId String
  city   City   @relation(fields: [cityId], references: [id], onDelete: Cascade)

  previousAllianceId   String?
  previousAllianceName String?
  previousAllianceTag  String?
  nextAllianceId       String?
  nextAllianceName     String?
  nextAllianceTag      String?

  previousBlocksHeld Int @default(0)
  nextBlocksHeld     Int @default(0)
  blocksTotal        Int

  happenedAt        DateTime
  discordPostedAt   DateTime?
  alertsCollectedAt DateTime?

  @@index([roundId, happenedAt(sort: Desc)])
  @@index([discordPostedAt, happenedAt])
  @@index([alertsCollectedAt, happenedAt])
}

/// 0.6.0-F. One seeded late-round Federal sweep. The target and clock are fixed per
/// round, so the warning and the sweep can be replayed/idempotently claimed by Discord.
model TurfCrackdown {
  id String @id @default(cuid())

  roundId String @unique
  round   Round  @relation(fields: [roundId], references: [id], onDelete: Cascade)

  cityId String
  city   City   @relation(fields: [cityId], references: [id], onDelete: Cascade)

  warningAt DateTime
  sweepAt   DateTime
  sweptAt   DateTime?

  holdersAffected Int  @default(0)
  thugsPickedUp   Int  @default(0)
  /// Per-holder result snapshots for receipts/feed summaries.
  results         Json @default("[]")

  warningDiscordPostedAt DateTime?
  sweepDiscordPostedAt   DateTime?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([warningAt])
  @@index([sweepAt, sweptAt])
  @@index([warningDiscordPostedAt, warningAt])
  @@index([sweepDiscordPostedAt, sweepAt])
}

/// 0.6.0-B. The daily turf-tax cap is per payer and holder. The worker's burn is not
/// stored here; only the minted holder share needs a cap and a dashboard/history read.
model TurfTaxLedger {
  id String @id @default(cuid())

  roundId String
  round   Round  @relation(fields: [roundId], references: [id], onDelete: Cascade)

  payerId String
  payer   RoundPlayer @relation("TurfTaxPayer", fields: [payerId], references: [id], onDelete: Cascade)

  holderId String
  holder   RoundPlayer @relation("TurfTaxHolder", fields: [holderId], references: [id], onDelete: Cascade)

  /// UTC calendar day, stored at midnight.
  day DateTime

  mintedCents   BigInt @default(0)
  /// House-minted tax already credited to the holder's home cash or, in 0.6.0-D, an outpost box.
  creditedCents BigInt @default(0)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([roundId, payerId, holderId, day])
  @@index([roundId, holderId, day])
}

// ---------------------------------------------------------------------------
// Idempotency
// ---------------------------------------------------------------------------

/// Short-lived record of a completed resource-changing action. A repeated
/// actionId replays the stored result instead of executing twice.
model ProcessedAction {
  id String @id @default(cuid())

  /// Client generated. Scoped to the player, so one player's action id can
  /// never collide with or block another's.
  actionId String

  roundPlayerId String
  roundPlayer   RoundPlayer @relation(fields: [roundPlayerId], references: [id], onDelete: Cascade)

  action String
  result Json

  createdAt DateTime @default(now())
  expiresAt DateTime

  @@unique([roundPlayerId, actionId])
  @@index([expiresAt])
}

/// 1.0.0-E. Something the server refused because it looked like an exploit or a bug:
/// a database guard, a broken invariant, a hit between linked accounts, a flood of
/// refused requests. The same thing from the same account on the same day folds into
/// one row. No foreign keys: a flag outlives what it points at.
model ExploitFlag {
  id            String   @id @default(cuid())
  fingerprint   String   @unique
  kind          String
  /// info, warning or critical.
  severity      String   @default("warning")
  accountId     String?
  roundPlayerId String?
  roundId       String?
  route         String?
  message       String
  detail        Json?
  occurrences   Int      @default(1)
  firstSeenAt   DateTime @default(now())
  lastSeenAt    DateTime @default(now())

  reviewedAt         DateTime?
  reviewedByUsername String?
  /// dismissed or actioned.
  resolution         String?
  reviewNote         String?

  @@index([reviewedAt, lastSeenAt(sort: Desc)])
  @@index([accountId, lastSeenAt(sort: Desc)])
}

/// 1.1.0-D. A block war against a player-held block: declared, opened with a fight, then a
/// siege that builds Control until the attacker wins, or the holder breaks it, concedes, or
/// the time limit runs out. Everything is settled lazily, like turf pushes.
model BlockWar {
  id String @id @default(cuid())

  roundId String
  round   Round  @relation(fields: [roundId], references: [id], onDelete: Cascade)

  turfId String
  turf   Turf   @relation(fields: [turfId], references: [id], onDelete: Cascade)

  attackerId         String
  attacker           RoundPlayer @relation("BlockWarAttacker", fields: [attackerId], references: [id], onDelete: Cascade)
  attackerAllianceId String?
  defenderId         String
  defender           RoundPlayer @relation("BlockWarDefender", fields: [defenderId], references: [id], onDelete: Cascade)
  defenderAllianceId String?

  goal       BlockWarGoal
  status     BlockWarStatus @default(OPENING)
  actionId   String
  declaredAt DateTime
  endsBy     DateTime

  /// Control 0..100, as of `controlAt`, while a siege is on.
  control        Float     @default(0)
  controlAt      DateTime?
  siegeSince     DateTime?
  /// Every hour of siege so far, and every fight, for fatigue.
  siegeHours     Float     @default(0)
  fights         Int       @default(0)
  /// After a lost assault or a broken siege, when the declarer may assault again.
  nextAssaultAt  DateTime?
  fatigueAtStart Float     @default(0)

  /// One ally slot per side for the whole war, the cut its caller promised (0..0.5), the
  /// call's open window, and whether the ally actually fought.
  attackerAllyId     String?
  defenderAllyId     String?
  attackerCut        Float     @default(0)
  defenderCut        Float     @default(0)
  attackerCallUntil  DateTime?
  defenderCallUntil  DateTime?
  attackerAllyFought Boolean   @default(false)
  defenderAllyFought Boolean   @default(false)

  winner                  BlockWarSide?
  /// CONTROL, CONCEDED, WITHDREW, TIMEOUT, ABANDONED or CUTOFF.
  endReason               String?
  endedAt                 DateTime?
  result                  Json?
  /// The public Discord street feed: when the declaration and the end were posted.
  discordDeclaredPostedAt DateTime?
  discordEndedPostedAt    DateTime?

  squads    BlockWarSquad[]
  fightRows BlockWarFight[]

  @@unique([attackerId, actionId])
  @@index([turfId, status])
  @@index([roundId, status])
  @@index([attackerId, status])
  @@index([defenderId, status])
}

/// A fight in a block war: the opening fight, a re-assault after a lost one, or the holder's
/// attempt to break the siege. It lands at `landsAt`, after the warning or muster window.
model BlockWarFight {
  id String @id @default(cuid())

  warId String
  war   BlockWar @relation(fields: [warId], references: [id], onDelete: Cascade)

  kind      BlockWarFightKind
  startedAt DateTime
  landsAt   DateTime
  /// PENDING, LANDED or CANCELLED.
  status    String            @default("PENDING")
  result    Json?

  @@index([warId, status])
}

/// Thugs (and their guns) a crew has committed to a block war: the declarer's squad, the
/// holder's backup, an ally. They leave home while committed, like a push squad, and come
/// back through the player's own credit pass, so nobody else's row is written for them.
model BlockWarSquad {
  id String @id @default(cuid())

  warId String
  war   BlockWar @relation(fields: [warId], references: [id], onDelete: Cascade)

  playerId String
  player   RoundPlayer @relation(fields: [playerId], references: [id], onDelete: Cascade)

  side            BlockWarSide
  /// DECLARER, HOLDER or ALLY.
  role            String
  /// The fight it was sent to, or null for the occupying squad's siege presence.
  fightId         String?
  sent            Int
  /// Still deployed. Wounded thugs go home as they are hurt; the rest when it is released.
  thugs           Int
  wounded         Int          @default(0)
  /// Morale and the exact guns committed from home.
  crew            Json
  active          Boolean      @default(true)
  recoverAt       DateTime?
  /// On a Take, the declarer's thugs that stay on as the new corner crew.
  posted          Int          @default(0)
  /// Paid with the squad's final credit: Sack loot or an ally's cut, and Heat.
  payoutCents     BigInt       @default(0)
  heat            Int          @default(0)
  /// What the owner's credit pass has already taken back.
  creditedThugs   Int          @default(0)
  creditedWounded Int          @default(0)
  gunsCreditedAt  DateTime?
  createdAt       DateTime     @default(now())

  @@index([playerId, active])
  @@index([warId, active])
}

enum BlockWarGoal {
  TAKE
  SACK
}

enum BlockWarStatus {
  OPENING
  SIEGE
  BETWEEN
  ENDED
}

enum BlockWarSide {
  ATTACKER
  DEFENDER
}

enum BlockWarFightKind {
  OPENING
  ASSAULT
  BREAK
}

// ---------------------------------------------------------------------------
// Law enforcement (1.3.0)
// ---------------------------------------------------------------------------

/// 1.3.0-A. One city's Case on one player: what that city's police have on them. Stored
/// in hundredths of a point (the ruleset's caseMax x 100 at most). Private to its player,
/// and gone with the round like every RoundPlayer row. Heat is unaffected by it.
model PlayerCase {
  id String @id @default(cuid())

  roundPlayerId String
  roundPlayer   RoundPlayer @relation(fields: [roundPlayerId], references: [id], onDelete: Cascade)

  cityId String
  city   City   @relation(fields: [cityId], references: [id], onDelete: Cascade)

  caseHundredths Int       @default(0)
  /// The Wanted stage the Case last read as; a rise logs CASE_STAGE_UP once.
  stage          String    @default("QUIET")
  /// 1.3.0-B. When `caseHundredths` was last brought up to date. Cooling after it is worked
  /// out on read and written as a COOLING receipt with the next change.
  caseAt         DateTime  @default(now())
  /// 1.3.0-B. The player's last act that added evidence here. Cooling starts a quiet spell after it.
  lastEvidenceAt DateTime?
  /// 1.3.0-B. Cash moved in this city on `reportDay` (UTC), for currency reports.
  reportDay      String?
  reportCents    BigInt    @default(0)
  /// 1.3.0-F. The highest stage this Case has reached since it last left Quiet, and when it
  /// left Quiet. Both reset when it cools back to Quiet. Ledger's Jobs read them.
  peakStage      String    @default("QUIET")
  openedAt       DateTime?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([roundPlayerId, cityId])
  @@index([cityId])
}

/// 1.3.0-A. An itemised, immutable change to a Case: why it exists. Keyed on the act that
/// caused it, so a retried action or a re-run settle never adds evidence twice.
model PlayerCaseReceipt {
  id String @id @default(cuid())

  roundPlayerId String
  roundPlayer   RoundPlayer @relation(fields: [roundPlayerId], references: [id], onDelete: Cascade)

  cityId String
  city   City   @relation(fields: [cityId], references: [id], onDelete: Cascade)

  /// What drew it: SCOUT, PRODUCE, RUN_SALE, COMBAT, CONVOY, TORCH, SACK, RACKETS, CRACKDOWN,
  /// and from 1.3.0-B BUST, ARREST, ROAD_STOP, HIJACK, CURRENCY_REPORT, LAUNDERING and COOLING.
  source              String
  sourceKey           String
  /// Heat the act drew, before the Heat meter's cap.
  heat                Float
  deltaHundredths     Int
  caseAfterHundredths Int
  stageAfter          String
  /// 1.3.0-B. This change took the Case to a higher stage; the alert collector tells the player.
  stageUp             Boolean   @default(false)
  alertsCollectedAt   DateTime?
  createdAt           DateTime  @default(now())

  @@unique([roundPlayerId, sourceKey])
  @@index([stageUp, alertsCollectedAt])
  @@index([roundPlayerId, createdAt(sort: Desc)])
  @@index([roundPlayerId, cityId, createdAt(sort: Desc)])
}

/// 1.3.0-C. A warrant a city's police drafted when the player's Case there reached the Warrant
/// stage. It names one target and is served at `servesAt` unless answered first. A personal
/// warrant past `servesAt` waits (WAITING) until the boss is in that city, or the round ends.
model PlayerWarrant {
  id String @id @default(cuid())

  roundPlayerId String
  roundPlayer   RoundPlayer @relation(fields: [roundPlayerId], references: [id], onDelete: Cascade)

  cityId String
  city   City   @relation(fields: [cityId], references: [id], onDelete: Cascade)

  /// HIDEOUT, BUSINESS or PERSONAL.
  target     String
  businessId String?
  business   Business? @relation(fields: [businessId], references: [id], onDelete: SetNull)

  /// OPEN, WAITING, SERVED, LAWYERED, or (1.3.0-D) QUASHED by a District Attorney.
  status     String    @default("OPEN")
  draftedAt  DateTime
  servesAt   DateTime
  resolvedAt DateTime?
  /// What serving or answering it did: seizures, fines, the shut window, the lock-up, or the fee.
  outcome    Json      @default("{}")

  /// Alert collection markers, one per event the player is told about.
  draftAlertedAt    DateTime?
  waitingAlertedAt  DateTime?
  resolvedAlertedAt DateTime?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([roundPlayerId, status])
  @@index([status, servesAt])
  @@index([cityId])
  @@index([businessId])
}

/// 1.3.0-D. A corrupt official on one player's payroll in one city: a Precinct Captain, a
/// District Attorney, a Judge or a Customs Officer. Paid by the week; works only while paid.
/// Every favor adds exposure; past the line Internal Affairs opens a file, and an official
/// still on the books when `stingAt` comes is stung, which ends them and adds evidence.
model PlayerOfficial {
  id String @id @default(cuid())

  roundPlayerId String
  roundPlayer   RoundPlayer @relation(fields: [roundPlayerId], references: [id], onDelete: Cascade)

  cityId String
  city   City   @relation(fields: [cityId], references: [id], onDelete: Cascade)

  /// CAPTAIN, DA, JUDGE or CUSTOMS.
  role         String
  /// ACTIVE (working while `paidUntil` is ahead), CUT (let go) or STUNG (caught by Internal Affairs).
  status       String    @default("ACTIVE")
  hiredAt      DateTime
  paidUntil    DateTime
  /// Exposure points from favors. Starts again from zero with each new hire.
  exposure     Int       @default(0)
  /// Internal Affairs opened a file at `iaOpenedAt`; the sting lands at `stingAt` unless cut first.
  iaOpenedAt   DateTime?
  stingAt      DateTime?
  /// A DA can quash again from here.
  quashReadyAt DateTime?
  endedAt      DateTime?

  /// Alert collection markers.
  iaAlertedAt    DateTime?
  stungAlertedAt DateTime?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([roundPlayerId, cityId, role])
  @@index([status, stingAt])
  @@index([cityId])
}

/// 1.3.0-D. A tip bought from an informant: information, never protection. SWEEP names the
/// federal sweep's city and time before it is public; CITY names a city's police lines.
model PlayerTip {
  id String @id @default(cuid())

  roundPlayerId String
  roundPlayer   RoundPlayer @relation(fields: [roundPlayerId], references: [id], onDelete: Cascade)

  kind    String
  cityId  String?
  city    City?   @relation(fields: [cityId], references: [id], onDelete: Cascade)
  payload Json    @default("{}")

  createdAt DateTime @default(now())

  @@index([roundPlayerId, createdAt(sort: Desc)])
  @@index([cityId])
}

/// 1.4.0-B. A player's seasonal standing with one faction. Starts at zero every round; only the
/// player's own one-time Jobs add to it, each with a receipt.
model PlayerFactionStanding {
  id String @id @default(cuid())

  roundPlayerId String
  roundPlayer   RoundPlayer @relation(fields: [roundPlayerId], references: [id], onDelete: Cascade)

  /// KINGS, OUTFIT, ROAD_SAINTS, CARTEL_LINE or CIVIC_HANDSHAKE.
  factionKey          String
  points              Int       @default(0)
  /// The tier the standing last read as; a rise logs FACTION_TIER_UP once.
  tier                String    @default("UNKNOWN")
  /// 1.4.0-F. When the player reached Inner Circle, and when the street feed posted it.
  innerCircleAt       DateTime?
  innerCirclePostedAt DateTime?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([roundPlayerId, factionKey])
  @@index([innerCirclePostedAt, innerCircleAt])
}

/// 1.4.0-B. An immutable change to faction standing, keyed on the act that caused it so a retry
/// never pays twice. The receipts always add up to the stored standing.
model PlayerFactionReceipt {
  id String @id @default(cuid())

  roundPlayerId String
  roundPlayer   RoundPlayer @relation(fields: [roundPlayerId], references: [id], onDelete: Cascade)

  factionKey  String
  /// JOB (a one-time Job), CONTRACT (a sponsored board contract, 1.4.0-C), later ADMIN and others.
  source      String
  sourceKey   String
  delta       Int
  pointsAfter Int
  tierAfter   String

  createdAt DateTime @default(now())

  @@unique([roundPlayerId, sourceKey])
  @@index([roundPlayerId, factionKey, createdAt])
}

/// 1.4.0-D. A Connected nudge taking effect: which faction, which nudge, the percent the ruleset
/// pinned, and what it saved. Keyed on the act it applied to, so a retried action or a re-run
/// settle never logs twice. Read-only to play; G's admin view audits it.
model PlayerFactionPerkUse {
  id String @id @default(cuid())

  roundPlayerId String
  roundPlayer   RoundPlayer @relation(fields: [roundPlayerId], references: [id], onDelete: Cascade)

  factionKey String
  /// CORNER_UPKEEP, TOMMY_WEAPONS, BODYGUARD_TICKETS, PIP_PRODUCT or OFFICIAL_EXPOSURE.
  kind       String
  sourceKey  String
  percent    Int
  /// What it saved: { cents }, { beer, product } or { exposure }.
  saved      Json

  createdAt DateTime @default(now())

  @@unique([roundPlayerId, sourceKey])
  @@index([roundPlayerId, factionKey, createdAt])
}

/// 1.4.0-D. An early warning from a faction the player is Trusted with that has reached the bell.
/// Keyed on the warning itself (a shield, a run's leg, a drought, a Case nearing a stage), so the
/// alert sweep sends each warning once however often it looks.
model PlayerFactionWarning {
  id String @id @default(cuid())

  roundPlayerId String
  roundPlayer   RoundPlayer @relation(fields: [roundPlayerId], references: [id], onDelete: Cascade)

  factionKey        String
  warningKey        String
  /// What the warning said and where it pointed, for the push and Discord alert.
  text              String    @default("")
  href              String    @default("/game/quests#factions")
  /// When the alert collector turned it into push and Discord alerts.
  alertsCollectedAt DateTime?

  createdAt DateTime @default(now())

  @@unique([roundPlayerId, warningKey])
  @@index([alertsCollectedAt, createdAt])
}
