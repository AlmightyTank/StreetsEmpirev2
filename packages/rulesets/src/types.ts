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
export type WeaponUnlockKey = 'TEK9' | 'AK47';

export interface WeaponUnlockRule {
  readonly title: string;
  readonly description: string;
  readonly workTurns: number;
  readonly thugs: number;
  readonly prerequisite: WeaponUnlockKey | null;
  readonly cashCents: number;
  readonly crack: number;
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

export interface RoundRules {
  readonly defaultDurationDays: number;
  readonly publicPimpIdStart: number;
  readonly startingCitySlug: string;
  readonly startingPlayer: StartingPlayer;
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
    readonly perWhoreCents: number;
    readonly perThugCents: number;
    readonly perLowRiderCents: number;
    readonly perMedicineCents: number;
    readonly perCrackCents: number;
    readonly perCondomCents: number;
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
    readonly condomsPerWhore: number;
    readonly maxCondomPenalty: number;
    readonly crackPerWhore: number;
    readonly maxCrackPenalty: number;
    readonly whoresPerThug: number;
    readonly maxProtectionPenalty: number;
  };
  readonly fatigue: {
    readonly max: number;
    /** Wear shed per turn-regeneration interval of rest. */
    readonly restPerInterval: number;
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

/** Scouting is turns spent looking for people. It earns nothing. */
export interface ScoutingRules {
  readonly turnCostPerScout: number;
  readonly minTurns: number;
  readonly districts: Districts;
  /** Crew size at which a district yields half its headline recruit rate. */
  readonly recruitment: {
    readonly whoreSoftCap: number;
    readonly thugSoftCap: number;
  };
  readonly variance: number;
}

/** Work the Streets is the only action that makes money. */
export interface WorkRules {
  readonly turnCostPerRun: number;
  readonly minTurns: number;
  readonly districts: Districts;
  readonly grossPerWhorePerTurnCents: number;
  readonly minHappinessMultiplier: number;
  readonly variance: number;
  /** Extra wear per fully unsupplied turn, scaled by the missing fraction. */
  readonly shortages: {
    readonly whorePerTurnWithoutCondoms: number;
    readonly thugPerTurnWithoutBeer: number;
  };
  readonly consumption: {
    readonly condomsPerWhorePerTurn: number;
    readonly crackPerWhorePerTurn: number;
    readonly beerPerThugPerTurn: number;
  };
  readonly fatigue: {
    readonly whorePerTurn: number;
    readonly thugPerTurn: number;
    /** Take per head per turn that exactly cancels a turn's wear. */
    readonly fairTakePerHeadPerTurnCents: number;
    readonly maxReliefMultiple: number;
  };
  readonly exposure: {
    readonly maxTakePenalty: number;
    readonly maxExtraFatigue: number;
  };
  readonly finds: {
    readonly chancePerTurn: number;
    readonly crackMin: number;
    readonly crackMax: number;
  };
}

// --- production -------------------------------------------------------------

/** Cooking is turns and cash in, crack out. It earns nothing. */
export interface ProductionRules {
  readonly turnCostPerRun: number;
  readonly minTurns: number;
  readonly crack: {
    readonly perThugPerTurn: number;
    readonly minHappinessMultiplier: number;
    readonly variance: number;
    readonly ingredientCentsPerRock: number;
  };
  readonly consumption: {
    readonly beerPerThugPerTurn: number;
  };
  readonly fatigue: {
    readonly thugPerTurn: number;
  };
}

/** When unhappy people give up and walk. Shared by every action. */
export interface DepartureRules {
  readonly happinessThreshold: number;
  readonly maxFractionPerAction: number;
}

// --- stores and weapons -----------------------------------------------------

export interface Weapon {
  readonly field: ResourceField;
  readonly name: string;
  readonly buyCents: number;
  readonly sellCents: number;
  /** Unused until 0.2.0 combat. */
  readonly power: number;
}

export interface StoreItem {
  readonly unlockKey?: WeaponUnlockKey;
  readonly name: string;
  readonly field: ResourceField;
  readonly buyCents: number;
  /** Null means the store does not buy this back. */
  readonly sellCents: number | null;
}

export interface Store {
  readonly slug: string;
  readonly name: string;
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

export interface EvidenceRules {
  readonly enabled: boolean;
  readonly perScout: number;
  readonly perProduce: number;
  readonly perStoreTransaction: number;
  readonly decayPerInterval: number;
  readonly bustThreshold: number;
}

// --- the ruleset ------------------------------------------------------------

export interface Ruleset {
  readonly meta: RulesetMeta;
  readonly round: RoundRules;
  readonly turns: TurnRules;
  readonly economy: EconomyRules;
  readonly happiness: HappinessRules;
  readonly districts: Districts;
  readonly scouting: ScoutingRules;
  readonly work: WorkRules;
  readonly production: ProductionRules;
  readonly departures: DepartureRules;
  readonly stores: { readonly [K in StoreKey]: Store };
  readonly storeBulkHelpers: readonly number[];
  readonly lowRiderThugCapacity: number;
  readonly weapons: { readonly [K in WeaponKey]: Weapon };
  readonly weaponUnlocks: { readonly [K in WeaponUnlockKey]: WeaponUnlockRule };
  readonly rankings: RankingRules;
  readonly evidence: EvidenceRules;
}
