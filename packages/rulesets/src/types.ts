/**
 * The ruleset contract.
 *
 * Every ruleset the engine can load provides exactly these knobs. Declaring
 * the shape here rather than deriving it from one concrete ruleset is what
 * lets a second ruleset carry different numbers, and what makes a missing knob
 * a compile error rather than a runtime surprise mid-round.
 */

/** A RoundPlayer column a store item or action can move. */
export type ResourceField =
  | 'whores'
  | 'thugs'
  | 'condoms'
  | 'medicine'
  | 'crack'
  | 'beer'
  | 'pistols'
  | 'shotguns'
  | 'tek9s'
  | 'ak47s'
  | 'lowRiders';

export type DistrictKey =
  | 'CASINO'
  | 'WINO_SLUMS'
  | 'LOW_RENT'
  | 'NIGHTCLUB'
  | 'URBAN_GHETTO';

export type StoreKey = 'CORNER' | 'TOMMY' | 'CHARLIE' | 'PIP';

export type WeaponKey = 'PISTOL' | 'SHOTGUN' | 'TEK9' | 'AK47';
export type WeaponPriority = 'POWER' | 'CONSERVE';
export type WeaponUnlockKey = 'SHOTGUN' | 'TEK9' | 'AK47';
export type BaseHideoutRoomKey = 'SAFE_ROOM' | 'LOOKOUTS' | 'WORKSHOP' | 'BACK_OFFICE';
export type HideoutRoomKey = BaseHideoutRoomKey | 'GARAGE';

/**
 * What a shopkeeper wants before he will sell you the heavy stuff.
 *
 * Standing, not time served. The gate is total reputation across every trader
 * in the city - Tommy sells to you partly because Pip vouches for you.
 */
export interface WeaponUnlockRule {
  readonly title: string;
  readonly description: string;
  /** Reputation summed across all traders. */
  readonly totalRep: number;
  readonly prerequisite: WeaponUnlockKey | null;
}

// --- reputation -------------------------------------------------------------

export type TraderKey = StoreKey;
export type QuestKey = StoreKey;

/** One rung of standing with a single trader. */
export interface ReputationTier {
  /** Points at which this tier begins. */
  readonly at: number;
  readonly name: string;
  /**
   * How much sooner this trader restocks for you, 0..1 of the interval.
   * Speed only - never the cap. See ReputationRules.
   */
  readonly restockSpeedup: number;
}

export interface ReputationRules {
  readonly perTraderMax: number;
  /** Ordered low to high. The first tier must start at 0. */
  readonly tiers: readonly ReputationTier[];
  /**
   * Being a regular. Credited at most once per trader per day, so standing
   * rewards showing up rather than spending.
   */
  readonly trade: {
    readonly pointsPerDay: number;
    /** Cap on points from trading alone, so quests stay mandatory. */
    readonly maxPoints: number;
  };
  /** Paid once, for doing a trader an actual favour. */
  readonly questPoints: number;
}

/**
 * What a trader wants doing. One per trader, once each.
 *
 * Every quest is priced in a different resource on purpose - discipline,
 * product, capital, production - so none of them can be bought through with
 * cash alone.
 */
export interface QuestRule {
  readonly title: string;
  readonly description: string;
  /** How progress is measured, and what finishing it costs. */
  readonly goal:
    | { readonly kind: 'CLEAN_SHIFTS'; readonly trips: number }
    | { readonly kind: 'DELIVER_CRACK'; readonly crack: number; readonly thugs: number }
    | { readonly kind: 'HAND_OVER_LOW_RIDER'; readonly lowRiders: number }
    | { readonly kind: 'SUPPLY_ROCKS'; readonly crackSold: number }
    | { readonly kind: 'DRIVE_BY'; readonly driveBys: number }
    /** Bought over the counter this round. Nothing is handed over at the end. */
    | { readonly kind: 'BUY_SUPPLIES'; readonly condoms: number; readonly medicine: number; readonly beer: number }
    /** Guns bought this round, and raids carried out with them, won or lost. */
    | { readonly kind: 'BUY_AND_RAID'; readonly pistols: number; readonly raids: number };
}

// --- handcrafted quest system -----------------------------------------------

/**
 * JSON-safe data carried by quest definitions. Phase B will narrow objective
 * kinds into a discriminated union; Phase A intentionally keeps the storage
 * contract extensible without coupling quests to individual action services.
 */
export type QuestDataValue =
  | string
  | number
  | boolean
  | null
  | readonly QuestDataValue[]
  | { readonly [key: string]: QuestDataValue };

export type QuestDataObject = { readonly [key: string]: QuestDataValue };

export type QuestType =
  | 'STORY'
  | 'SIDE'
  | 'CONTRACT'
  | 'DAILY'
  | 'WEEKLY'
  | 'SECRET'
  | 'ALLIANCE'
  | 'EVENT';

export type QuestDifficulty =
  | 'STREET_JOB'
  | 'CONTRACT'
  | 'SERIOUS_BUSINESS'
  | 'HIGH_RISK'
  | 'KINGPIN_CONTRACT';

export type QuestRepeatability = 'ONCE' | 'DAILY' | 'WEEKLY' | 'REPEATABLE';

export type QuestPrerequisiteKind =
  | 'QUEST_COMPLETED'
  | 'CONTACT_REP_AT_LEAST';

export interface QuestPrerequisiteDefinition {
  readonly kind: QuestPrerequisiteKind;
  readonly params?: QuestDataObject;
}

export type QuestObjectiveKind =
  | 'EVENT_COUNT'
  | 'EVENT_SUM'
  | 'SPEND_TURNS'
  | 'EARN_CASH'
  | 'RECRUIT_CREW'
  | 'WIN_EVENTS'
  | 'STATE_AT_LEAST';

export interface QuestObjectiveDefinition {
  /** Stable inside one quest so progress survives wording changes. */
  readonly id: string;
  readonly kind: QuestObjectiveKind;
  readonly description: string;
  /** Every Phase B progress objective advances toward a positive numeric target. */
  readonly target: number;
  /**
   * Optional event filter/configuration.
   *
   * Common keys:
   * - eventTypes: string[]
   * - where: object of exact top-level payload matches
   * EVENT_SUM additionally requires field.
   * RECRUIT_CREW may set crew to WHORES, THUGS or ANY.
   * STATE_AT_LEAST requires field and reads the post-event player state.
   */
  readonly params?: QuestDataObject;
}

export interface QuestProgressEvent {
  /** Usually a PlayerActivity type such as SCOUT, RAID_ATTACK or RUN_RETURNED. */
  readonly type: string;
  /** Activity/event JSON. */
  readonly payload: QuestDataValue;
  /** Authoritative player state after the source event, when available. */
  readonly state?: QuestDataObject;
}

export interface QuestObjectiveProgress {
  readonly current: number;
  readonly target: number;
  readonly completed: boolean;
}

export type QuestProgressMap = Readonly<Record<string, QuestObjectiveProgress>>;

export interface QuestObjectiveAdvance {
  readonly matched: boolean;
  readonly amount: number;
  readonly progress: QuestObjectiveProgress;
}

export type QuestRewardKind =
  | 'CASH'
  | 'TURNS'
  | 'ITEM'
  | 'CONTACT_REP'
  | 'WEAPON_ACCESS';

export interface QuestRewardDefinition {
  readonly kind: QuestRewardKind;
  readonly amount?: number;
  readonly key?: string;
  readonly params?: QuestDataObject;
}

export type ContactKey =
  | 'MAMA_KING'
  | 'PIP'
  | 'TOMMY'
  | 'WHEELS'
  | 'VIC'
  | 'BLOCKS';

export interface ContactDefinition {
  readonly key: ContactKey;
  readonly name: string;
  readonly shortName: string;
  readonly role: string;
  readonly description: string;
}

export type ContactCatalog = Readonly<Record<ContactKey, ContactDefinition>>;

export interface QuestDefinition {
  /** Stable key inside a ruleset version, e.g. FIRST_NIGHT_OUT. */
  readonly key: string;
  readonly title: string;
  readonly description: string;
  /** Null for system/event quests that have no named contact. */
  readonly contactKey: string | null;
  readonly type: QuestType;
  /** Gameplay grouping such as STREET, COMBAT, TRAVEL or TURF. */
  readonly category: string;
  readonly difficulty: QuestDifficulty;
  readonly prerequisites: readonly QuestPrerequisiteDefinition[];
  readonly objectives: readonly QuestObjectiveDefinition[];
  readonly bonusObjectives: readonly QuestObjectiveDefinition[];
  readonly rewards: readonly QuestRewardDefinition[];
  readonly followUpKeys: readonly string[];
  readonly repeatability: QuestRepeatability;
  /** Null means the accepted quest has no timer. */
  readonly expiresAfterMinutes: number | null;
  readonly availability: QuestDataObject;
}

export type QuestDefinitionCatalog = Readonly<Record<string, QuestDefinition>>;

export interface RulesetMeta {
  readonly id: string;
  readonly version: string;
  readonly name: string;
}

// --- round ------------------------------------------------------------------

export interface StartingPlayer {
  /** Integer cents. */
  readonly cashCents: number;
  readonly turns: number;
  readonly whores: number;
  readonly thugs: number;
  readonly condoms: number;
  readonly medicine: number;
  readonly crack: number;
  readonly beer: number;
  readonly pistols: number;
  readonly shotguns: number;
  readonly tek9s: number;
  readonly ak47s: number;
  readonly lowRiders: number;
  readonly payoutPercent: number;
}


export interface SeededRivalRule {
  readonly slug: string;
  readonly displayName: string;
  readonly publicPimpId: number;
  readonly note: string;
  readonly startingPlayer: Partial<StartingPlayer>;
}

export interface RoundRules {
  readonly defaultDurationDays: number;
  readonly publicPimpIdStart: number;
  readonly startingCitySlug: string;
  readonly startingPlayer: StartingPlayer;
  readonly seededRivals?: readonly SeededRivalRule[];
}

// --- turns ------------------------------------------------------------------

export interface AwayBonusRules {
  readonly enabled: boolean;
  readonly afterHours: number;
  readonly amount: number;
}

export interface TurnRules {
  readonly amountPerInterval: number;
  readonly intervalMinutes: number;
  readonly cap: number;
  readonly awayBonus: AwayBonusRules;
  readonly reserveTurns: { readonly enabled: boolean };
  readonly purchasedTurns: { readonly enabled: boolean };
}

// --- economy ----------------------------------------------------------------

export interface EconomyRules {
  readonly currency: {
    readonly centsPerDollar: number;
    readonly symbol: string;
    readonly code: string;
  };
  /** Net worth contribution per unit owned, in cents. */
  readonly netWorth: {
    /** What a dollar of cash is worth as net worth, in percent. */
    readonly cashWeightPercent: number;
    readonly perWhoreCents: number;
    readonly perThugCents: number;
    readonly perLowRiderCents: number;
    readonly perMedicineCents: number;
    readonly perCrackCents: number;
    readonly perCondomCents: number;
    readonly perBeerCents: number;
    readonly perPistolCents: number;
    readonly perShotgunCents: number;
    readonly perTek9Cents: number;
    readonly perAk47Cents: number;
  };
  readonly payout: {
    readonly min: number;
    readonly max: number;
    readonly default: number;
  };
  readonly netWorthExcluded: readonly string[];
}

// --- happiness --------------------------------------------------------------

export interface HappinessRules {
  readonly min: number;
  readonly max: number;
  readonly thug: {
    readonly penaltyPerThugWithoutBeer: number;
    readonly penaltyPerThugWithoutWeapon: number;
  };
  readonly whore: {
    readonly neutralPayoutPercent: number;
    readonly penaltyPerPayoutPercentBelowNeutral: number;
    readonly condomsPerWhore: number;
    readonly maxCondomPenalty: number;
    readonly crackPerWhore: number;
    readonly maxCrackPenalty: number;
    readonly whoresPerThug: number;
    readonly maxProtectionPenalty: number;
  };
}

// --- scouting ---------------------------------------------------------------

export interface District {
  readonly slug: string;
  readonly name: string;
  /** What scouting here turns up. */
  readonly whoresPerTurn: number;
  readonly thugsPerTurn: number;
  /** Multiplies what the crew brings in per turn worked here. */
  readonly payMultiplier: number;
  /** How many girls one thug can cover on this block. */
  readonly protectionWhoresPerThug: number;
}

export type Districts = { readonly [K in DistrictKey]: District };

/**
 * Manual 3.1. One action: the crew works a block while you pick people up, so
 * these rules cover both the recruiting and the earning.
 */
export interface ScoutingRules {
  readonly turnCostPerScout: number;
  readonly minTurns: number;
  /** Manual 3.1's suggested spend per trip. */
  readonly recommendedTurns: number;
  readonly districts: Districts;
  /** Crew size at which a district yields half its headline recruit rate. */
  readonly recruitment: {
    readonly whoreSoftCap: number;
    readonly thugSoftCap: number;
  };
  readonly variance: number;

  readonly grossPerWhorePerTurnCents: number;
  readonly minHappinessMultiplier: number;
  readonly takeVariance: number;
  readonly consumption: {
    readonly condomsPerWhorePerTurn: number;
    readonly crackPerWhorePerTurn: number;
    readonly beerPerThugPerTurn: number;
  };
  readonly exposure: {
    readonly maxTakePenalty: number;
  };
  /** When true, only fit thugs with weapons count as street protection. */
  readonly requiresArmedThugs?: boolean;
  /**
   * How many clients a block holds. Hidden from the player, and rotated
   * between the districts on a clock - one value per district, reshuffled
   * every `clients.rotationMinutes`.
   */
  readonly clients: {
    /** Exactly one per district. Shuffled, never scaled. */
    readonly capacities: readonly number[];
    readonly rotationMinutes: number;
  };
  /** Where the girls work while the thugs cook. Never shown to the player. */
  readonly produceDistrict: DistrictKey;
  readonly finds: {
    readonly chancePerTurn: number;
    readonly crackMin: number;
    readonly crackMax: number;
  };
}

// --- production -------------------------------------------------------------

/**
 * Manual 3.2. The girls still work while the thugs cook, just for less.
 */
export interface ProductionRules {
  readonly turnCostPerRun: number;
  readonly minTurns: number;
  readonly crack: {
    readonly perThugPerTurn: number;
    readonly minHappinessMultiplier: number;
    readonly variance: number;
    readonly ingredientCentsPerRock: number;
  };
  /** What an unsupervised shift earns against a scouted one. */
  readonly unsupervisedTakeMultiplier: number;
}

/** Working without protection, and what medicine is for. */
export interface HealthRules {
  readonly infectionChancePerTurnUnprotected: number;
  readonly medicinePerTreatment: number;
  readonly maxInfectedFractionPerAction: number;
}

/** When unhappy people give up and walk. Shared by every action. */
export interface DepartureRules {
  readonly happinessThreshold: number;
  readonly chancePerTurn: number;
  readonly maxFractionPerAction: number;
}

// --- stores and weapons -----------------------------------------------------

/** RoundPlayer columns holding an item's shelf count and that shelf's clock. */
export type StockField =
  | 'pistolStock'
  | 'shotgunStock'
  | 'tek9Stock'
  | 'ak47Stock'
  | 'lowRiderStock'
  | 'condomStock'
  | 'medicineStock'
  | 'beerStock'
  | 'crackStock'
  | 'thugStock';
export type StockAtField =
  | 'pistolStockAt'
  | 'shotgunStockAt'
  | 'tek9StockAt'
  | 'ak47StockAt'
  | 'lowRiderStockAt'
  | 'condomStockAt'
  | 'medicineStockAt'
  | 'beerStockAt'
  | 'crackStockAt'
  | 'thugStockAt';

/**
 * How many of something a shopkeeper can actually get hold of, and how often.
 *
 * Cash is not the only thing standing between a player and an arsenal or a
 * fleet: the goods have to come from somewhere. A shelf holds `cap` at most
 * and gains one every `intervalMinutes`, so the bigger the thing the longer
 * the wait - the same lazy-regeneration shape as turns.
 *
 * Null on an item means no limit at all.
 */
export interface RestockRule {
  /** Most that can ever be waiting for you at once. */
  readonly cap: number;
  /** Minutes before the next delivery. */
  readonly intervalMinutes: number;
  /**
   * How many arrive per delivery. Defaults to 1.
   *
   * Supplies move in cases, not one condom at a time, so a corner store
   * restocks in the thousands per hour while a chop shop builds one car in
   * eight. Same rule, different units.
   */
  readonly perInterval?: number;
  readonly stockField: StockField;
  readonly stockAtField: StockAtField;
}

export interface Weapon {
  readonly field: ResourceField;
  readonly name: string;
  readonly buyCents: number;
  readonly sellCents: number;
  /** Unused until 0.2.0 combat. */
  readonly power: number;
  /** Null means Tommy can get as many as you can pay for. */
  readonly restock: RestockRule | null;
}

export interface StoreItem {
  readonly unlockKey?: WeaponUnlockKey;
  readonly name: string;
  readonly field: ResourceField;
  readonly buyCents: number;
  /** Null means the store does not buy this back. */
  readonly sellCents: number | null;
  /** Absent or null means the shop can get as many as you can pay for. */
  readonly restock?: RestockRule | null;
}

export interface Store {
  readonly slug: string;
  readonly name: string;
  /** Who is behind the counter. Used when the shop talks about its stock. */
  readonly keeper: string;
  readonly blurb: string;
  /**
   * Item keys differ per store, so a lookup by a key from a request is
   * `StoreItem | undefined` - which is what forces the "item belongs to this
   * store" check to actually happen.
   */
  readonly items: Readonly<Record<string, StoreItem>>;
}

// --- rankings and evidence --------------------------------------------------

export interface RankingRules {
  readonly topCount: number;
  readonly neighborhoodRadius: number;
  readonly dailyResetHourUtc: number;
}

export interface CommunityPrivacyRules {
  /** Hide exact opponent crew counts on public profiles. */
  readonly hideOpponentCrew: boolean;
  /** Hide exact opponent weapon counts on public profiles. */
  readonly hideOpponentWeapons: boolean;
}

export interface EvidenceRules {
  readonly enabled: boolean;
  readonly perScout: number;
  readonly perProduce: number;
  readonly perStoreTransaction: number;
  readonly decayPerInterval: number;
  readonly bustThreshold: number;
}

// --- seasonal hideout -------------------------------------------------------

export interface HideoutRoomRule {
  readonly name: string;
  readonly blurb: string;
  readonly maxLevel: number;
  /** Cost for levels 1..maxLevel, in cents. */
  readonly costsCents: readonly number[];
}

/**
 * 0.3.0-C. Alliances belong to one round and reset with it. Absent on rounds
 * where alliances have not shipped, which keeps every older ruleset unchanged.
 */
export interface AllianceRules {
  /** Members including the leader. Checked under a lock whenever someone joins. */
  readonly maxMembers: number;
  /**
   * After leaving or being kicked, a player cannot join or found an alliance,
   * and cannot hit or be hit by the alliance they left, until this passes.
   */
  readonly leaveCooldownHours: number;
  readonly inviteExpiresHours: number;
  /** Outstanding invites one alliance can have at once. */
  readonly maxPendingInvites: number;
  /** 0.3.0-D. Fresh recon one member gathers is visible to every current member until it expires. */
  readonly sharedIntel?: boolean;
}

/**
 * 0.4.0-A. One product a round knows about. Keys are uppercase, e.g. ECSTASY.
 * CRACK is always stored on the player's crack column; every other key is stored
 * as a product row, so adding a product never needs a schema change.
 */
export interface ProductDefinition {
  readonly name: string;
  readonly blurb: string;
  readonly sortOrder: number;
  /** 0.4.0-B. What a slice of a work trip supplied with this product does. Absent means no change. */
  readonly work?: {
    readonly takeMultiplier?: number;
  };
  /** 0.4.0-C. The product's identity for each role. Takes precedence over `work`. */
  readonly effects?: ProductEffects;
  /**
   * 0.4.0-D. Price, shelf, value and production. Crack leaves this out: it keeps
   * Pip's Product item, `economy.netWorth.perCrackCents` and `production.crack`.
   */
  readonly economy?: ProductEconomy;
}

/** 0.4.0-D. Integer cents throughout. */
export interface ProductEconomy {
  /** What one unit adds to net worth. Never above `pip.sellCents`, so buying never raises net worth. */
  readonly netWorthCents: number;
  /** Pip's counter. Null where Pip does not deal it. */
  readonly pip: {
    readonly buyCents: number;
    readonly sellCents: number;
    readonly restock: { readonly cap: number; readonly perInterval: number; readonly intervalMinutes: number };
  } | null;
  /** Produce Product. Null where it cannot be cooked. */
  readonly production: {
    readonly perThugPerTurn: number;
    /** Ingredients per unit. Never below `pip.sellCents`, so cooking to sell is never free money. */
    readonly ingredientCentsPerUnit: number;
    readonly variance: number;
    readonly minHappinessMultiplier: number;
    /** Heat per unit cooked. */
    readonly heatPerUnit: number;
  } | null;
}

/**
 * 0.4.0-C. What a product does to the group that burns it. Every multiplier is
 * 1 for "no change" and applies only to the share of the trip the product
 * supplied, so a product that runs out part-way only counts for its slice.
 */
export interface ProductEffects {
  /**
   * What the product is worth, in cents, for simulation. 0.4.0-D prices products
   * at Pip's and for net worth around these numbers.
   */
  readonly referenceCostCents: number;
  readonly hoes: {
    /** Take on any job. */
    readonly take: number;
    /** Fit per job (district key or PRODUCE), multiplied on top of `take`. Missing jobs are 1. */
    readonly jobTake?: Readonly<Record<string, number>>;
    /** How much one unit on hand counts toward whore happiness, against crack's 1. */
    readonly happinessWeight: number;
    /** Whores recruited on a Scout trip: client attraction. */
    readonly recruitment: number;
    /** Chance an unhappy whore walks. */
    readonly departures: number;
    /** Departures on the dry part of a trip after this product ran out. Absent means no crash. */
    readonly crashDepartures?: number;
    /** Heat per turn this product supplies a crew of `heat.crewScale.whores`. */
    readonly heatPerTurn: number;
  };
  readonly thugs: {
    /** Production output while cooking. */
    readonly output: number;
    /** Happiness points added to the crew's mood while cooking, capped at 100. */
    readonly morale: number;
    /** Chance an unhappy thug walks while cooking. */
    readonly departures: number;
    /** Heat per turn this product supplies a crew of `heat.crewScale.thugs`. */
    readonly heatPerTurn: number;
  };
  /**
   * 0.4.0-E. Thugs in a fight: a raid, drive-by or special raid they send, or a
   * defense of their own block. Absent means no effect.
   */
  readonly combat?: {
    /** Strength when attacking. */
    readonly attack: number;
    /** Strength when defending. */
    readonly defense: number;
    /** Share of the squad wounded, win or lose. */
    readonly wounds: number;
  };
}

/** 0.4.0-B. How work trips burn products and what running dry costs. */
export interface WorkSupplyRules {
  /** Product units one whore burns per turn worked, whichever product it is. */
  readonly productPerWhorePerTurn: number;
  /** Take multiplier for the part of a trip with no allowed product left. */
  readonly dryTakeMultiplier: number;
  /** 0.4.0-C. Departure chance on the dry part of a trip. Absent means 1. */
  readonly dryDepartureMultiplier?: number;
  /** 0.4.0-C. Product units one fit thug burns per turn cooking. Absent means thugs burn nothing. */
  readonly productPerThugPerTurn?: number;
  /**
   * 0.4.0-C. Round a trip's need up rather than down, so a small crew on a short
   * trip cannot take a product's effects without burning any of it.
   */
  readonly roundNeedUp?: boolean;
}

/** 0.4.0-E. Product burned by thugs in a fight, under the RAID and DEFENSE supply policies. */
export interface CombatSupplyRules {
  /** Units each committed thug burns per fight. */
  readonly productPerThugPerFight: number;
}

// --- 0.5.0 travel -------------------------------------------------------------

/** 0.5.0-A. How much of a product Pip has in a city. */
export type SupplyLevel = 'PLENTIFUL' | 'NORMAL' | 'LOW' | 'OUT';

/** 0.5.0-A. One product in one city. */
export interface CityProductRules {
  /** Pip's buy and sell prices here against his base prices, before supply leans on them. */
  readonly price: number;
  /**
   * The high market's baseline here, as a multiple of Pip's base buy price. Kept at or
   * below `price` times the cheapest supply lean, less the spread, so buying at Pip's
   * and selling on the high market in the same city always loses.
   */
  readonly demand: number;
  /** Pip's usual supply here, or null where he does not carry it. */
  readonly supply: SupplyLevel | null;
}

/**
 * 0.5.0-A. What Heat means in a city. Heat is one number that goes wherever the
 * player goes; each city decides where it starts to cost.
 */
export interface CityHeatRules {
  readonly dragStartsAt: number;
  readonly bustStartsAt: number;
  /** 0.5.0-C. Where arrests start. */
  readonly arrestStartsAt: number;
  /** Multiplies the round's bust seizure and fine here. */
  readonly bustSeverity: number;
}

/** Local presentation for one mechanical district in one city. */
export interface CityDistrictRules {
  readonly name: string;
  readonly blurb: string;
}

/** 0.5.0-A. A city's character. Everything here is balance, so it lives in the ruleset, not the City table. */
export interface CityRules {
  readonly name: string;
  /** The headline: "The Exchange". */
  readonly trait: string;
  readonly blurb: string;
  /**
   * Street talk: what anyone can find out about a city without going. Always true, never
   * a number. It names what is cheap and what sells, so a trip is never wasted, but not
   * by how much, so no route can be ruled out from home.
   */
  readonly talk: readonly string[];
  /** Every catalog product, crack included. */
  readonly products: { readonly [product: string]: CityProductRules };
  /** How far and how often supply moves over a round, 0 (steady) to 1 (the swing city). Also how often price events land. */
  readonly supplySwing: number;
  /** The lowest supply level any product here falls to in a swing. */
  readonly supplyFloor: SupplyLevel;
  /** Multiplies Heat gained on runs here. */
  readonly policePressure: number;
  /** High-market units that move the price 1%. */
  readonly marketDepth: number;
  readonly heat: CityHeatRules;
  /** The scout, income and crack modifiers that used to sit on the City row. */
  readonly modifiers: { readonly scout: number; readonly income: number; readonly crack: number };
  /** Drive hours out along each road its locals can follow a run. */
  readonly zoneHours: number;
  /**
   * Local names and flavor for the five mechanical district archetypes.
   * The keys stay stable for scouting/turf balance and persistence; only presentation changes by city.
   */
  readonly districts?: { readonly [K in DistrictKey]?: CityDistrictRules };
  /** District pay for players living here. Applied from 0.5.0-D (with `travel.relocation`). */
  readonly districtPay?: { readonly [K in DistrictKey]?: number };
  /** What stores charge players living here. Applied from 0.5.0-D (with `travel.relocation`); buyback prices do not move. */
  readonly storePrices?: { readonly [K in StoreKey]?: number };
}

/** 0.5.0-A. A real road between two cities. */
export interface RoadRules {
  readonly from: string;
  readonly to: string;
  /** "I-95". */
  readonly name: string;
  readonly driveHours: number;
  /** Road-stop pressure, 1 for an ordinary road. */
  readonly police: number;
  readonly note?: string;
}

/** 0.5.0-A. Roads, run costs and Pip's supply levels, round-wide. */
export interface TravelRules {
  readonly roads: readonly RoadRules[];
  /** Real time per drive hour. */
  readonly gameMinutesPerDriveHour: number;
  /** Turns a run spends per drive hour. */
  readonly turnsPerDriveHour: number;
  /** Units of product one Low-Rider carries. */
  readonly cargoPerLowRider: number;
  /** Other routes are offered when they are no more than this share longer than the shortest. */
  readonly alternativeRouteShare: number;
  /** Most routes offered between two cities. */
  readonly maxRoutes: number;
  /** What each supply level does to a shelf's size, its restock and Pip's prices. */
  readonly supplyLevels: { readonly [K in SupplyLevel]: SupplyLevelRules };
  /** The high market's cut: buyers pay baseline x (1 + spread), sellers get x (1 - spread). */
  readonly highMarketSpread: number;
  /** 0.5.0-B. Absent where cities have characters but nobody drives yet. */
  readonly runs?: RunRules;
  /** 0.5.0-C. The live high market. Absent: runs trade at Pip's counters only. */
  readonly market?: HighMarketRules;
  /** 0.5.0-C. Pip's supply moving over the round. Absent: every city keeps its usual supply. */
  readonly swings?: SupplySwingRules;
  /** 0.5.0-C. Gluts and droughts. Absent: none. */
  readonly events?: PriceEventRules;
  /** 0.5.0-C. Police stops on the road. Absent: the road is safe. */
  readonly stops?: RoadStopRules;
  /** 0.5.0-C. Heat a run draws by selling. Absent: selling is quiet. */
  readonly saleHeat?: SaleHeatRules;
  /**
   * 0.5.0-D. Moving the whole operation to another city. Present, it also turns on each
   * city's living rules for its residents: district pay, store prices and Pip's home
   * counter at that city's prices and usual supply.
   */
  readonly relocation?: RelocationRules;
  /** 0.5.0-E. Runs near a city can be tailed and hit. Absent: runs only meet the police. */
  readonly convoys?: ConvoyRules;
}

/**
 * 0.6.0-A. Turf: a block is one district in one city, forty in all, and it is held by
 * whoever has a corner crew standing on it. Holding pays a bonus on the holder's own
 * trips there and a street tax on everyone else's, and costs fit, armed thugs who are
 * not at home.
 *
 * Data only in A: nothing reads these numbers until 0.6.0-B posts the first corner crew.
 */
export interface TurfRules {
  readonly districts: { readonly [K in DistrictKey]: TurfDistrictRules };
  readonly locals: TurfLocalsRules;
  readonly presence: TurfPresenceRules;
  readonly corner: TurfCornerRules;
  readonly caps: TurfCapRules;
  /** 0.6.0-B. A owns the data/map; B turns claiming and holding on. */
  readonly holding?: boolean;
  /** 0.6.0-C. Player-vs-player pushes and turf-war windows. */
  readonly wars?: boolean;
  /** 0.6.0-D. Away holdings with their own supply/tax box. */
  readonly outposts?: TurfOutpostRules;
  /** 0.6.0-E. Alliance territory and city-control rules. */
  readonly territory?: TurfTerritoryRules;
  /** 0.6.0-F. One seeded late-round Federal sweep of a city's held corners. */
  readonly crackdown?: TurfCrackdownRules;
  /** 0.6.0-C. Taking a block. Data in A. */
  readonly push: TurfPushRules;
}

export interface TurfCrackdownRules {
  /** The sweep lands this many hours before the scheduled round end. */
  readonly hoursBeforeRoundEnd: number;
  /** How many hours before the sweep the target city is made public. */
  readonly warningHours: number;
  /** Heat added to a holder for each corner they still hold when the sweep lands. */
  readonly heatPerHeldBlock: number;
  /** Share of each posted corner crew the Feds pick up. */
  readonly pickupShare: number;
  /** Hard cap per block so one event cannot erase a large late-round crew. */
  readonly maxPickedUpPerBlock: number;
  /** Always leave this many on a non-empty corner; the sweep weakens turf rather than auto-flipping it. */
  readonly minimumCornerSurvivors: number;
}

export interface TurfTerritoryRules {
  /** Share of the city's five blocks one alliance must hold to control it. */
  readonly cityControlShare: number;
  /** Controlled-city alliance members do not pay street tax there. */
  readonly controlledCityNoTax: boolean;
  /**
   * A personally held corner acts as a live road lookout in that city. It sees
   * who is passing now, but never paid-recon wallet/trunk/escort bands or lookahead.
   */
  readonly cornerRunSightings: boolean;
}

export interface TurfOutpostRules {
  /** Cash the box may hold before a run has to collect it. */
  readonly cashCapCents: number;
  /** Beer kept at the outpost for corner upkeep. */
  readonly beerCap: number;
  /** Total product units kept in the box across all products. */
  readonly productCap: number;
  /** Turns a run spends moving stock between its trunk/wallet and an outpost. */
  readonly transferTurnCost: number;
  /** Share of each stored resource exposed when the outpost is captured. */
  readonly lootShare: number;
  /** Hard caps keep one rich box from deciding a round in a single push. */
  readonly lootCashCapCents: number;
  readonly lootBeerCap: number;
  readonly lootProductCap: number;
}

export interface TurfDistrictRules {
  /** Multiplies the holder's own take on this block. */
  readonly holdBonus: number;
  /**
   * Share of the take a crew loses working someone else's block. It is burned: money
   * never moves from one player to another, because that is the multi-account route.
   */
  readonly taxBurn: number;
  /** Share of that worker's take paid to the holder from the house, capped per payer per day. */
  readonly taxMint: number;
  /** Fit, armed thugs a corner crew needs to hold this block, however small the crew. */
  readonly cornerMinimum: number;
  /**
   * A corner is as big as the crew that holds it: this share of the holder's thugs, when
   * that is more than the minimum. Without it a late crew holds the slums on 1% of its
   * muscle and turf is free money for whoever is already winning.
   */
  readonly cornerShareOfCrew: number;
  /** Thugs the locals hold this block with, before the city multiplier. */
  readonly localsThugs: number;
}

/**
 * Every block opens the round held by the locals, so there is always something to take,
 * even in a city with one player in it. A block nobody holds goes back to them.
 */
export interface TurfLocalsRules {
  /** Multiplies `localsThugs` in each city: Detroit's corners are the hardest. */
  readonly byCity: { readonly [slug: string]: number };
  /** What the locals fight with, and the share of them carrying it. */
  readonly weapon: WeaponKey;
  readonly armedShare: number;
  /** Thugs the locals get back an hour after losing a block, up to their full strength. */
  readonly regrowPerHour: number;
  /** Hours after a block is released before the locals move back onto it. */
  readonly reclaimHours: number;
}

/** You cannot claim a block you have never worked. Presence is turns worked there, and it fades. */
export interface TurfPresenceRules {
  readonly turnsToClaim: number;
  readonly halfLifeHours: number;
  /** Presence a Scout turn on the block adds. Produce trips add none. */
  readonly perScoutTurn: number;
}

/** What a corner crew costs to keep standing. */
export interface TurfCornerRules {
  readonly postTurnCost: number;
  readonly pullTurnCost: number;
  readonly beerPerThugPerHour: number;
  readonly productPerThugPerHour: number;
  /** Share of a short-supplied corner crew that walks each hour. */
  readonly walkoutSharePerHour: number;
}

export interface TurfCapRules {
  readonly blocksPerCrewHome: number;
  /** 0.6.0-D. Blocks held away from home, through outposts. */
  readonly blocksPerCrewAway: number;
  readonly blocksPerAllianceInCity: number;
  /** Most tax one payer can mint for a holder in a day. */
  readonly dailyTaxCapCentsPerPayer: number;
}

export interface TurfPushRules {
  /** Real minutes between starting a push and it landing, as a convoy tail works. */
  readonly warningMinutes: number;
  readonly turnCost: number;
  /** Hours a newly taken block cannot be taken again. */
  readonly shieldHours: number;
  /** Hours before the same crew can push the same block again. */
  readonly attackerCooldownHours: number;
  /**
   * The raid engine's roll on a corner: a smaller edge than a home defense, and a wider
   * swing. Between a raid (1.1, 0.1) and a convoy ambush (1.0, 0.3).
   */
  readonly fight: { readonly defenseMultiplier: number; readonly variance: number };
  /**
   * 0.3.0-D's held reinforcement, shipping on turf first: allies send real help, but only
   * sometimes, which keeps the swing a flat cap would flatten. Home raids stay unhelped.
   */
  readonly allies: {
    readonly maxShareOfDefender: number;
    readonly chanceToShowUp: number;
    readonly maxHelpers: number;
  };
}

/**
 * 0.5.0-E. Convoys: a run can be hit near a city (leaving it, in town, or coming in),
 * by the players who live there and by rival runs in reach at the same time. A hit is a
 * tail first: the squad is committed and the hit lands when a warning window closes, if
 * the run is still in reach.
 */
export interface ConvoyRules {
  /** Real minutes between starting a tail and the hit landing. */
  readonly warningMinutes: number;
  /**
   * Nobody is alerted. The owner only sees a tail on their run in its last minutes, this
   * many per Lookouts level: none at level 0, a little at the top.
   */
  readonly headsUpMinutesPerLookouts: number;
  /**
   * Recon of the area: runs coming near, in town or leaving where you live (and where your
   * run is), for turns. It goes stale, and only a run it found can be tailed.
   */
  readonly recon: {
    readonly turnCost: number;
    /** Real minutes a recon stays good. */
    readonly freshMinutes: number;
    /** How far ahead it sees runs coming, and how much more per Lookouts level. */
    readonly lookaheadMinutes: number;
    readonly lookaheadMinutesPerLookouts: number;
  };
  readonly turnCost: number;
  /** Minutes after a run is hit before anyone can tail it again. */
  readonly rehitMinutes: number;
  /**
   * Share of the owner's fit thugs at home who ride out on their own when a run is hit
   * at home: the most in the home town, falling to none at the edge of the home zone.
   */
  readonly homeBackupMaxShare: number;
  /**
   * The raid engine's strength roll, as it plays on the road: an ambush takes away most
   * of a defender's edge, and a fight on the move swings more than a fight on a block.
   */
  readonly fight: { readonly defenseMultiplier: number; readonly variance: number };
  readonly loot: {
    /** Share of the run's cash taken, rolled in this range. */
    readonly cashPercent: { readonly min: number; readonly max: number };
    /** Share of the run's cargo taken, rolled in this range, split across products by largest remainder. */
    readonly cargoPercent: { readonly min: number; readonly max: number };
    /** Cash each fit attacker can carry away. */
    readonly cashPerAttackerCents: number;
    /** Cargo units each fit attacker can carry away. */
    readonly cargoPerAttacker: number;
    /** Chance at one of the run's Low-Riders when its whole escort goes down (the run keeps at least one). */
    readonly lowRiderChance: number;
  };
}

/** 0.5.0-D. Relocation: a fee priced on net worth, hours on the road, and limits. */
export interface RelocationRules {
  /** The least a move costs. */
  readonly feeFloorCents: number;
  /** Share of net worth a move costs, when that is more. */
  readonly feeNetWorthFraction: number;
  /** Real minutes on the road: no actions, still a target in the old city. */
  readonly downtimeMinutes: number;
  /** Hours from the start of one move before the next. */
  readonly cooldownHours: number;
  /** No moves in the round's last hours, so nobody reshuffles local ranks at the end. */
  readonly cutoffHours: number;
}

/** 0.5.0-A. What a supply level does to Pip's counter (and from 0.5.0-C the high market). */
export interface SupplyLevelRules {
  readonly shelf: number;
  readonly restock: number;
  readonly price: number;
  /** 0.5.0-C. The high market's baseline leans the same way as Pip's supply. Missing is 1. */
  readonly market?: number;
}

/**
 * 0.5.0-C. The high market: one shared price per round, city and product. Trades push
 * it; it drifts back to its baseline.
 */
export interface HighMarketRules {
  /** Real minutes for half of any push off the baseline to wear off. */
  readonly recoveryHalfLifeMinutes: number;
  /** How far the price may be pushed, as shares of the baseline: [-down, +up]. */
  readonly maxPushDown: number;
  readonly maxPushUp: number;
  /** A trade is refused when its first unit is worse than the quote the player saw by more than this share. */
  readonly quoteTolerance: number;
}

/**
 * 0.5.0-C. Pip's supply moves on a schedule seeded per round, so rounds differ and a
 * round can be replayed. Each slot a product may step away from its usual level: how
 * often and how far is the city's `supplySwing`.
 */
export interface SupplySwingRules {
  /** Real minutes a supply level holds before the next roll. */
  readonly slotMinutes: number;
  /** Chance a product is off its usual level in a slot, at a swing of 1. */
  readonly moveChance: number;
  /** Share of moves that go two levels rather than one, at a swing of 1. */
  readonly bigMoveShare: number;
  /** Share of level changes to or from out or plentiful that make the street wire. */
  readonly wireShare: number;
  /**
   * The most a high market's baseline drifts either way in a slot, at a swing of 1,
   * whatever Pip's supply does. Live prices move; Pip's counter does not drift.
   */
  readonly marketDrift: number;
}

export type PriceEventKind = 'GLUT' | 'DROUGHT';

/** 0.5.0-C. Price events: bigger and rarer than a swing, and always on the wire. */
export interface PriceEventRules {
  /** Real minutes per roll. At most one event per city per slot. */
  readonly slotMinutes: number;
  /** Chance of an event in a slot at a `supplySwing` of 1. */
  readonly chance: number;
  readonly kinds: { readonly [K in PriceEventKind]: PriceEventKindRules };
}

export interface PriceEventKindRules {
  /** Share of events that are this kind. */
  readonly weight: number;
  readonly durationMinutes: number;
  /** Pip's supply while it lasts. */
  readonly supply: SupplyLevel;
  /** The high market's baseline while it lasts. Above 1 only with Pip out, or it is a loop. */
  readonly marketMultiplier: number;
}

/** 0.5.0-C. Police stops on the road, rolled once per leg. */
export interface RoadStopRules {
  /** Chance per drive hour on a road with police 1, before cargo, Heat and escorts. */
  readonly chancePerDriveHour: number;
  /** Units at which cargo doubles the chance of an empty car. */
  readonly cargoScale: number;
  /** The most cargo can multiply the chance by. */
  readonly maxCargoFactor: number;
  /** Chance cut per escort, down to `minEscortFactor`. */
  readonly escortCut: number;
  readonly minEscortFactor: number;
  /** Share of each product in the trunk taken. */
  readonly productSeizedFraction: number;
  /** Share of the run's cash taken. */
  readonly cashFineFraction: number;
}

/**
 * 0.5.0-C. Heat from selling on a run: the city's police pressure x `perTenThousandDollars`
 * x the square root of the sale in ten-thousands of dollars. Split sales draw more, not less.
 */
export interface SaleHeatRules {
  readonly perTenThousandDollars: number;
}

/** 0.5.0-B. Runs: a crew on the road with its own wallet and trunk. */
export interface RunRules {
  /** Real minutes a run stays in a city it stops at before it heads home on its own. */
  readonly townWindowMinutes: number;
  /**
   * 0.5.0-F. A run can buy on its home city's high market as it loads up, straight into the
   * trunk and paid from home cash. Buying only: nobody sells on their own market, so cooking
   * to sell still never pays.
   */
  readonly homeMarketAtLaunch?: boolean;
}

/** 0.4.0-D. Round-wide product economy switches. */
export interface ProductEconomyRules {
  /** Recon's stock level, in product units per whore the target runs. */
  readonly intel: { readonly lightBelowPerWhore: number; readonly heavyFromPerWhore: number };
}

/**
 * 0.4.0-C. Heat: how much attention the crew's product draws. It rises with risky
 * product, decays on the turn clock, drags the take when high and risks a bust
 * when higher. A bribe brings it down for a price that grows with net worth.
 */
export interface HeatRules {
  readonly max: number;
  /** Heat lost per turn interval, on the same clock turns regenerate on. */
  readonly decayPerInterval: number;
  /** Crew sizes at which a product's `heatPerTurn` applies as written. Heat scales with the square root of crew over these. */
  readonly crewScale: { readonly whores: number; readonly thugs: number };
  readonly drag: {
    /** Heat at which the take starts to suffer. */
    readonly startsAt: number;
    /** Take lost at max Heat, 0..1. */
    readonly maxTakePenalty: number;
  };
  readonly bust: {
    /** Heat at which a Scout or Produce trip can be busted. */
    readonly startsAt: number;
    /** Bust chance per trip at max Heat. */
    readonly chanceAtMax: number;
    /** Share of every product on hand seized. */
    readonly productSeizedFraction: number;
    /** Share of cash taken as a fine. */
    readonly cashFineFraction: number;
    /** Heat a bust burns off. */
    readonly heatDrop: number;
  };
  /**
   * 0.5.0-C. Arrests: a tier above busts. At home an arrest seizes and fines more than a
   * bust and locks the player up; on a run it takes the trunk and part of the wallet and
   * sends the run home. Absent: no arrests.
   */
  readonly arrest?: {
    /** Heat at which arrests start. Each city sets its own. */
    readonly startsAt: number;
    /** Arrest chance per trip or trade at max Heat. */
    readonly chanceAtMax: number;
    readonly productSeizedFraction: number;
    readonly cashFineFraction: number;
    readonly heatDrop: number;
    /** Real minutes locked up after an arrest at home. */
    readonly downtimeMinutes: number;
    /** Share of a run's cash taken when the run is arrested. Its whole trunk goes. */
    readonly runCashSeizedFraction: number;
  };
  readonly bribe: {
    /** The least one point of Heat costs. */
    readonly minCentsPerPoint: number;
    /** Share of net worth one point costs, when that is more. */
    readonly netWorthFractionPerPoint: number;
  };
}

export type ProductCatalog = { readonly CRACK: ProductDefinition } & { readonly [key: string]: ProductDefinition };

export interface HideoutRules {
  readonly rooms: { readonly [K in BaseHideoutRoomKey]: HideoutRoomRule } & { readonly GARAGE?: HideoutRoomRule };
  readonly buffs: {
    readonly safeRoomProtectedCashCentsPerLevel: number;
    readonly lookoutsDefenseBonusPercentPerLevel: number;
    readonly workshopCrackBonusPercentPerLevel: number;
    readonly backOfficeTakeBonusPercentPerLevel: number;
    /** 0.6.0-D. Active-run limit once the Garage exists. */
    readonly garageRunLimit?: number;
  };
}

// --- the ruleset ------------------------------------------------------------


export type SpecialRaidKind = 'DRUG_HOES' | 'STEAL_RIDE' | 'LURE_CREW';

export interface SpecialRaidRules {
  readonly title: string;
  readonly buttonLabel: string;
  /** Defaults to the normal raid turn cost. */
  readonly turnCost?: number;
}

export interface DrugHoesRules extends SpecialRaidRules {
  readonly crackPerWhore: number;
  readonly whoresPerSurvivor: number;
  readonly defenderCrackBurnPerWhore: number;
  readonly defenderCondomBurnPerWhore: number;
}

export interface StealRideRules extends SpecialRaidRules {
  readonly lowRidersStolen: number;
}

export interface LureCrewRules extends SpecialRaidRules {
  /** Target happiness must be below this before anyone listens. */
  readonly happinessBelow: number;
  readonly crackPerWhore: number;
  readonly beerPerThug: number;
  readonly whoresPerSurvivor: number;
  readonly thugsPerSurvivor: number;
}

export interface CombatStrategyRules {
  readonly intel: {
    readonly turnCost: number;
    readonly expiresMinutes: number;
  };
  readonly retaliation: {
    readonly revengeHours: number;
    readonly bypassProtection: boolean;
    readonly bypassMinimumStrength: boolean;
  };
}

/** A percentage rolled between two bounds, weighted toward the low end. */
export interface WeightedPercentRange {
  readonly minPercent: number;
  readonly maxPercent: number;
  /** Above 1 pulls rolls toward `minPercent`; the top stays possible but rare. */
  readonly exponent: number;
}

/**
 * Drive-bys: a hit-and-run from Low-Riders that takes nothing and leaves the
 * target weaker. Shooters ride in cars; a car comes home as long as anyone in
 * it does, and is lost when its whole crew goes down.
 */
export interface DriveByRules {
  readonly turnCost: number;
  /** Shooters per Low-Rider. The squad can never outnumber the seats. */
  readonly thugsPerLowRider: number;
  /** The shooter's own wait between drive-bys. Separate from the raid clock. */
  readonly cooldownMinutes: number;
  /** How long a block that was shot up is left alone by everybody. */
  readonly protectionHours: number;
  /** Share of the target's fit crew out front to shoot back. */
  readonly defenderFieldedFraction: number;
  /** The target's bonus when shooting back. 1 means none. */
  readonly defenseMultiplier: number;
  /** What a successful drive-by does to the target. Nothing is taken. */
  readonly hit: {
    /** Of the target's fit thugs, wounded on the usual recovery clock. */
    readonly thugWounds: WeightedPercentRange;
    /** Of the target's whores, killed for good. */
    readonly whoreKills: WeightedPercentRange;
    /** Each shooter can drop at most this many of each. */
    readonly perShooterThugWounds: number;
    readonly perShooterWhoreKills: number;
  };
  /** Chance each shooter goes down, rolled person by person. */
  readonly casualties: {
    /** Return fire when the drive-by lands. */
    readonly onHit: number;
    /** When the target's crew wins the exchange... */
    readonly onMissBase: number;
    /** ...plus this for every 1.0 their strength exceeds yours by. */
    readonly onMissPerMargin: number;
    readonly max: number;
  };
}

export interface Ruleset {
  /** Absent on economic-only rounds. */
  readonly combat?: import('./combat-prototype.js').CombatModel & {
    readonly newcomerHours: number;
    readonly protectionHours: number;
    readonly cooldownMinutes: number;
    readonly minimumTargetStrengthRatio: number;
    readonly strategy?: CombatStrategyRules;
    /** Absent where drive-bys have not shipped. */
    readonly driveBy?: DriveByRules;
    /** Optional old-school raid forms that share the raid clock and shield. */
    readonly specialRaids?: {
      readonly DRUG_HOES?: DrugHoesRules;
      readonly STEAL_RIDE?: StealRideRules;
      readonly LURE_CREW?: LureCrewRules;
    };
  };
  readonly meta: RulesetMeta;
  readonly round: RoundRules;
  readonly turns: TurnRules;
  readonly economy: EconomyRules;
  readonly happiness: HappinessRules;
  readonly districts: Districts;
  readonly scouting: ScoutingRules;
  readonly production: ProductionRules;
  readonly departures: DepartureRules;
  readonly health: HealthRules;
  readonly stores: { readonly [K in StoreKey]: Store };
  readonly storeBulkHelpers: readonly number[];
  readonly lowRiderThugCapacity: number;
  readonly weapons: { readonly [K in WeaponKey]: Weapon };
  readonly weaponUnlocks: { readonly [K in WeaponUnlockKey]: WeaponUnlockRule };
  readonly reputation: ReputationRules;
  readonly quests: { readonly [K in QuestKey]: QuestRule };
  /**
   * New event-driven handcrafted quests. Optional keeps all historical rulesets
   * valid; a later ruleset version opts in by publishing a catalog.
   */
  readonly questDefinitions?: QuestDefinitionCatalog;
  /** Named quest contacts and their relationship tracks. */
  readonly contacts?: ContactCatalog;
  readonly rankings: RankingRules;
  /** Optional round privacy for public community surfaces. */
  readonly communityPrivacy?: CommunityPrivacyRules;
  /** Optional seasonal money sink. Mechanical levels reset with each round. */
  readonly hideout?: HideoutRules;
  /** 0.3.0-C. Absent where alliances have not shipped. */
  readonly alliances?: AllianceRules;
  /** 0.4.0-A. Absent on rounds where Product is still only crack. */
  readonly products?: ProductCatalog;
  /** 0.4.0-B. Absent where work supply policies have not shipped. */
  readonly workSupply?: WorkSupplyRules;
  /** 0.4.0-C. Absent where Heat has not shipped. */
  readonly heat?: HeatRules;
  /**
   * 0.4.0-D. Present where every product is traded, cooked, looted and valued.
   * Raids and drug runs then take a mix of products rather than crack alone.
   */
  readonly productEconomy?: ProductEconomyRules;
  /** 0.4.0-E. Absent where thugs burn no product in fights. */
  readonly combatSupply?: CombatSupplyRules;
  /** 0.5.0-A. Absent where cities are all alike and nobody travels. Keyed by City slug. */
  readonly cities?: { readonly [slug: string]: CityRules };
  /** 0.5.0-A. Absent where nobody travels. */
  readonly travel?: TravelRules;
  /** 0.6.0-A. Absent where the street belongs to nobody. */
  readonly turf?: TurfRules;
  readonly evidence: EvidenceRules;
}
