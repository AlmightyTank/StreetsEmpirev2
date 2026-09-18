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

/** 0.5.0-A. How much of a product Pip has in a city. */
export type SupplyLevelDto = 'PLENTIFUL' | 'NORMAL' | 'LOW' | 'OUT';

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
    /** `stock` is what was on the player's shelf when the crew saw it; null at home, where Pip's store shows it. */
    products: Array<{ key: string; supply: SupplyLevelDto | null; buyCents: number | null; sellCents: number | null; stock: number | null }>;
  } | null;
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
  capacity: number;
  cargo: Array<{ key: string; quantity: number; startQuantity: number }>;
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
  /** Pip's counter where the run is, while it is in town. */
  counter: {
    city: string;
    products: Array<{ key: string; supply: SupplyLevelDto | null; buyCents: number | null; sellCents: number | null; stock: number; nextAt: string | null }>;
  } | null;
  trades: RunTradeDto[];
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
  cargo: Array<{ key: string; startQuantity: number; quantity: number }>;
  turnsSpent: number;
  trades: RunTradeDto[];
}

/** 0.5.0-B. GET /api/game/travel: the map, what the crew knows, and the run. */
export interface TravelDto extends CitiesDto {
  runsEnabled: boolean;
  rules: {
    cargoPerLowRider: number;
    thugsPerLowRider: number;
    townWindowMinutes: number;
    turnsPerDriveHour: number;
  };
  /** What home has to load up with. */
  home: {
    cashCents: number;
    lowRiders: number;
    fitThugs: number;
    turns: number;
    products: Array<{ key: string; quantity: number }>;
  };
  run: RunDto | null;
  lastRun: RunReceiptDto | null;
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
  cargo: Record<string, number>;
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
}

export interface RunMoveResult {
  city: string;
  cityName: string;
  /** When it gets there; for heading home, when it is back. */
  arriveAt: string;
  turns: number;
}
