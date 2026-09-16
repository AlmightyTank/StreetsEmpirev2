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
export type WeaponUnlockKey = 'SHOTGUN' | 'TEK9' | 'AK47';
export type HideoutRoomKey = 'SAFE_ROOM' | 'LOOKOUTS' | 'WORKSHOP' | 'BACK_OFFICE';

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
}

export interface HideoutRules {
  readonly rooms: { readonly [K in HideoutRoomKey]: HideoutRoomRule };
  readonly buffs: {
    readonly safeRoomProtectedCashCentsPerLevel: number;
    readonly lookoutsDefenseBonusPercentPerLevel: number;
    readonly workshopCrackBonusPercentPerLevel: number;
    readonly backOfficeTakeBonusPercentPerLevel: number;
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
  readonly rankings: RankingRules;
  /** Optional round privacy for public community surfaces. */
  readonly communityPrivacy?: CommunityPrivacyRules;
  /** Optional seasonal money sink. Mechanical levels reset with each round. */
  readonly hideout?: HideoutRules;
  /** 0.3.0-C. Absent where alliances have not shipped. */
  readonly alliances?: AllianceRules;
  readonly evidence: EvidenceRules;
}
