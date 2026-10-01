import type { AllianceTagDto } from './alliance.js';

/** 0.3.0-D. Limits that keep the wire and the rolodex small. Not balance, so they live here. */
export const WIRE_POST_MAX = 280;
export const WIRE_COOLDOWN_SECONDS = 15;
export const WIRE_PAGE_SIZE = 50;
export const CONTACTS_MAX = 100;
export const CONTACT_NOTE_MAX = 280;

export type ContactKindDto = 'CONTACT' | 'ENEMY';
export type ContactCategoryDto = ContactKindDto | 'ALLIANCE' | 'BLOCKED';
export type WirePostKindDto = 'MESSAGE' | 'ANNOUNCEMENT';

export type AllianceCoordinationCardKindDto =
  | 'SHARED_RECON'
  | 'TURF_ACTIVITY'
  | 'REINFORCEMENT_REQUEST'
  | 'CONVOY_SIGHTING'
  | 'CITY_CONTROL'
  | 'RECRUITMENT';

export interface AllianceCoordinationCardDto {
  id: string;
  kind: AllianceCoordinationCardKindDto;
  title: string;
  detail: string;
  at: string;
  actionLabel: string;
  href: string;
  tone: 'info' | 'warn' | 'good';
}

export interface ContactIntelDto {
  payback: {
    available: boolean;
    until: string | null;
    source: 'direct' | 'alliance' | null;
  };
  sharedAlliance: boolean;
  lastBattle: {
    kind: string;
    at: string;
    role: 'ATTACKER' | 'DEFENDER';
    won: boolean;
    cashChangeCents: number;
    yourWounds: number;
    opponentWounds: number;
  } | null;
  lastRecon: {
    at: string;
    expiresAt: string;
    strengthBand: 'Weaker' | 'Comparable' | 'Stronger' | 'Unknown';
    strength: number;
    cashBand: string;
  } | null;
  turf: {
    lastAt: string | null;
    blocksWon: number;
    blocksLost: number;
  };
}

export interface WirePostDto {
  id: string;
  author: { publicPimpId: number; displayName: string };
  body: string;
  kind: WirePostKindDto;
  pinned: boolean;
  createdAt: string;
  /** You wrote it, or you lead the alliance. */
  canRemove: boolean;
  /** Only leaders can pin announcements. */
  canPin: boolean;
  isYours: boolean;
}

/** GET /api/game/alliance/wire - only for current members. */
export interface AllianceWireDto {
  pinnedAnnouncement: WirePostDto | null;
  cards: AllianceCoordinationCardDto[];
  posts: WirePostDto[];
  nextBefore: string | null;
  /** Set while your last post is still cooling down. */
  cooldownUntil: string | null;
  canPostAnnouncement: boolean;
  roundOpen: boolean;
}

export interface ContactDto {
  publicPimpId: number;
  displayName: string;
  alliance: AllianceTagDto | null;
  kind: ContactKindDto;
  categories: ContactCategoryDto[];
  blocked: boolean;
  note: string;
  addedAt: string;
  intel: ContactIntelDto;
  /** Their public standing right now. Null once the account is no longer active. */
  standing: {
    netWorthCents: number;
    nationalRank: number;
    city: string;
    lastActiveAt: string;
  } | null;
}

export interface BlockedRolodexDto {
  publicPimpId: number;
  displayName: string;
  alliance: AllianceTagDto | null;
  blockedAt: string;
  isContact: boolean;
}

export interface ContactsDto {
  contacts: ContactDto[];
  blocked: BlockedRolodexDto[];
  counts: Record<ContactCategoryDto | 'ALL', number>;
  max: number;
}

export interface ContactLookupDto {
  contact: ContactDto | null;
  isYou: boolean;
  full: boolean;
}

/** 0.9.0-A. Coarse by design: directory browsing never receives exact activity timestamps. */
export type PlayerActivityBand = 'online' | 'recent' | 'away' | 'offline';
export type PlayerDirectoryView = 'all' | 'city' | 'alliance' | 'near' | 'encountered' | 'active';

export interface PlayerDirectoryEntryDto {
  publicPimpId: number;
  displayName: string;
  /** 0.9.0-F. Optional account-level crew name. */
  crewName: string | null;
  alliance: AllianceTagDto | null;
  city: { slug: string; name: string };
  netWorthCents: number;
  nationalRank: number;
  activity: PlayerActivityBand;
  isYou: boolean;
  isContact: boolean;
}

export interface PlayerDirectoryDto {
  generatedAt: string;
  view: PlayerDirectoryView;
  query: string;
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  counts: {
    all: number;
    city: number;
    alliance: number;
    near: number;
    encountered: number;
    active: number;
  };
  contactSlots: {
    used: number;
    max: number;
  };
  players: PlayerDirectoryEntryDto[];
}

export interface AdminWirePostDto {
  id: string;
  author: { publicPimpId: number; displayName: string; roundPlayerId: string };
  body: string;
  kind: WirePostKindDto;
  pinned: boolean;
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
  /** 0.5.0-C. Arrests at home: where they start, the chance on the next trip, and what one costs. Null without arrests. */
  arrest: {
    startsAt: number;
    chance: number;
    productSeizedFraction: number;
    cashFineFraction: number;
    heatDrop: number;
    downtimeMinutes: number;
  } | null;
  /** 0.5.0-C. Locked up after an arrest until then; null when free. */
  lockedUntil: string | null;
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
  /** 0.5.0-C. Arrested instead of busted: a bigger seizure and fine, and locked up until `lockedUntil`. */
  arrested?: boolean;
  arrestChance?: number;
  lockedUntil?: string | null;
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

/** 0.5.0-A. How much of a product Pip has in a city. */
export type SupplyLevelDto = 'PLENTIFUL' | 'NORMAL' | 'LOW' | 'OUT';

export interface TurfGunsDto {
  pistols: number;
  shotguns: number;
  tek9s: number;
  ak47s: number;
  total: number;
}

export interface TurfOutpostDto {
  cashCents: number;
  beer: number;
  products: Record<string, number>;
}

export interface TurfBlockDto {
  city: string;
  district: 'CASINO' | 'NIGHTCLUB' | 'LOW_RENT' | 'URBAN_GHETTO' | 'WINO_SLUMS';
  districtName: string;
  /** Null means the block is either vacant or held by the locals; localsReclaimAt distinguishes them. */
  holder: {
    publicPimpId: number;
    displayName: string;
    alliance: AllianceTagDto | null;
  } | null;
  isMine: boolean;
  cornerThugs: number;
  cornerMinimumThugs: number;
  cornerGuns: TurfGunsDto;
  /** 0.6.0-D. Present only for an away block this player owns. */
  outpost: TurfOutpostDto | null;
  localsThugs: number;
  localsFullThugs: number;
  /** Future while the block is vacant; null once the locals are back or a player holds it. */
  localsReclaimAt: string | null;
  heldSince: string | null;
  shieldUntil: string | null;
  presenceTurns: number;
  claimBlockedReason: string | null;
  /** 0.6.0-C. Visible pending push: always to its attacker, and to the holder once Lookouts spot it. */
  push: TurfPushDto | null;
  /** Payback against this holder is live. It waives presence, never the hold shield. */
  revengeAvailable: boolean;
  revengeUntil: string | null;
  pushBlockedReason: string | null;
  /** 1.1.0-A. The block's three business lots, or null before business rounds. */
  businesses: TurfBusinessLotDto[] | null;
  /** 1.1.0-B. How many lots the block has open, from its tier. Null when nobody holds it. */
  businessTier: { tier: 'FOOTHOLD' | 'ESTABLISHED' | 'STRONGHOLD'; lotsOpen: number } | null;
}

/** 1.1.0-A. One business lot on a block. Level 0 is an empty lot. */
export interface TurfBusinessLotDto {
  lot: number;
  kind: string;
  name: string;
  level: number;
  maxLevel: number;
  /** This city's signature business. */
  signature: boolean;
  /** 1.1.0-B. Who works it: thugs, or girls at a Strip Club. */
  staffKind: 'THUGS' | 'WHORES';
  /** Your staff in it now; 0 for anyone else's business. */
  staff: number;
  /** Most staff the current level takes; it earns in proportion to how many it has. 0 on an empty lot. */
  requiredStaff: number;
  /** How many staff you want kept there (0 closes it). */
  staffTarget: number;
  /** Replace staff who desert or are lured, from the fit crew, up to the target. */
  autoStaff: boolean;
  /** Yours, staffed and earning. */
  open: boolean;
  /** Front income an hour at the current level, fully staffed, before supply. 0 on an empty lot. */
  incomeCentsPerHour: number;
  /** What it earns an hour with the staff it has now. */
  currentIncomeCentsPerHour: number;
  /** Your uncollected income; 0 for anyone else's business. */
  registerCents: number;
  registerCapCents: number;
  /** The next level, or null at the top. */
  nextLevel: { level: number; costCents: number; staff: number; incomeCentsPerHour: number } | null;
  /** Why you cannot build or upgrade here right now, or null. */
  buildBlockedReason: string | null;
  /** 1.1.0-C. The racket your business runs, or null. Only shown on your own business. */
  racket: BusinessRacketDto | null;
  /** The rackets this business can run (yours only; null otherwise or before racket rounds). */
  racketOptions: BusinessRacketDto[] | null;
  /** When the racket can next be switched, or null if it can now. */
  racketSwitchAt: string | null;
}

/** 1.1.0-C. One racket, as it runs (or would run) on this business right now. */
export interface BusinessRacketDto {
  key: string;
  name: string;
  description: string;
  /** 0..1: the business level's share of full strength times its staffing. */
  strength: number;
  /** Heat it draws an hour at this strength, before Wash & fold. */
  heatPerHour: number;
  /** Cash it adds to the register an hour at the current staffing, for cash rackets. */
  cashCentsPerHour: number;
}

export interface TurfPushDto {
  id: string;
  role: 'attacker' | 'defender' | 'ally';
  squad: number;
  startedAt: string;
  landsAt: string;
  alliesCalled: boolean;
  backupSent: boolean;
  canCallAllies: boolean;
}

export interface TurfBattleReportDto {
  id: string;
  city: string;
  cityName: string;
  district: TurfBlockDto['district'];
  districtName: string;
  settledAt: string;
  role: 'attacker' | 'defender' | 'ally';
  won: boolean;
  captured: boolean;
  unopposed: boolean;
  stale: boolean;
  attacker: { publicPimpId: number; displayName: string; allianceTag: string | null };
  defender: { publicPimpId: number; displayName: string; allianceTag: string | null };
  attackers: number;
  defenders: { corner: number; ownerBackup: number; allyCommitted: number; allyShowed: number };
  yourWounds: number;
  opponentWounds: number;
  /** An ally may commit but fail the ruleset's show-up roll. Null for attacker/defender. */
  showedUp: boolean | null;
  strength: { attacker: number; defender: number } | null;
  shieldUntil: string | null;
  revengeUntil: string | null;
  /** 0.6.0-D. Positive for the attacker, negative for the defender; empty on home turf. */
  outpostLoot: { cashCents: number; beer: number; products: Record<string, number> } | null;
}

export interface CityTurfDto {
  enabled: true;
  /** 1.1.0-B. Business costs and your registers in this city, or null before building rounds. */
  business: {
    buildTurnCost: number;
    staffTurnCost: number;
    collectTurnCost: number;
    /** Everything waiting in your registers, across your home blocks. */
    registerTotalCents: number;
    /** 1.1.0-C. Your rackets in this city, or null before racket rounds. */
    rackets: {
      switchTurnCost: number;
      switchCooldownHours: number;
      /** Heat your rackets draw an hour right now, after Wash & fold. */
      heatPerHour: number;
      /** Heat cools this much an hour on its own. */
      coolDownPerHour: number;
      launderedToday: number;
      dailyLaunderCap: number;
      launderedRound: number;
      roundLaunderCap: number;
    } | null;
  } | null;
  holdingEnabled: boolean;
  warsEnabled: boolean;
  /** 0.6.0-E. Public alliance control of this city, if one alliance holds the threshold. */
  control: {
    alliance: AllianceTagDto;
    blocksHeld: number;
    blocksTotal: number;
    share: number;
    isYours: boolean;
  } | null;
  presenceRequired: number;
  postTurnCost: number;
  pullTurnCost: number;
  pushTurnCost: number;
  pushWarningMinutes: number;
  homeCap: number;
  awayCap: number;
  heldAtHome: number;
  heldAway: number;
  blocks: TurfBlockDto[];
  /** Recent fights in this city that this player took part in, newest first. */
  reports: TurfBattleReportDto[];
}

export interface TurfTripDto {
  kind: 'own' | 'rival' | 'locals';
  holder: { publicPimpId: number; displayName: string } | null;
  holdBonusCents: number;
  taxPaidCents: number;
  taxMintedCents: number;
  linked: boolean;
  /** 0.6.0-E. This alliance controls the city, so this trip owed no street tax. */
  controlledCityExempt: boolean;
}

export interface TurfSummaryDto {
  enabled: true;
  blocksHeld: number;
  postedGuns: TurfGunsDto;
  taxEarnedTodayCents: number;
  taxPendingCents: number;
  taxPayersToday: number;
  dailyTaxCapCentsPerPayer: number;
}

/** 1.1.0-B. Building a business or taking it up a level. */
export interface BusinessBuildResult {
  district: TurfBlockDto['district'];
  districtName: string;
  lot: number;
  kind: string;
  name: string;
  level: number;
  staff: number;
  staffKind: 'THUGS' | 'WHORES';
  /** Staff sent in from home for this level. */
  staffAdded: number;
  costCents: number;
  turnsUsed: number;
}

/** 1.1.0-B. Setting a business's staff (0 closes it) and whether it refills itself. */
export interface BusinessStaffResult {
  district: TurfBlockDto['district'];
  districtName: string;
  lot: number;
  name: string;
  open: boolean;
  staff: number;
  maxStaff: number;
  autoStaff: boolean;
  /** Staff sent in (positive) or brought home (negative). */
  staffChange: number;
  staffKind: 'THUGS' | 'WHORES';
  turnsUsed: number;
}

/** 1.1.0-C. Setting, switching or shutting a business's racket. */
export interface BusinessRacketResult {
  district: TurfBlockDto['district'];
  districtName: string;
  lot: number;
  name: string;
  racket: string | null;
  racketName: string | null;
  previous: string | null;
  turnsUsed: number;
  switchAt: string;
}

/** 1.1.0-B. Emptying every register on the player's home blocks. */
export interface BusinessCollectResult {
  collectedCents: number;
  businesses: number;
  turnsUsed: number;
}

export interface TurfClaimResult {
  district: TurfBlockDto['district'];
  districtName: string;
  won: boolean;
  squad: number;
  localsThugs: number;
  cornerThugs: number;
  turnsUsed: number;
}
export interface TurfPostResult {
  district: TurfBlockDto['district'];
  districtName: string;
  posted: number;
  cornerThugs: number;
  turnsUsed: number;
}
export interface TurfPullResult {
  district: TurfBlockDto['district'];
  districtName: string;
  pulled: number;
  cornerThugs: number;
  released: boolean;
  turnsUsed: number;
}

/**
 * 0.5.0-A. One city as the Cities page shows it. What anyone can know without going:
 * its character, street talk, the roads and how the police lean. Pip's prices only
 * where the player knows them: home, and (0.5.0-B) cities their runs have seen.
 */
export interface CityCharacterDto {
  slug: string;
  name: string;
  /** "The Exchange". */
  trait: string;
  blurb: string;
  /** Always true, never a number. */
  talk: string[];
  isHome: boolean;
  /** Shortest drive from home, in drive hours and game minutes; null for home. */
  driveHours: number | null;
  gameMinutes: number | null;
  police: 'Light' | 'Average' | 'Heavy' | 'Heaviest';
  /** When busts start here, against home. Home gets the numbers in `heat`. */
  busts: 'much sooner' | 'sooner' | 'the same' | 'later' | 'much later';
  /** Home only. */
  heat: { dragStartsAt: number; bustStartsAt: number } | null;
  roads: Array<{ to: string; toName: string; name: string; driveHours: number; police: number; note: string | null }>;
  /** Pip's counter where the player knows it, or null where they have not been. */
  counter: {
    /** When they saw it; null for home, which is always current. */
    seenAt: string | null;
    /**
     * `stock` is what was on the player's shelf when the crew saw it; null at home, where Pip's store shows it.
     * `market` (0.5.0-C) is the high market's next unit each way, live at home and as seen elsewhere.
     */
    products: Array<{ key: string; supply: SupplyLevelDto | null; buyCents: number | null; sellCents: number | null; stock: number | null; market?: MarketPriceDto | null }>;
  } | null;
  /** 0.6.0-A. The five blocks in this city, or null before turf rounds. */
  turf: CityTurfDto | null;
}

/** 0.5.0-C. The high market for one product: the next unit bought and sold, and how many units move it 1%. */
export interface MarketPriceDto {
  buyCents: number;
  sellCents: number;
  depth: number;
}

/** 0.5.0-C. A glut or drought, where the player can see it. */
export interface PriceEventDto {
  kind: 'GLUT' | 'DROUGHT';
  product: string;
  endsAt: string;
}

/** 0.5.0-A. GET /api/game/cities. */
export interface CitiesDto {
  enabled: boolean;
  homeCity: string | null;
  products: Array<{ key: string; name: string }>;
  cities: CityCharacterDto[];
}

// --- 0.5.0-B runs ----------------------------------------------------------------

/** 0.5.0-B. One way from here to a city, with what it costs. */
export interface TravelRouteDto {
  index: number;
  cities: Array<{ slug: string; name: string }>;
  passesThrough: string[];
  driveHours: number;
  gameMinutes: number;
  /** Turns this costs now: out and home for a launch, the extra road for driving on. */
  turns: number;
  /** The worst police on the way; 1 is an ordinary road. */
  police: number;
  /** When the run would get there if it left now. */
  arriveAt: string;
}

/** 0.5.0-B. GET /api/game/travel/routes. */
export interface TravelRoutesDto {
  from: string;
  to: string;
  routes: TravelRouteDto[];
}

export interface RunStopDto {
  city: string;
  cityName: string;
  isHome: boolean;
  route: Array<{ slug: string; name: string }>;
  departAt: string;
  arriveAt: string;
  leaveAt: string | null;
}

export interface RunTradeDto {
  city: string;
  cityName: string;
  product: string;
  direction: 'buy' | 'sell';
  quantity: number;
  unitCents: number;
  totalCents: number;
  /** 0.5.0-C. Pip's counter or the high market. */
  venue: 'pip' | 'market';
  at: string;
}

/** 0.5.0-B. A run out on the road. */
export interface RunDto {
  id: string;
  launchedAt: string;
  lowRiders: number;
  escortThugs: number;
  cashCents: number;
  startCashCents: number;
  /** 0.6.0-D. Beer physically riding with the run. */
  beer: number;
  startBeer: number;
  capacity: number;
  cargo: Array<{ key: string; quantity: number; startQuantity: number }>;
  /** 0.5.0-E. The guns the escorts carry. A bust or an arrest takes them all. */
  guns: { PISTOL: number; SHOTGUN: number; TEK9: number; AK47: number };
  /** Trips B. The boss rides with this run. */
  bossAboard: boolean;
  /** Trips B. The hotel, with the boss aboard. Null on crew-only runs. */
  hotel: {
    /** What the next started hour costs where the run is (or will be). */
    hourCents: number;
    /** Everything the hotel has taken from the run's cash. */
    paidCents: number;
    /** Hours of the current stay paid so far. */
    hoursPaid: number;
  } | null;
  turnsSpent: number;
  stops: RunStopDto[];
  position: {
    phase: 'road' | 'town';
    stopIndex: number;
    city: string;
    cityName: string;
    from: string;
    fromName: string;
    /** Share of this leg driven, 0..1. */
    progress: number;
    road: { from: string; to: string; progress: number } | null;
    /** When it gets there (road), or when the window closes (town). */
    until: string;
  };
  /** Pip's counter and (0.5.0-C) the high market where the run is, while it is in town. */
  counter: {
    city: string;
    products: Array<{ key: string; supply: SupplyLevelDto | null; buyCents: number | null; sellCents: number | null; stock: number; nextAt: string | null; market: MarketPriceDto | null }>;
    /** A glut or drought in town right now. */
    event: PriceEventDto | null;
  } | null;
  trades: RunTradeDto[];
  /** 0.5.0-C. Stops, busts and arrests so far. */
  incidents: RunIncidentDto[];
}

/** 0.5.0-C. What went wrong on a run. */
export interface RunIncidentDto {
  kind: 'STOP' | 'BUST' | 'ARREST';
  city: string;
  cityName: string;
  /** The road, for a stop. */
  road: string | null;
  seized: Record<string, number>;
  fineCents: number;
  at: string;
}

/** What the street hears: market/supply swings and, from 0.6.0-C, turf changing hands. */
export interface WireItemDto {
  at: string;
  city: string;
  cityName: string;
  /** Null for turf/crackdown lines. */
  product: string | null;
  kind: 'GLUT' | 'DROUGHT' | 'SUPPLY' | 'TURF' | 'CRACKDOWN';
  /** For a supply item, where Pip's supply went. */
  supply: SupplyLevelDto | null;
  /** For an event, when it ends. */
  endsAt: string | null;
  text: string;
}

/** 0.5.0-B. What the last run brought home. */
export interface RunReceiptDto {
  id: string;
  launchedAt: string;
  returnedAt: string;
  cities: Array<{ slug: string; name: string }>;
  lowRiders: number;
  escortThugs: number;
  startCashCents: number;
  cashCents: number;
  startBeer: number;
  beer: number;
  cargo: Array<{ key: string; startQuantity: number; quantity: number }>;
  turnsSpent: number;
  /** Trips B. The boss rode along, and what the hotel took. */
  bossAboard: boolean;
  hotelCents: number;
  trades: RunTradeDto[];
  incidents: RunIncidentDto[];
}

/** 0.5.0-B. GET /api/game/travel: the map, what the crew knows, and the run. */
export interface TravelDto extends CitiesDto {
  runsEnabled: boolean;
  rules: {
    cargoPerLowRider: number;
    thugsPerLowRider: number;
    townWindowMinutes: number;
    turnsPerDriveHour: number;
    /** 0.5.0-C. Null without a live high market. */
    market: { spread: number; quoteTolerance: number } | null;
    /** 0.5.0-F. A run can buy on the home high market as it loads up. */
    homeMarketAtLaunch: boolean;
    /** 0.6.0-D. How many active runs this hideout may have. */
    runLimit: number;
    /** 0.6.0-D. Null before away turf boxes exist. */
    outposts: {
      cashCapCents: number; beerCap: number; productCap: number; transferTurnCost: number;
      lootShare: number; lootCashCapCents: number; lootBeerCap: number; lootProductCap: number;
    } | null;
  };
  /** What home has to load up with. */
  home: {
    cashCents: number;
    beer: number;
    lowRiders: number;
    fitThugs: number;
    turns: number;
    products: Array<{ key: string; quantity: number }>;
  };
  /** Backward-compatible primary run: the oldest active run, if any. */
  run: RunDto | null;
  /** 0.6.0-D Garage: every active run, oldest first. */
  runs: RunDto[];
  lastRun: RunReceiptDto | null;
  /** 0.5.0-C. The last day on the street wire, newest first. */
  wire: WireItemDto[];
  /** 0.5.0-D. Moving house. Null before 0.5.0-D. */
  relocation: RelocationDto | null;
  /** Trips A. The boss travels. Null on rounds without trips. */
  trips: TripPanelDto | null;
}

/** Trips A. Where the boss is along a trip. */
export type TripPhaseDto = 'outbound' | 'town' | 'inbound';

/** Trips A. A trip that is out. */
export interface TripDto {
  id: string;
  mode: 'FLY' | 'DRIVE';
  homeCity: string;
  city: string;
  cityName: string;
  phase: TripPhaseDto;
  /** When the current phase ends. */
  until: string;
  bankrollCents: number;
  startBankrollCents: number;
  ticketCents: number;
  hotelCents: number;
  departedAt: string;
  arrivesAt: string;
  stayUntil: string;
  returnsAt: string;
  /** What another extension block would cost right now, and why it cannot be bought if it cannot. */
  extend: { minutes: number; hotelCents: number; blockedReason: string | null };
  canHeadHome: boolean;
  /** Trips C. A hit your lookouts have spotted coming, and when it lands. */
  hitLandsAt: string | null;
  /** Trips D. Bodyguards with the boss, how many are wounded, and the guns rented for them. */
  bodyguards: number;
  woundedBodyguards: number;
  rentedGuns: { PISTOL: number; SHOTGUN: number; TEK9: number; AK47: number };
  gunRentCents: number;
  /** Trips D. Why guns cannot be rented right now, or null when they can. */
  rentBlockedReason: string | null;
  /** Trips D2. What airport security took, and the minutes it cost. */
  airportSeizedCents: number;
  airportDelayMinutes: number;
}

/** Trips A. The last trip home, as a receipt. */
export interface TripReceiptDto {
  id: string;
  city: string;
  cityName: string;
  startBankrollCents: number;
  bankrollCents: number;
  ticketCents: number;
  hotelCents: number;
  departedAt: string;
  returnedAt: string;
}

/** Trips A. The trip panel on Travel. */
export interface TripPanelDto {
  rules: {
    flightMinutes: number;
    ticketCents: number;
    carryOnCapCents: number;
    stayMinutes: number[];
    maxStayMinutes: number;
    extendMinutes: number;
    launchTurns: number;
    /** The lieutenant's share of Scout and Produce takes while the boss is away, 0..1. */
    lieutenantCut: number;
    /** Trips B. The boss can ride along with a run. Null before B. */
    rideAlong: { maxStayMinutes: number; crewCentsPerThugHour: number } | null;
    /** Trips D. Bodyguards on flights and gun rental in town. Null before D. */
    bodyguards: {
      max: number;
      ticketCents: number;
      lodgingCentsPerThugHour: number;
      gunRentCents: { PISTOL: number; SHOTGUN: number; TEK9: number; AK47: number };
    } | null;
  };
  /** Trips D. Whether this player has Tommy's out-of-town connect, and which guns they may rent. */
  gunConnect: { unlocked: boolean; weapons: Array<'PISTOL' | 'SHOTGUN' | 'TEK9' | 'AK47'> } | null;
  /** Trips D. Fit thugs at home who could fly as bodyguards. */
  fitThugs: number;
  /** Trips D2. Where the boss is in person right now, away from home. */
  presence: { city: string; cityName: string; via: 'trip' | 'run' } | null;
  /** Trips D2. Outposts the boss can walk where they are. */
  outpostsHere: Array<{ id: string; district: string; districtName: string; cashCents: number; moraleUntil: string | null; canCollect: boolean }>;
  /** Trips D2. Sit-downs: who the boss could sit down with here, invitations and truces. Null before D2. */
  sitDowns: {
    truceHours: number;
    candidates: Array<{ publicPimpId: number; displayName: string; allianceTag: string | null; how: 'lives here' | 'visiting' }>;
    incoming: Array<{ id: string; from: { publicPimpId: number; displayName: string }; cityName: string; expiresAt: string }>;
    outgoing: Array<{ id: string; to: { publicPimpId: number; displayName: string }; cityName: string; expiresAt: string }>;
    truces: Array<{ with: { publicPimpId: number; displayName: string }; until: string }>;
  } | null;
  /** Trips D2. What the airport means at the boss's Heat right now. Null before D2. */
  airport: {
    heat: number;
    /** With no bodyguards. */
    checkChance: number;
    seizePercent: number;
    delayMinutes: number;
    noFlyHeat: number;
    /** Heat each bodyguard adds for the check, and roughly what one more does to the chance now. */
    bodyguardHeat: number;
    checkChancePerBodyguard: number;
    /** The flight home is checked too. */
    checkHome: boolean;
  } | null;
  /** Trips B. The run the boss is riding with, if any. */
  bossRun: { runId: string; cityName: string } | null;
  /** Trips C. A beaten boss heals until then. */
  laidUpUntil: string | null;
  /** When flights close for the round. */
  cutoffAt: string;
  /** What stops any trip right now, in words; null when the boss can go. */
  blockedReason: string | null;
  blockedCode: string | null;
  blockedUntil: string | null;
  destinations: Array<{ slug: string; name: string; hotelCentsPerHour: number }>;
  trip: TripDto | null;
  lastTrip: TripReceiptDto | null;
}

/** Trips A. POST /api/game/travel/trip. */
export interface TripLaunchResult {
  tripId: string;
  city: string;
  cityName: string;
  ticketCents: number;
  hotelCents: number;
  bankrollCents: number;
  stayMinutes: number;
  turns: number;
  arrivesAt: string;
  stayUntil: string;
  returnsAt: string;
  /** Trips D. Bodyguards flying with the boss. */
  bodyguards: number;
  /** Trips D2. Pulled aside at the airport: what was taken and the minutes lost. */
  airport?: { seizedCents: number; delayMinutes: number };
}

/** Trips D2. POST /api/game/travel/trip/outpost. */
export interface TripOutpostVisitResult {
  outpostId: string;
  districtName: string;
  cityName: string;
  moraleUntil: string;
  collectedCents: number;
}

/** Trips D. POST /api/game/travel/trip/guns. */
export interface TripRentGunsResult {
  tripId: string;
  guns: { PISTOL: number; SHOTGUN: number; TEK9: number; AK47: number };
  rentCents: number;
  bankrollCents: number;
}

/** Trips A. POST /api/game/travel/trip/extend. */
export interface TripExtendResult {
  tripId: string;
  minutes: number;
  hotelCents: number;
  bankrollCents: number;
  stayUntil: string;
  returnsAt: string;
}

/** Trips A. POST /api/game/travel/trip/home. */
export interface TripHeadHomeResult {
  tripId: string;
  returnsAt: string;
}

export interface RelocationTurfPlanDto {
  /** Destination outposts that become normal home turf. */
  toHome: Array<{ district: TurfBlockDto['district']; districtName: string }>;
  /** Old-home blocks that stay owned as empty-box outposts. */
  toOutposts: Array<{ district: TurfBlockDto['district']; districtName: string }>;
  /** Old-home blocks released because the away cap is full. */
  released: Array<{ district: TurfBlockDto['district']; districtName: string }>;
}

/** 0.5.0-D. What a player's Heat would mean living in a city. */
export interface HeatThereDto {
  dragStartsAt: number;
  bustStartsAt: number;
  arrestStartsAt: number | null;
  /** What Heat would do to the take there, 0..1. */
  takeMultiplier: number;
  bustChance: number;
  arrestChance: number;
}

/** 0.5.0-D. The move screen. */
export interface RelocationDto {
  /** What a move costs right now after any Garage discount. */
  feeCents: number;
  /** Base relocation fee before the Garage discount. */
  baseFeeCents: number;
  /** 0.7.0-D. Garage discount applied to this quote. */
  garageFeeDiscountPercent: number;
  garageSavingsCents: number;
  feeFloorCents: number;
  feeNetWorthFraction: number;
  downtimeMinutes: number;
  cooldownHours: number;
  cooldownUntil: string | null;
  /** When moves close for the round. */
  cutoffAt: string;
  /** What stops any move right now, in words. */
  blockedReason: string | null;
  blockedCode: string | null;
  /** When that reason goes away on its own, if it does. */
  blockedUntil: string | null;
  /** The move on the road, if there is one. */
  moving: { from: string; fromName: string; to: string; toName: string; startedAt: string; arrivesAt: string } | null;
  heat: number;
  here: HeatThereDto | null;
  destinations: Array<{ slug: string; name: string; heat: HeatThereDto | null; reachable: boolean }>;
  /** 0.6.0-D. Exact turf conversion preview keyed by destination slug. */
  turfPlans: Record<string, RelocationTurfPlanDto>;
}

/** 0.5.0-D. POST /api/game/travel/move. */
export interface RelocationResult {
  from: string;
  fromName: string;
  to: string;
  toName: string;
  feeCents: number;
  /** 0.7.0-D. Garage discount on this move. */
  garageFeeDiscountPercent?: number;
  garageSavingsCents?: number;
  arrivesAt: string;
  /** 0.6.0-D. What will happen to held turf on arrival. */
  turfPlan: RelocationTurfPlanDto;
}

/** 0.5.0-B. What a launch did. */
export interface RunLaunchResult {
  runId: string;
  city: string;
  cityName: string;
  route: string[];
  arriveAt: string;
  leaveAt: string;
  backAt: string;
  turns: number;
  lowRiders: number;
  escortThugs: number;
  cashCents: number;
  beer: number;
  cargo: Record<string, number>;
  /** 0.5.0-F. What it bought on the home market on the way out, and what that cost. */
  market: Record<string, number>;
  marketCents: number;
  /** Trips B. The boss rides with it. */
  bossAboard: boolean;
}

export interface RunOutpostEstablishResult {
  outpostId: string;
  city: string;
  cityName: string;
  district: TurfBlockDto['district'];
  districtName: string;
  won: boolean;
  squad: number;
  localsThugs: number;
  cornerThugs: number;
  cashCents: number;
  beer: number;
  products: Record<string, number>;
  turnsUsed: number;
}

export interface RunOutpostTransferResult {
  outpostId: string;
  city: string;
  cityName: string;
  district: TurfBlockDto['district'];
  districtName: string;
  direction: 'deposit' | 'withdraw';
  cashCents: number;
  beer: number;
  products: Record<string, number>;
  box: TurfOutpostDto;
  runCashCents: number;
  runBeer: number;
  runCargo: Record<string, number>;
  turnsUsed: number;
}

export interface RunTradeResult {
  city: string;
  cityName: string;
  product: string;
  productName: string;
  direction: 'buy' | 'sell';
  quantity: number;
  unitCents: number;
  totalCents: number;
  runCashCents: number;
  held: number;
  trunkUnits: number;
  capacity: number;
  shelfStock: number;
  venue: 'pip' | 'market';
  /** 0.5.0-C. What selling did to Heat, and whether the town's police got the run. */
  heat: { before: number; added: number; after: number } | null;
  trouble: RunIncidentDto | null;
}

export interface RunMoveResult {
  city: string;
  cityName: string;
  /** When it gets there; for heading home, when it is back. */
  arriveAt: string;
  turns: number;
}

// --- 0.5.0-E convoys --------------------------------------------------------------

export type ConvoyReachKindDto = 'leaving' | 'town' | 'passing' | 'arriving';
export type ConvoyTailStatusDto = 'PENDING' | 'LANDED' | 'ESCAPED';

/** 0.5.0-E. A run your recon of the area found: in reach now, or coming through soon. Bands are as the recon saw them. */
export interface ConvoyTargetDto {
  runId: string;
  owner: { publicPimpId: number; displayName: string; allianceTag: string | null };
  /** The city you would hit it in. */
  city: string;
  cityName: string;
  /** Your squad from home, your own run, or a corner that only sees the traffic. */
  source: 'HOME' | 'RUN' | 'CORNER';
  /** Paid recon has bands/lookahead; a corner sighting is live-only and bandless. */
  sighting: 'RECON' | 'CORNER';
  /** The towns either side of this one on its route. Never where it is headed. */
  routeHere: { fromName: string | null; toName: string | null };
  kinds: ConvoyReachKindDto[];
  inReachFrom: string;
  inReachUntil: string;
  inReachNow: boolean;
  /** Where it is right now, for its progress bar. */
  position: { phase: 'road' | 'town'; cityName: string; progress: number };
  /** A look at it, while it is in reach: bands, never exact. */
  bands: { cash: 'light' | 'loaded' | 'heavy'; cargo: 'empty' | 'light' | 'half' | 'full'; escort: 'none' | 'light' | 'armed' | 'heavy' } | null;
  /** Live squad size that can actually start a tail from this sighting. */
  maxSquad: number;
  /** Someone already on its tail. */
  tailed: boolean;
  blockedReason: string | null;
}

/** 0.5.0-E. What a landed tail did, from one side's view. */
export interface ConvoyReportDto {
  escaped: boolean;
  /** Your side won. Null for a tail that never landed. */
  won: boolean | null;
  attackers: number;
  defenders: { escorts: number; homeBackup: number; sentBackup: number; allyBackup: number };
  yourWounds: number;
  opponentWounds: number;
  /** Signed for the side reading it. */
  cashCents: number;
  cargo: Record<string, number>;
  lowRider: number;
}

/** 0.5.0-E. A tail you are part of: yours on someone's run, one on your run, or one an ally called you to. */
export interface ConvoyTailDto {
  id: string;
  role: 'attacker' | 'owner' | 'ally';
  status: ConvoyTailStatusDto;
  city: string;
  cityName: string;
  startedAt: string;
  landsAt: string;
  squad: number;
  source: 'HOME' | 'RUN';
  attacker: { publicPimpId: number; displayName: string };
  owner: { publicPimpId: number; displayName: string };
  /** Backup on its way so far: from the owner and from allies. */
  backup: { owner: number; allies: number };
  alliesCalled: boolean;
  /** The owner's backup: how many can ride, how long it takes, and why not. */
  sendBackup: { max: number; minutes: number; reason: string | null } | null;
  /** An ally's answer: how many they can send, and why not. */
  answer: { max: number; reason: string | null } | null;
  voided: boolean;
  report: ConvoyReportDto | null;
}

/** 0.5.0-E. GET /api/game/convoys. */
export interface ConvoysDto {
  enabled: boolean;
  rules: {
    warningMinutes: number;
    turnCost: number;
    squadCap: number;
    rehitMinutes: number;
    reconTurnCost: number;
    reconFreshMinutes: number;
    /** How far ahead your recon sees runs coming, with your lookouts. */
    lookaheadMinutes: number;
    /** How long before a hit your lookouts spot a tail on your run. */
    headsUpMinutes: number;
  } | null;
  /** Your last recon of the area, while it is still good. The targets are what it found. */
  recon: { seenAt: string; expiresAt: string } | null;
  /** What you can send from where you live. */
  squad: { fit: number; turns: number; city: string; cityName: string; blockedReason: string | null };
  /** What your own run can hit with, where it is. */
  run: { escorts: number; cityName: string } | null;
  targets: ConvoyTargetDto[];
  tails: ConvoyTailDto[];
  /** Trips C. Bosses visiting where you live that your recon spotted. Empty before C. */
  bosses: BossTargetDto[];
  /** Trips C. Hits on a boss you started or took, recent first. */
  bossHits: BossHitDto[];
}

/** Trips C. A boss visiting where you live, as your recon saw them. */
export interface BossTargetDto {
  tripId: string;
  owner: { publicPimpId: number; displayName: string; allianceTag: string | null };
  city: string;
  cityName: string;
  inTownFrom: string;
  inTownUntil: string;
  inTownNow: boolean;
  /** The bankroll in a band: light, loaded or heavy. */
  bankroll: 'light' | 'loaded' | 'heavy';
  /** A boss who flew in alone has nobody with them. */
  alone: boolean;
  /** Trips D. Their bodyguards in a band. */
  guards: 'none' | 'light' | 'armed';
  maxSquad: number;
  blockedReason: string | null;
}

/** Trips C. A hit on a boss, from either side. */
export interface BossHitDto {
  id: string;
  role: 'attacker' | 'owner' | 'ally';
  status: 'PENDING' | 'LANDED' | 'ESCAPED';
  cityName: string;
  startedAt: string;
  landsAt: string;
  squad: number;
  attacker: { publicPimpId: number; displayName: string };
  owner: { publicPimpId: number; displayName: string };
  /** Trips D2. Allies called, thugs sent so far, and what you can do about it. */
  alliesCalled: boolean;
  backup: number;
  /** The boss can call allies who live there. */
  canCallAllies: boolean;
  /** An ally who was called: how many they can send, or why not. */
  answer: { max: number; reason: string | null } | null;
  /** Once it has landed: whether the boss got away, and the cash that moved (+ for you, − against you). */
  report: {
    escaped: boolean;
    /** Trips D. The boss's bodyguards held the hit off. */
    held: boolean;
    cashCents: number;
    laidUpUntil: string | null;
    yourWounds: number;
    opponentWounds: number;
  } | null;
}

/** Trips C. POST /api/game/convoys/boss-hit. */
/** Trips D2. POST /api/game/convoys/boss-hit/backup. */
export interface BossHitBackupResult {
  hitId: string;
  thugs: number;
  landsAt: string;
}

export interface BossHitResult {
  hitId: string;
  landsAt: string;
  city: string;
  cityName: string;
  squad: number;
  turns: number;
}

export interface ConvoyTailResult {
  tailId: string;
  landsAt: string;
  city: string;
  cityName: string;
  squad: number;
  turns: number;
}

export interface ConvoyReconResult {
  found: number;
  /** Trips C. Visiting bosses spotted. */
  bosses?: number;
  lookaheadMinutes: number;
  expiresAt: string;
  turns: number;
}

export interface ConvoyBackupResult {
  tailId: string;
  thugs: number;
  landsAt: string;
}


export interface TurfPushStartResult {
  pushId: string;
  district: TurfBlockDto['district'];
  districtName: string;
  defender: { publicPimpId: number; displayName: string };
  squad: number;
  turnsUsed: number;
  startedAt: string;
  landsAt: string;
}

export interface TurfPushBackupResult {
  pushId: string;
  thugs: number;
  kind: 'OWNER' | 'ALLY';
  landsAt: string;
}

export interface TurfPushCallResult {
  pushId: string;
  called: number;
}
