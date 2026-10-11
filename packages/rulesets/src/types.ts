Warning: truncated output (original token count: 36412)
Total output lines: 3535

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
  | 'lowRiders'
  /** 1.5.0-E2. Sedans and Vans sold over Charlie's counter. */
  | 'sedans'
  | 'vans';

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
/** @deprecated Historical one-favor-per-store key. New jobs use QuestDefinition.key. */
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
    /** Historical cap on passive store-visit standing. */
    readonly maxPoints: number;
  };
  /**
   * @deprecated Historical one-time favor award. Current quest/contact
   * reputation is granted by QuestDefinition CONTACT_REP rewards.
   */
  readonly questPoints: number;
}

/**
 * @deprecated Historical pre-Jobs favor definition retained so pinned older
 * rulesets remain loadable. Current gameplay uses QuestDefinitionCatalog.
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
  | 'CITY_CONTRACT'
  | 'EVENT'
  /** 1.4.0-B2. Round-long board goals, dealt per round; one attempt each. */
  | 'SEASON';

export type QuestDifficulty =
  | 'STREET_JOB'
  | 'CONTRACT'
  | 'SERIOUS_BUSINESS'
  | 'HIGH_RISK'
  | 'KINGPIN_CONTRACT';

export type QuestRepeatability = 'ONCE' | 'DAILY' | 'WEEKLY' | 'REPEATABLE';

export interface SeasonalEventWindow {
  /** Inclusive UTC start; seasonal jobs cannot be newly accepted before this instant. */
  readonly startsAt: string;
  /** Exclusive UTC end; seasonal jobs cannot be newly accepted at or after this instant. */
  readonly endsAt: string;
  /** Stable event key used by admin/event tooling and UI copy. */
  readonly eventKey: string;
}

export type QuestPrerequisiteKind =
  | 'QUEST_COMPLETED'
  | 'CONTACT_REP_AT_LEAST'
  | 'BRANCH_CHOSEN'
  /** 1.4.0-B. params: { factionKey, tier } — the player's standing with the faction is at that tier or above. */
  | 'FACTION_STANDING_AT_LEAST'
  /** 1.4.0-E. params: { factionKey, tier } — the player's standing with the faction is below that tier. */
  | 'FACTION_STANDING_BELOW';

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
  | 'STATE_AT_LEAST'
  | 'UNIQUE_VALUES'
  | 'TURF_HOLD_HOURS';

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
  /** Credited distinct strings for UNIQUE_VALUES objectives. */
  readonly values?: readonly string[];
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
  | 'WEAPON_ACCESS'
  | 'PERMANENT_UNLOCK'
  | 'FAVOR_ITEM'
  | 'COSMETIC_UNLOCK'
  /** Street Pass. Any product in the round's catalog, keyed by product key (WEED, METH...). */
  | 'PRODUCT'
  /**
   * 1.4.0-B. Standing with the faction keyed by `key`. One-time Jobs only, and only for a faction
   * the Job works for or helps; paid by the Job claim with a receipt, never by grantRewards.
   */
  | 'FACTION_STANDING';

export interface QuestRewardDefinition {
  readonly kind: QuestRewardKind;
  readonly amount?: number;
  readonly key?: string;
  readonly params?: QuestDataObject;
}

export interface QuestBranchReputationDelta {
  readonly contactKey: ContactKey;
  readonly amount: number;
}

export interface QuestBranchDefinition {
  readonly key: string;
  readonly title: string;
  readonly description: string;
  readonly rewards: readonly QuestRewardDefinition[];
  readonly reputationDeltas: readonly QuestBranchReputationDelta[];
  readonly followUpKeys: readonly string[];
}

export interface QuestStoryDefinition {
  /** Optional chapter label for story/tutorial ordering, e.g. "Lesson 1". */
  readonly chapter: string;
  /** Contact-flavored setup shown before or while the job is available. */
  readonly intro: string;
  /** Contact-flavored reminder while the job is active. */
  readonly inProgress: string;
  /** Contact-flavored payoff once objectives are ready to collect. */
  readonly ready: string;
  /** Contact-flavored closing line after payment is collected. */
  readonly completed: string;
  /** Plain-language system lesson this job is teaching. */
  readonly lesson: string;
  /** Short actionable nudge toward the screen/action that advances the job. */
  readonly actionHint: string;
}

export type ContactKey =
  | 'MAMA_KING'
  | 'PIP'
  | 'TOMMY'
  | 'WHEELS'
  | 'VIC'
  | 'BLOCKS'
  /** 1.2.0-F. The casino host. */
  | 'ACE'
  /** 1.3.0-F. The retired records sergeant who gives law Jobs. */
  | 'LEDGER';

export interface ContactDefinition {
  readonly key: ContactKey;
  readonly name: string;
  readonly shortName: string;
  readonly role: string;
  readonly description: string;
  /**
   * 1.4.0-A. The faction this contact works for. Absent before 1.4, and on a contact who
   * belongs to none (then `independent` says why).
   */
  readonly factionKey?: FactionKey;
  /** 1.4.0-A. Why a contact belongs to no faction, shown to players. */
  readonly independent?: string;
}

/** 1.4.0-A. The underworld factions a round can have. */
export type FactionKey = 'KINGS' | 'OUTFIT' | 'ROAD_SAINTS' | 'CARTEL_LINE' | 'CIVIC_HANDSHAKE';

export interface FactionDefinition {
  readonly key: FactionKey;
  readonly name: string;
  readonly shortName: string;
  /** Who they are, in a line. */
  readonly identity: string;
  /** The part of the game they live in. */
  readonly lane: string;
  readonly description: string;
  /** Factions this one is set against. Every rivalry is listed on both sides. */
  readonly rivals: readonly FactionKey[];
  /** Faces with no contact of their own, e.g. Civic Handshake's payroll officials. */
  readonly facesNote?: string;
}

export type FactionCatalog = Readonly<Partial<Record<FactionKey, FactionDefinition>>>;

/** 1.4.0-B. The standing tiers above Unknown, lowest first. */
export type FactionTier = 'UNKNOWN' | 'KNOWN' | 'TRUSTED' | 'CONNECTED' | 'INNER_CIRCLE';

/**
 * 1.4.0-B. Seasonal standing with each faction. It starts at zero every round and only ever
 * comes from the player's own Jobs: a one-time Job that pays a contact reputation also pays
 * that contact's faction `perContactRep` standing for each point.
 */
export interface FactionStandingRules {
  /** Standing at which each tier above Unknown starts. Ascending. */
  readonly tiers: { readonly known: number; readonly trusted: number; readonly connected: number; readonly innerCircle: number };
  /** The most standing a player can hold with one faction. */
  readonly max: number;
  /** Standing per point of contact reputation a one-time Job pays. */
  readonly perContactRep: number;
}

/** Contacts present in a round. Later contacts (Ace, 1.2.0-F) are absent from older catalogs. */
export type ContactCatalog = Readonly<Partial<Record<ContactKey, ContactDefinition>>>;

export type PermanentUnlockEffect =
  | {
      readonly kind: 'WEAPON_ACCESS';
      readonly weapon: WeaponUnlockKey;
    }
  | {
      /** Trips D. Tommy's people in other cities rent guns to a boss's bodyguards. */
      readonly kind: 'GUN_CONNECT';
    }
  | {
      readonly kind: 'PRODUCT_PURCHASE_ACCESS';
      readonly productKey: string;
    }
  | {
      /** Opens a product's cookhouse recipe without granting purchase access. */
      readonly kind: 'PRODUCT_PRODUCTION_ACCESS';
      readonly productKey: string;
    }
  | {
      /** Allows Scout and Turf access to a district while leaving it visible on the district list. */
      readonly kind: 'DISTRICT_ACCESS';
      readonly districtKey: DistrictKey;
    }
  | {
      /** 1.5.0-E2. Charlie sells this vehicle class. */
      readonly kind: 'VEHICLE_PURCHASE_ACCESS';
      readonly classId: 'SEDAN' | 'VAN';
    };

export interface PermanentUnlockDefinition {
  readonly key: string;
  readonly name: string;
  readonly description: string;
  readonly category: 'WEAPON' | 'PRODUCT' | 'TRAVEL' | 'VEHICLE';
  readonly effect: PermanentUnlockEffect;
}

export type PermanentUnlockCatalog = Readonly<Record<string, PermanentUnlockDefinition>>;

/**
 * `ITEM_COLLECTION` unlocks one authored art collection (its `styleKey` is the
 * collection key, e.g. 'cartel-gold') for every customizable item and crew type.
 */
export type QuestCosmeticKind = 'TITLE_BADGE' | 'PROFILE_FRAME' | 'ACCENT' | 'SITE_THEME' | 'HIDEOUT_DECOR' | 'ITEM_COLLECTION';
export type QuestCosmeticRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export interface QuestCosmeticDefinition {
  readonly key: string;
  readonly name: string;
  readonly description: string;
  readonly kind: QuestCosmeticKind;
  readonly rarity: QuestCosmeticRarity;
  /** Stable presentation slug. Stored with the account unlock for future ruleset compatibility. */
  readonly styleKey?: string;
}

export type QuestCosmeticCatalog = Readonly<Record<string, QuestCosmeticDefinition>>;

/**
 * Street Pass. A free reward track that runs with a round: players earn
 * Street Cred from contracts, jobs and turns spent, and claim a reward at each
 * tier. Rewards reuse the Jobs reward shape so they grant and label the same way.
 */
export interface StreetPassRules {
  /** Stable id for this track (one per season), e.g. 'street-pass-s1'. Claims are recorded against it. */
  readonly key: string;
  readonly name: string;
  /** Cred needed for each tier, as contiguous ranges covering tier 1 to the last tier. */
  readonly credPerTier: readonly StreetPassTierCost[];
  readonly sources: StreetPassCredSources;
  readonly lateJoin: StreetPassLateJoin;
  /** Tiers 1..N in order, each paying one or more rewards. */
  readonly tiers: readonly StreetPassTier[];
}

export interface StreetPassTierCost {
  readonly fromTier: number;
  readonly toTier: number;
  readonly cred: number;
}

export interface StreetPassCredSources {
  readonly dailyContract: number;
  readonly weeklyContract: number;
  /** Cred per turn spent on actions, up to `dailyTurnCap` Cred a day. */
  readonly perTurnSpent: number;
  readonly dailyTurnCap: number;
  /** Story, side and secret Jobs (one-time). */
  readonly oneTimeJob: number;
  /** Event, city and alliance contracts. */
  readonly eventContract: number;
}

export interface StreetPassLateJoin {
  /** Bonus Cred for each full week the round had run when the player joined. */
  readonly bonusPercentPerWeek: number;
  readonly maxBonusPercent: number;
}

export interface StreetPassTier {
  readonly tier: number;
  readonly rewards: readonly QuestRewardDefinition[];
}

export type FavorRarity = 'COMMON' | 'UNCOMMON' | 'RARE' | 'EPIC' | 'LEGENDARY';

export type FavorCategory = 'STREET' | 'UNDERWORLD' | 'MUSCLE';

export type FavorActivation =
  | {
      readonly kind: 'TIMED';
      readonly category: FavorCategory;
      readonly durationMinutes: number;
    }
  | {
      readonly kind: 'SINGLE_USE';
      readonly category: FavorCategory;
    };

export type SingleUseFavorEffect =
  | {
      readonly kind: 'STORE_BUY_DISCOUNT';
      readonly storeKey: StoreKey;
      readonly itemKeys: readonly string[];
      readonly discountPercent: number;
    }
  | {
      readonly kind: 'FREE_RECON';
    }
  | {
      readonly kind: 'FREE_TREATMENT';
    }
  | {
      /** Next successful Heat bribe costs no cash. */
      readonly kind: 'FREE_HEAT_BRIBE';
    }
  | {
      /** Next successful run launch skips the outbound road-stop roll. */
      readonly kind: 'CLEAR_FIRST_ROAD_STOP';
    }
  | {
      /** Locals stand down on the next otherwise-valid unheld turf claim. */
      readonly kind: 'LOCAL_TURF_STANDDOWN';
    };

export type TimedFavorEffect =
  | {
      readonly kind: 'SCOUT_BOOST';
      readonly incomePercent: number;
      readonly recruitmentPercent: number;
    }
  | {
      readonly kind: 'PRODUCTION_BOOST';
      readonly outputPercent: number;
    }
  | {
      readonly kind: 'PIP_BUY_DISCOUNT';
      readonly discountPercent: number;
    }
  | {
      readonly kind: 'TREATMENT_EFFICIENCY';
      readonly medicineEfficiencyPercent: number;
    };

export interface FavorDefinition {
  readonly key: string;
  readonly name: string;
  readonly description: string;
  readonly contactKey: ContactKey;
  /** Catalog-only presentation tier. Older pinned rulesets default to COMMON. */
  readonly rarity?: FavorRarity;
  readonly activation: FavorActivation;
  /**
   * Phase K effect for timed favors. Optional so 0.7-I remains an inventory-only
   * pinned ruleset and single-use favors can wait for Phase L.
   */
  readonly effect?: TimedFavorEffect | SingleUseFavorEffect;
}

export type FavorCatalog = Readonly<Record<string, FavorDefinition>>;

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
  /** Rare Phase R choices committed at turn-in. Omit for normal linear Jobs. */
  readonly branches?: readonly QuestBranchDefinition[];
  /** Optional story/tutorial copy presented by the client without changing mechanics. */
  readonly story?: QuestStoryDefinition;
  readonly followUpKeys: readonly string[];
  readonly repeatability: QuestRepeatability;
  /** Null means the accepted quest has no timer. */
  readonly expiresAfterMinutes: number | null;
  readonly availability: QuestDataObject & {
    readonly seasonalEvent?: SeasonalEventWindow;
  };
  /**
   * 1.4.0-B. The faction this Job works for, when it has no giver (Civic Handshake) or to say so
   * outright. A giver who works for a faction always works for that one.
   */
  readonly factionKey?: FactionKey;
  /**
   * 1.4.0-B. Other factions this Job openly helps; they earn standing from it too. A Job pays
   * standing only to the faction it works for, these, and the side a branch picks.
   */
  readonly helps?: readonly FactionKey[];
  /**
   * 1.4.0-E. Vic's introductions: a broker's Job that starts the player at Known with this
   * faction. Paid by the claim (never a standing reward), only from an independent giver, and
   * only while the player is below Known with it.
   */
  readonly introduces?: FactionKey;
  /**
   * 1.4.0-E. Cash the claim takes, like a bribe: a share of net worth with a floor. The claim is
   * refused when the player cannot pay it.
   */
  readonly fee?: { readonly netWorthShare: number; readonly minCents: number };
}

export type QuestDefinitionCatalog = Readonly<Record<string, QuestDefinition>>;

/** 1.4.0-C. The boards whose contracts a faction can sponsor. */
export type SponsoredBoard = 'DAILY' | 'WEEKLY' | 'CITY_CONTRACT' | 'SEASON' | 'ALLIANCE';

/**
 * 1.4.0-C. Sponsored contracts. Every board contract is sponsored by the faction it helps: its
 * giver's faction, or, when the giver works for no faction (or there is none), the faction whose
 * lane the work is in. A completed contract pays its sponsor standing; nothing else changes.
 */
export interface ContractSponsorRules {
  /** Standing a completed contract pays its sponsor, by board. A board left out pays none. */
  readonly standing: Readonly<Partial<Record<SponsoredBoard, number>>>;
  /**
   * Who may sponsor work whose giver has no faction, by contract category. City contracts use
   * CITY_SELL, CITY_TRIP and CITY_CASINO by kind. A category left out has no sponsor (Ace's
   * casino work, Ledger's law work). With two candidates, the board leans one way per player.
   */
  readonly lanes: Readonly<Record<string, readonly FactionKey[]>>;
  /**
   * The lean: extra weight for a candidate the player is Known with or above (1 makes it twice
   * as likely). The board itself never changes; only which candidate sponsors it.
   */
  readonly knownLean: number;
}

/**
 * 1.4.0-D. The one small price or cost a faction shades for a player Connected with it, each
 * inside a system that already exists:
 * - CORNER_UPKEEP: the beer and product a held corner burns (The Kings).
 * - TOMMY_WEAPONS: what Tommy charges for guns (The Outfit).
 * - BODYGUARD_TICKETS: the plane tickets for bodyguards flying with the boss (Road Saints MC).
 * - PIP_PRODUCT: what Pip charges for product, at his store and his counter (The Cartel Line).
 * - OFFICIAL_EXPOSURE: the Internal Affairs exposure each official's favor adds (Civic Handshake).
 */
export type FactionNudgeKind = 'CORNER_UPKEEP' | 'TOMMY_WEAPONS' | 'BODYGUARD_TICKETS' | 'PIP_PRODUCT' | 'OFFICIAL_EXPOSURE';

/**
 * 1.4.0-D. Faction perks. Known with a faction brings its information, Trusted its early
 * warnings, and Connected its nudge: a small whole percentage off one thing, capped by the
 * validator. Every warning reads the player's own state or the round's public schedule, never
 * another player's.
 */
export interface FactionPerkRules {
  /** Each faction's Connected nudge. A faction left out has none. */
  readonly nudges: Readonly<Partial<Record<FactionKey, { readonly kind: FactionNudgeKind; readonly percent: number }>>>;
  readonly warnings: {
    /** The Kings: hours ahead they warn a corner will run dry, or a held block's shield ends. */
    readonly cornerLeadHours: number;
    /** The Outfit: hours before the crackdown's public warning they say where it lands. */
    readonly sweepLeadHours: number;
    /** Road Saints MC: a run's next road is hot at or above this stop chance (0..1). */
    readonly hotRoadChance: number;
    /** The Cartel Line: hours ahead they hear of a drought, or of Pip running out. */
    readonly supplyLeadHours: number;
    /** Civic Handshake: Case points short of the next stage at which they warn. */
    readonly stageLeadPoints: number;
  };
}

/**
 * 1.4.0-E. Rivalries at the top. Reaching Inner Circle with a faction locks every one of its
 * rivals' Inner Circles for the season: standing with a locked faction keeps climbing, but stops
 * one point short of Inner Circle. Nothing below Inner Circle costs standing anywhere.
 */
export interface FactionRivalryRules {
  readonly innerCircleLock: true;
}

/**
 * 1.4.0-F. What standing shows the world. Reaching a tier awards that faction's cosmetics once
 * per account; from `publicFrom` a profile shows the tier (never the points); reaching
 * `feedFrom` is posted to the public street feed. Cosmetics never change anything in play.
 */
export interface FactionPublicRules {
  /** Cosmetic keys awarded on reaching each tier, per faction. Every key is in `cosmetics`. */
  readonly rewards: Readonly<Partial<Record<'CONNECTED' | 'INNER_CIRCLE', Readonly<Partial<Record<FactionKey, readonly string[]>>>>>>;
  readonly publicFrom: 'CONNECTED' | 'INNER_CIRCLE';
  readonly feedFrom: 'INNER_CIRCLE';
}

/** 1.4.0-B2 contract board rotation. */
export interface ContractRotationRules {
  /**
   * Daily and weekly boards deal from a shuffled deck seeded by the round, so each
   * round gets its own order, every contract is dealt once per pass through the
   * pool, and none comes back within about half the pool.
   */
  readonly perRoundDeck: boolean;
  /**
   * City boards never post two orders in the same city, and avoid the cities the
   * previous 12-hour board posted whenever another city has an order.
   */
  readonly freshCityBoards: boolean;
  /**
   * City boards add a third slot: a city job (fly in and back, or play that city's
   * casino) in a city the market orders did not pick. Needs a CITY_JOB template.
   */
  readonly cityJobs?: boolean;
}

export interface RulesetMeta {
  readonly id: string;
  readonly version: string;
  readonly name: string;
  /** Runtime event ownership introduced by a versioned ruleset. */
  readonly eventSystem?: {
    readonly communityEvents?: 'FIRST_CLASS';
    readonly seasonalEvents?: 'FIRST_CLASS';
    readonly randomEncounters?: 'FIRST_CLASS';
  };
}

/** 1.5.0-A. Player-facing vehicle identities; A maps the legacy counter without changing play. */
export interface VehicleClassDefinition {
  readonly id: 'LOW_RIDER' | 'SEDAN' | 'VAN';
  readonly name: string;
  readonly description: string;
  /** Legacy aggregate field used until class-based ownership ships in a later slice. */
  readonly legacyResource: 'lowRiders' | 'sedans' | 'vans';
  /** 1.5.0-B. Capacity and purchase terms are pinned to the round. */
  readonly cargoPercent?: number;
  readonly crewSeats?: number | null;
  readonly purchasePriceCents?: number | null;
  readonly routeProfile?: 'NORMAL' | 'LOW_PROFILE' | 'HIGH_VISIBILITY';
}

export type VehicleClassId = VehicleClassDefinition['id'];

/**
 * 1.5.0-C. Garage service. Road trouble leaves vehicles Damaged or Disabled instead of
 * destroying them; either state keeps the vehicle out of runs and drive-bys until the
 * garage puts it back to Ready for the listed price.
 */
export interface VehicleServiceRules {
  /** Cash to repair one Damaged vehicle, by class. */
  readonly repairCents: Readonly<Record<VehicleClassId, number>>;
  /** Cash to recover one Disabled (impounded or wrecked) vehicle, by class. */
  readonly recoveryCents: Readonly<Record<VehicleClassId, number>>;
  /** Vehicles damaged by a bust in town and by a convoy hit the run loses. */
  readonly damage: { readonly bust: number; readonly convoyLoss: number };
  /** Vehicles impounded by an arrest. */
  readonly disable: { readonly arrest: number };
  /** Which of a run's vehicles take trouble first: the most visible one leads. */
  readonly damageOrder: readonly VehicleClassId[];
  /** 1.5.0-D. The road lane services the fleet for less. Absent: list prices for everyone. */
  readonly specialization?: VehicleSpecializationRules;
}

/**
 * 1.5.0-D. Road specialization. The road-lane businesses and Road Saints MC make keeping a
 * fleet running cheaper; none of them unlocks a vehicle or changes what one does on the road,
 * so no faction or business is the only way to field a fleet.
 */
export interface VehicleSpecializationRules {
  /** Percent off repairs at full strength of the crew's strongest running Auto Garage racket. */
  readonly autoGarageRepairPercent: number;
  /** Percent off recovery at full strength of the Chop Shop's Vehicle recovery racket. */
  readonly chopShopRecoveryPercent: number;
  /** Percent off every repair and recovery with Road Saints MC at `tier` or above. */
  readonly roadSaints: { readonly tier: FactionTier; readonly percent: number };
  /** The most every source together takes off one service. */
  readonly maxDiscountPercent: number;
}

export interface VehicleCatalog {
  readonly classes: readonly VehicleClassDefinition[];
  /** 1.5.0-C. Absent: vehicles are never damaged and the garage has nothing to service. */
  readonly service?: VehicleServiceRules;
  /**
   * 1.5.0-E. Route-risk multiplier for each non-normal route profile. Absent: 1.5.0-B's
   * 0.9 for a low-profile car and 1.15 for a highly visible one.
   */
  readonly routeRisk?: { readonly LOW_PROFILE: number; readonly HIGH_VISIBILITY: number };
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
  readonly npcGang?: NpcGangSeedProfile;
}

export interface RoundRules {
  readonly defaultDurationDays: number;
  readonly publicPimpIdStart: number;
  readonly startingCitySlug: string;
  readonly startingPlayer: StartingPlayer;
  readonly seededRivals?: readonly SeededRivalRule[];
}

export type NpcGangTier = 'SCRUB' | 'STREET' | 'VETERAN' | 'KINGPIN';

export interface NpcGangSeedProfile {
  readonly archetype: string;
  readonly tier: NpcGangTier;
  /** How likely this crew is to pick violent moves once the scheduler is live. */
  readonly aggression: number;
  /** How strongly this crew prefers growth moves like product, turf and rides. */
  readonly ambition: number;
  /** How likely this crew is to wait, restock or lay low instead of forcing a bad move. */
  readonly discipline: number;
  /** Phase M. A fixed public crew name and tag; otherwise one is picked from the personality. */
  readonly crewName?: string;
  readonly crewTag?: string;
}

/** Phase M. The scheduler intents a personality can lean toward or away from. */
export type NpcGangIntentKey = 'RESTOCK' | 'PRODUCE' | 'HUSTLE' | 'RAID_PLAYER' | 'DRIVE_BY_PLAYER' | 'SPECIAL_RAID_PLAYER' | 'TURF' | 'LAY_LOW';

/**
 * One ruleset-authored crew the server can spawn into a live round. It joins like a
 * new player, with the round's starting stock, and grows by playing.
 */
export interface NpcGangRosterEntry {
  readonly slug: string;
  /** The boss, shown as the player name. */
  readonly bossName: string;
  readonly crewName: string;
  readonly crewTag: string;
  /** A key of `NpcGangRules.personalities`. */
  readonly personality: string;
  readonly aggression: number;
  readonly ambition: number;
  readonly discipline: number;
}

/** How many roster crews a live round carries, and how fast they arrive. */
export interface NpcGangSpawnRules {
  readonly enabled: boolean;
  readonly minCrews: number;
  readonly maxCrews: number;
  /** One more crew for every this many active humans in the round. */
  readonly humansPerCrew: number;
  /** A human counts as active if seen inside this many hours. */
  readonly activeHumanHours: number;
  /** At most one new crew per this many minutes, so they arrive over time. */
  readonly spawnEveryMinutes: number;
}

/** Tier follows growth: net worth as a multiple of what the crew started with. */
export interface NpcGangProgressionRules {
  readonly enabled: boolean;
  readonly netWorthMultiple: { readonly STREET: number; readonly VETERAN: number; readonly KINGPIN: number };
}

/** Phase M. Who a crew goes after first among ordinary targets. */
export type NpcGangTargeting = 'RICHEST' | 'WEAKEST' | 'RIDES' | 'PRODUCT' | 'DISTRACTED';

/**
 * Phase M. A named crew style: public identity plus the behavior signature that makes
 * it recognizable on the street. Traits (aggression, ambition, discipline) still set
 * how strongly a gang acts; the personality sets what it reaches for.
 */
export interface NpcGangPersonality {
  /** Public, e.g. "Ride thieves". */
  readonly label: string;
  /** Crew names this style goes by, each with a short tag. */
  readonly names: readonly { readonly name: string; readonly tag: string }[];
  /** One public line on how they operate. */
  readonly style: string;
  /** Older archetype strings that resolve to this personality (exact, then substring). */
  readonly aliases: readonly string[];
  /** Weight added to each intent before the weighted pick. */
  readonly bias: Readonly<Partial<Record<NpcGangIntentKey, number>>>;
  readonly targeting: NpcGangTargeting;
  /** The special raid tried first when one is on the table. */
  readonly favoriteSpecial?: SpecialRaidKind;
  /** Multiplies the squad a gang commits to a hit. */
  readonly squadShare: number;
}

export interface NpcGangRules {
  readonly enabled: boolean;
  readonly tickMinutes: number;
  readonly maxActionsPerTick: number;
  readonly maxPerCity: number;
  /**
   * Phase I. How long a gang remembers a human who hit it, and how long one NPC
   * hit keeps every other NPC off that player (the anti-dogpile window).
   */
  readonly retaliationHours: number;
  /** Phase I. Aggression a valid grudge adds when gating and weighting attack moves. */
  readonly revengeAggressionBoost: number;
  /** Phase I. Flat weight a valid grudge adds to raid, drive-by and special-raid intents. */
  readonly revengeIntentBonus: number;
  /** Phase J. How NPC gangs hold blocks through the same turf actions players use. */
  readonly turf: NpcGangTurfRules;
  /** Phase K. When stronger gangs pack up and relocate to another city. */
  readonly migration: NpcGangMigrationRules;
  /** Phase L. How fights heat a gang up, cool it down or send it to ground. */
  readonly escalation: NpcGangEscalationRules;
  /** Phase M. Named crew styles keyed by archetype. */
  readonly personalities: Readonly<Record<string, NpcGangPersonality>>;
  /** Phase M. The personality an archetype falls back to when nothing matches. */
  readonly defaultPersonality: string;
  /** Phase N. What beating an NPC gang pays, and when beaten or stale gangs are cleaned up. */
  readonly rewards: NpcGangRewardRules;
  /** Real crews: who spawns into live rounds, how many, and how they climb tiers. */
  readonly roster: readonly NpcGangRosterEntry[];
  readonly spawn: NpcGangSpawnRules;
  readonly progression: NpcGangProgressionRules;
}

export type NpcGangRuleOverrides = Partial<Omit<NpcGangRules, 'turf' | 'migration' | 'escalation' | 'rewards' | 'spawn' | 'progression'>> & {
  readonly turf?: Partial<NpcGangTurfRules>;
  readonly migration?: Partial<NpcGangMigrationRules>;
  readonly escalation?: Partial<NpcGangEscalationRules>;
  readonly rewards?: Partial<Omit<NpcGangRewardRules, 'bountyCents'>> & {
    readonly bountyCents?: Partial<Record<NpcGangTier, number>>;
  };
  readonly spawn?: Partial<NpcGangSpawnRules>;
  readonly progression?: Partial<Omit<NpcGangProgressionRules, 'netWorthMultiple'>> & {
    readonly netWorthMultiple?: Partial<Record<Exclude<NpcGangTier, 'SCRUB'>, number>>;
  };
};

export type RandomEncounterTrigger = 'SCOUT' | 'TRAVEL' | 'PRODUCE' | 'STORE' | 'TURF' | 'COMBAT';

export type RandomEncounterTone = 'good' | 'warn' | 'bad' | 'neutral';

export interface RandomEncounterCashEffectRules {
  readonly minCents: number;
  readonly maxCents: number;
}

export interface RandomEncounterNumberEffectRules {
  readonly min: number;
  readonly max: number;
}

export interface RandomEncounterSupplyEffectRules {
  readonly condoms?: RandomEncounterNumberEffectRules;
  readonly medicine?: RandomEncounterNumberEffectRules;
  readonly crack?: RandomEncounterNumberEffectRules;
  readonly beer?: RandomEncounterNumberEffectRules;
}

export interface RandomEncounterChoiceRules {
  readonly key: string;
  readonly label: string;
  readonly text: string;
  readonly cash?: RandomEncounterCashEffectRules;
  readonly heat?: RandomEncounterNumberEffectRules;
  readonly supplies?: RandomEncounterSupplyEffectRules;
}

export interface RandomEncounterEntryRules {
  readonly key: string;
  readonly title: string;
  readonly text: string;
  readonly tone: RandomEncounterTone;
  readonly weight: number;
  readonly cash?: RandomEncounterCashEffectRules;
  readonly heat?: RandomEncounterNumberEffectRules;
  readonly supplies?: RandomEncounterSupplyEffectRules;
  readonly choices?: readonly RandomEncounterChoiceRules[];
  readonly districts?: readonly DistrictKey[];
}

export interface RandomEncounterTriggerRules {
  readonly enabled: boolean;
  /** Chance per eligible action, 0..1. */
  readonly chance: number;
  /** Minimum time before another encounter of this trigger can appear for the same player. */
  readonly cooldownMinutes?: number;
  /** Minimum time before this exact encounter key can repeat for the same player. */
  readonly perKeyCooldownMinutes?: number;
  readonly minTurns?: number;
  readonly entries: readonly RandomEncounterEntryRules[];
}

/**
 * Short-lived street events that attach to ordinary player actions. These are the
 * lighter replacement path for autonomous NPC pressure: the street reacts when a
 * player does something, rather than persistent crews acting off-screen.
 */
export interface RandomEncounterRules {
  readonly enabled: boolean;
  readonly triggers: Readonly<Partial<Record<RandomEncounterTrigger, RandomEncounterTriggerRules>>>;
}

/**
 * Phase N. Bounties are minted by the house, not taken from the gang, so they are capped
 * hard: only a crew that has hit a human recently is wanted, each player collects a few a
 * day and once per crew per cooldown, and each crew pays out a few times a day in total.
 * Over-targeting a crew also sends it to ground (Phase L), which ends its bounty.
 */
export interface NpcGangRewardRules {
  readonly enabled: boolean;
  /** Bounty for beating a wanted crew as the attacker, by its tier. */
  readonly bountyCents: Readonly<Record<NpcGangTier, number>>;
  /** Share of the bounty paid for holding off a wanted crew's hit. */
  readonly defenseShare: number;
  /** A crew is wanted while it has hit a human inside this many hours. */
  readonly wantedHours: number;
  readonly maxPerPlayerPerDay: number;
  readonly perCrewCooldownHours: number;
  readonly maxPerCrewPerDay: number;
  /** Hours other crews in a city stand down after humans send one to ground. */
  readonly reliefHours: number;
  /** A crew that has gone to ground this many times in a round breaks up. */
  readonly retireAfterDormancies: number;
  /** A crew that wakes with fewer thugs than this breaks up. */
  readonly retireBelowThugs: number;
}

/**
 * Phase L. Momentum is rebuilt each tick from the gang's own fights since it last woke,
 * each one fading on `halfLifeHours`. It runs from -`maxMomentum` (beaten) to
 * +`maxMomentum` (on a run) and shifts aggression and pacing; deep enough in the hole,
 * or hit by too many humans, the gang goes dormant and comes back on a clean slate.
 */
export interface NpcGangEscalationRules {
  readonly enabled: boolean;
  readonly windowHours: number;
  readonly halfLifeHours: number;
  /** Momentum per fight, before fading. A profitable win adds `profitBonus` on top. */
  readonly attackWin: number;
  readonly profitBonus: number;
  readonly attackLoss: number;
  readonly defendWin: number;
  readonly defendLoss: number;
  /** Momentum lost per consecutive blocked move. */
  readonly blockedPenalty: number;
  readonly maxMomentum: number;
  /** Aggression shifted per point of momentum, capped at `maxAggressionShift` either way. */
  readonly aggressionPerPoint: number;
  readonly maxAggressionShift: number;
  /** Largest share pacing speeds up (hot) or slows down (cooled), e.g. 0.25. */
  readonly maxPaceShift: number;
  /** Momentum at or above which a gang reads as hot, and at or below which it reads as cooled. */
  readonly hotAt: number;
  readonly coolAt: number;
  /** At or below this momentum a gang goes dormant. */
  readonly dormantBelow: number;
  /** Human hits on the…16412 tokens truncated…ooter's own wait between drive-bys. Separate from the raid clock. */
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


/** 1.2.0-A. What kind of room a city's casino venue is. Games arrive in later 1.2 slices. */
export type CasinoVenueKind = 'FULL_CASINO' | 'PRIVATE_CLUB' | 'UNDERGROUND' | 'NIGHTLIFE';

export interface CasinoVenueRules {
  readonly name: string;
  readonly blurb: string;
  readonly kind: CasinoVenueKind;
  /** 1.2.0-E. Presentation identity for the room. Never changes odds, limits or payouts. */
  readonly identity?: CasinoVenueIdentityRules;
  /** 1.2.0-E. The venue's VIP room. Absent where the venue has none. */
  readonly vipRoom?: CasinoVipRoomRules;
}

/** 1.2.0-E. Casino status ladder, lowest first. */
export type CasinoStatusTierKey = 'WALK_IN' | 'REGULAR' | 'PREFERRED' | 'HIGH_ROLLER' | 'WHALE';

/** 1.2.0-E. The game a venue is known for. Presentation only. */
export type CasinoSignatureGame = 'SLOTS' | 'BLACKJACK' | 'ROULETTE' | 'STREET_DICE' | 'POKER';

/** 1.2.0-E. Which part of a venue a table sits in. Absent means the main floor. */
export type CasinoRoom = 'FLOOR' | 'VIP';

export interface CasinoVenueIdentityRules {
  readonly tagline: string;
  readonly signatureGame: CasinoSignatureGame;
  /** Styling accent for the room. Never mechanical. */
  readonly accent: 'GOLD' | 'NEON' | 'EMERALD' | 'STEEL' | 'OCEAN' | 'ROSE' | 'SUNSET' | 'PEACH';
}

export interface CasinoVipRoomRules {
  readonly name: string;
  readonly blurb: string;
  /** The lowest network status the door staff admit. */
  readonly minTier: CasinoStatusTierKey;
  /**
   * Bodyguards a visiting boss must have flown in with to be admitted. A boss at
   * home in this city has the whole crew behind them and is never asked.
   */
  readonly visitorMinBodyguards: number;
}

export interface CasinoStatusTierRules {
  readonly key: CasinoStatusTierKey;
  readonly name: string;
  /** Round-to-date theoretical house win needed to reach this tier. */
  readonly minTheoCents: number;
  /** Comps earned on each rated wager, in basis points of that wager's theo. */
  readonly compRateBps: number;
  /** The largest session bankroll this tier may open. */
  readonly maxBankrollCents: number;
}

/**
 * 1.2.0-E. Rated play. Every charged wager is rated at its theoretical house win
 * ("theo": wager x pinned house edge), never at what was actually won or lost.
 * Theo drives status tiers and comps. Status gates VIP rooms and bankroll size
 * only: it is never an input to any game's odds, shuffle, roll or payout.
 */
export interface CasinoStatusRules {
  readonly tiers: readonly CasinoStatusTierRules[];
  /** House edge used to rate each wager, in bps. Slots use the machine's effective RTP. */
  readonly ratingEdgeBps: {
    readonly blackjackStandsSoft17: number;
    readonly blackjackHitsSoft17: number;
    readonly rouletteAmerican: number;
    readonly rouletteEuropean: number;
    readonly streetDiceLine: number;
    /** True odds carry no house edge, so they rate at zero. */
    readonly streetDiceOdds: number;
  };
  readonly comps: {
    /** Comps can pay for hotel extensions on a Boss Trip to a casino city. */
    readonly hotelExtensions: boolean;
  };
  /** Operating a Casino Front in a venue's city. Absent where fronts give no house pass. */
  readonly casinoFront?: {
    readonly minLevel: number;
    /** The house knows the owner: that venue's VIP room opens regardless of status. */
    readonly grantsVipAccess: boolean;
    /** Extra comps on play at that venue, in bps of theo. */
    readonly compBonusBps: number;
  };
}

/** 1.2.0-B. One weighted symbol on a server-authoritative slot reel. */
export interface CasinoSlotSymbolRules {
  readonly key: string;
  readonly label: string;
  readonly glyph: string;
  readonly weight: number;
}

/** One selectable line through the visible slot grid. Each row is 0=top, 1=middle, 2=bottom. */
export interface CasinoSlotPaylineRules {
  readonly key: string;
  readonly name: string;
  /** One visible row index for each reel, left to right. */
  readonly rows: readonly number[];
}

/** 1.2.0-B. A ruleset-pinned video slot with a three-row reel window and selectable paylines. */
export interface CasinoSlotMachineRules {
  readonly key: string;
  readonly name: string;
  readonly blurb: string;
  readonly venueKinds: readonly CasinoVenueKind[];
  readonly reels: 3 | 4 | 5;
  readonly rows: 3;
  readonly minBetPerLineCents: number;
  readonly maxBetPerLineCents: number;
  readonly betStepCents: number;
  readonly symbols: readonly CasinoSlotSymbolRules[];
  /**
   * One circular virtual strip per reel. A server-selected stop is the middle
   * visible row; the rows above/below come from the adjacent strip positions.
   */
  readonly reelStrips: readonly (readonly string[])[];
  readonly paylines: readonly CasinoSlotPaylineRules[];
  /**
   * Total return for one winning line, expressed in basis points of that line's bet.
   * A line pays the longest consecutive same-symbol run from the left, minimum 3 reels.
   */
  readonly linePayoutBps: Readonly<Record<string, Readonly<Partial<Record<3 | 4 | 5, number>>>>>;
  readonly progressive?: {
    readonly symbolKey: string;
    readonly seedCents: number;
    /** Contribution is funded on every nominal spin, including a comped free spin. */
    readonly contributionBps: number;
    readonly eligibleBetPerLineCents: number;
    readonly requiresAllPaylines: boolean;
  };
  readonly freeSpins?: {
    /** Chance on a paid spin only. 100 = 1.00%. Free spins never retrigger. */
    readonly triggerBps: number;
    readonly presentationLabel: string;
    /** Weighted bundle size after the bonus trigger succeeds. */
    readonly awards: readonly {
      readonly spins: 1 | 2 | 3 | 5 | 10;
      readonly weight: number;
    }[];
  };
}

/** 1.2.0-C. One ruleset-pinned blackjack table. */
export interface CasinoBlackjackTableRules {
  readonly key: string;
  readonly name: string;
  readonly blurb: string;
  readonly venueKinds: readonly CasinoVenueKind[];
  /** 1.2.0-E. VIP tables need VIP room access at the venue. Absent means the floor. */
  readonly room?: CasinoRoom;
  readonly minBetCents: number;
  readonly maxBetCents: number;
  readonly betStepCents: number;
  readonly decks: 1 | 2 | 4 | 6 | 8;
  /** Cut card expressed as cards remaining. A new shoe starts between hands. */
  readonly reshuffleAtRemainingCards: number;
  readonly dealerHitsSoft17: boolean;
  readonly blackjackPayout: {
    readonly numerator: number;
    readonly denominator: number;
  };
  readonly allowDoubleAfterSplit: boolean;
  readonly maxSplitHands: 2 | 3 | 4;
  readonly splitAcesOneCard: boolean;
}

/** 1.2.0-D. Roulette table limits and wheel style. */
export type CasinoRouletteWheel = 'AMERICAN' | 'EUROPEAN';

export interface CasinoRouletteTableRules {
  readonly key: string;
  readonly name: string;
  readonly blurb: string;
  readonly venueKinds: readonly CasinoVenueKind[];
  /** 1.2.0-E. VIP tables need VIP room access at the venue. Absent means the floor. */
  readonly room?: CasinoRoom;
  readonly wheel: CasinoRouletteWheel;
  readonly minBetCents: number;
  readonly maxBetCents: number;
  readonly betStepCents: number;
  readonly maxTotalBetCents: number;
}

/** 1.2.0-D. Street Dice uses a pass-line point cycle with optional true-odds backing. */
export interface CasinoStreetDiceTableRules {
  readonly key: string;
  readonly name: string;
  readonly blurb: string;
  readonly venueKinds: readonly CasinoVenueKind[];
  /** 1.2.0-E. VIP tables need VIP room access at the venue. Absent means the floor. */
  readonly room?: CasinoRoom;
  readonly minBetCents: number;
  readonly maxBetCents: number;
  readonly betStepCents: number;
  readonly maxOddsMultiple: 1 | 2 | 3 | 5;
}

/** 1.2.0-E. Solo Texas Hold’em buy-in and blind structure. */
export interface CasinoPokerRules {
  readonly minBuyInCents: number;
  readonly maxBuyInCents: number;
  readonly bigBlindCents: number;
  readonly raiseCents: number;
  /** House rake on flopped pots, in basis points, up to a hand cap. */
  readonly rakeBps: number;
  readonly rakeCapCents: number;
  readonly venueKinds: readonly CasinoVenueKind[];
}

/** 1.3.0-A. The Wanted ladder's stages, lowest first. */
export type WantedStage = 'QUIET' | 'NOTICED' | 'INVESTIGATION' | 'WARRANT' | 'FEDERAL';

/**
 * 1.3.0-A. Law enforcement: what each city's police have on a player.
 *
 * Heat (0.4.0-C) stays the fast, global noise meter and is not changed by any of this.
 * The Case is the slow, per-city memory on top of it: a number from 0 to `caseMax` for
 * every city a player has drawn Heat in, read as a stage on the Wanted ladder. It is
 * private to its player and resets with the round. A only builds and shows it; later
 * slices add direct evidence, cooling, warrants, officials and lawyers.
 */
export interface LawRules {
  /** The most a Case in one city can hold. */
  readonly caseMax: number;
  /** The Case at which each stage above Quiet starts. Ascending. */
  readonly stages: { readonly noticed: number; readonly investigation: number; readonly warrant: number; readonly federal: number };
  /** Share of the Heat a player draws in a city that becomes Case there. */
  readonly heatToCase: number;
  /**
   * 1.3.0-B. Case points added directly by acts the police write down, on top of the Heat
   * they draw. Absent: only Heat builds a Case.
   */
  readonly evidence?: LawEvidenceRules;
  /**
   * 1.3.0-B. Currency reports: every `thresholdCents` of cash a player moves in one city in
   * one UTC day files a report worth `points`. Day totals add up, so splitting a movement
   * never dodges one. Absent: cash movements are not watched.
   */
  readonly currencyReport?: { readonly thresholdCents: number; readonly points: number };
  /**
   * 1.3.0-B. A Case cools by `decayPerHour` points once its city has seen no evidence from the
   * player's own acts for `quietHours`. Racket Heat, the federal sweep and laundering never
   * restart the quiet clock. Absent: a Case never cools.
   */
  readonly cooling?: { readonly quietHours: number; readonly decayPerHour: number };
  /**
   * 1.3.0-B. Laundering rackets also wash the Case in their own block's city: `casePerHeat`
   * Case points for each point of Heat they could wash, up to `dailyCaseCap` points a UTC day
   * across the crew. It needs no Heat to wash and costs the register nothing more.
   */
  readonly laundering?: { readonly casePerHeat: number; readonly dailyCaseCap: number };
  /**
   * 1.3.0-C. A Case reaching the Warrant stage drafts a warrant against one target, served
   * after a warning window unless answered. Absent: the Case never costs anything.
   */
  readonly warrants?: LawWarrantRules;
  /** 1.3.0-C. Lawyers: a retainer that softens what warrants take, and lawyering up. */
  readonly lawyer?: LawLawyerRules;
  /** 1.3.0-D. Corrupt officials on a weekly payroll, per city, with Internal Affairs exposure. */
  readonly officials?: LawOfficialRules;
  /** 1.3.0-D. Informants: information for cash, never protection. */
  readonly informants?: LawInformantRules;
  /**
   * 1.3.0-E. Each city's police personality, keyed by city slug. A city with no entry is
   * plain: every multiplier 1. Absent: every city is alike.
   */
  readonly cities?: { readonly [slug: string]: LawCityRules };
  /** 1.3.0-E. What a Case at the Federal stage means. Absent: Federal is only a name. */
  readonly federal?: LawFederalRules;
}

/** 1.3.0-E. How one city's police work a Case. */
export interface LawCityRules {
  /** One line the Case panel and informants show. */
  readonly blurb: string;
  /** Multiplies every rise in the Case here. */
  readonly caseSpeed: number;
  /** Multiplies how fast a quiet Case cools here. */
  readonly coolingSpeed: number;
  /** Multiplies a warrant's warning window here. */
  readonly warningHoursMultiplier: number;
}

/** 1.3.0-E. The Feds. */
export interface LawFederalRules {
  /** A warrant drafted while the Case is at Federal has this much of the usual window. */
  readonly warningHoursMultiplier: number;
  /** Extra Case points the federal sweep writes against a player at Federal in the swept city. Private. */
  readonly sweepPoints: number;
  /**
   * Relocating while the city being left is at Federal moves the case: the new home takes the
   * federal case's value (or keeps its own, if higher), and the old city keeps this much.
   */
  readonly transfer: { readonly oldCityCase: number };
}

/** 1.3.0-D. A week of one official, priced like a bribe: a share of net worth, with a floor. */
export interface LawOfficialPrice {
  readonly netWorthShare: number;
  readonly minCents: number;
}

export type LawOfficialRole = 'CAPTAIN' | 'DA' | 'JUDGE' | 'CUSTOMS';

/** 1.3.0-D. What each official does in their city, and what being caught with them costs. */
export interface LawOfficialRules {
  /** Days a week's pay keeps an official working. */
  readonly weekDays: number;
  readonly roles: {
    /** Longer warrant windows, and a word before a Case reaches the Warrant line. */
    readonly CAPTAIN: LawOfficialPrice & { readonly extraWarningHours: number; readonly headsUpPoints: number };
    /** Slows the city's Case, and can quash a warrant there once every `quashEveryDays`. */
    readonly DA: LawOfficialPrice & { readonly slowShare: number; readonly quashEveryDays: number };
    /** Served warrants in the city take less, and lock the boss up for less. */
    readonly JUDGE: LawOfficialPrice & { readonly seizureCut: number; readonly downtimeCut: number };
    /** Airport checks on flights out of the city happen less. Never touches the no-fly line. */
    readonly CUSTOMS: LawOfficialPrice & { readonly checkCut: number };
  };
  readonly exposure: {
    /** Exposure at which Internal Affairs opens a file on an official. */
    readonly line: number;
    /** Hours between the file opening and the sting. */
    readonly iaWarningHours: number;
    /** Case points the sting adds in the official's city. */
    readonly stingPoints: number;
    /** Hours before the same post in the same city can be filled again after a cut or a sting. */
    readonly rehireCooldownHours: number;
    /** Exposure each favor adds. */
    readonly perFavor: {
      readonly captainWindow: number;
      readonly captainTip: number;
      readonly daQuash: number;
      /** Per Case point the DA slowed. */
      readonly daSlowedPoint: number;
      readonly judgeServe: number;
      readonly customsFlight: number;
    };
  };
}

/** 1.3.0-D. What informants charge. */
export interface LawInformantRules {
  /** When and where the federal sweep lands, before it is announced. */
  readonly sweep: LawOfficialPrice;
  /** A city's police lines: where drag, busts and arrests start there, and how hard it presses. */
  readonly city: LawOfficialPrice;
}

/** 1.3.0-C. Warrants and what serving one takes. */
export interface LawWarrantRules {
  /** Hours between a warrant being drafted and served. */
  readonly warningHours: number;
  /** The Case a city drops to once its warrant is served. */
  readonly caseAfterServed: number;
  /** The Case a city drops to once its warrant is answered (lawyered up; quashed from D). */
  readonly caseAfterAnswered: number;
  /** A Hideout raid: shares of the unprotected product and cash at home. */
  readonly hideout: { readonly productSeizedFraction: number; readonly cashFineFraction: number };
  /** A business raid: the racket shuts for a while and the register is fined. The front keeps running. */
  readonly business: { readonly racketShutHours: number; readonly registerFineFraction: number };
  /**
   * Total police losses in a UTC day, as a share of net worth, past which a raid or a served
   * warrant takes less. Busts and arrests count toward it but are never cut by it.
   */
  readonly dailyLossCapNetWorthShare: number;
}

/** 1.3.0-C. Lawyers. */
export interface LawLawyerRules {
  /** A standing lawyer: seizures, fines and warrant lock-ups are cut while one is retained. */
  readonly retainer: {
    readonly days: number;
    /** Price: this share of net worth, never below `minCents`. */
    readonly netWorthShare: number;
    readonly minCents: number;
    /** Share off what a served warrant seizes and fines. */
    readonly seizureCut: number;
    /** Share off a personal warrant's lock-up. */
    readonly downtimeCut: number;
  };
  /** Lawyering up: during the warning window, pay `multiplier` x what the warrant would take, never below `minCents`. */
  readonly lawyerUp: { readonly multiplier: number; readonly minCents: number };
}

/** 1.3.0-B. Direct evidence, in Case points. */
export interface LawEvidenceRules {
  /** A Scout, Produce or run trade busted. */
  readonly bust: number;
  /** A Scout, Produce or run trade ending in arrest. */
  readonly arrest: number;
  /** A run pulled over on the road, charged to the city the leg arrives in. */
  readonly roadStop: number;
  /** Torching your own business during a block war. */
  readonly torch: number;
  /** Winning a block war fought to sack the block. */
  readonly sack: number;
  /** Hitting another crew's run. */
  readonly hijack: number;
}

/**
 * 1.2.0-A. Casino foundation: venues, cashier limits and session bankrolls.
 * 1.2.0-B adds server-authoritative Slots.
 * 1.2.0-C optionally adds reconnect-safe Blackjack.
 * 1.2.0-D adds Roulette and persistent Street Dice.
 * 1.2.0-E adds rated play, status tiers, comps and VIP rooms.
 */
export interface CasinoRules {
  readonly enabled: boolean;
  readonly chipUnitCents: number;
  readonly cashier: {
    readonly minExchangeCents: number;
    readonly maxExchangeCents: number;
  };
  readonly session: {
    readonly minBankrollCents: number;
    readonly maxBankrollCents: number;
  };
  readonly venues: Readonly<Record<string, CasinoVenueRules>>;
  readonly slots?: {
    readonly machines: readonly CasinoSlotMachineRules[];
  };
  readonly blackjack?: {
    readonly tables: readonly CasinoBlackjackTableRules[];
  };
  readonly roulette?: {
    readonly tables: readonly CasinoRouletteTableRules[];
  };
  readonly streetDice?: {
    readonly tables: readonly CasinoStreetDiceTableRules[];
  };
  readonly poker?: CasinoPokerRules;
  readonly status?: CasinoStatusRules;
  /** 1.8.0-E. Pregame sportsbook. Absent: the round takes no sportsbook tickets. */
  readonly sportsbook?: CasinoSportsbookRules;
}

/** 1.8.0. Game-cash limits for pregame moneyline tickets; every value is integer cents or a count. */
export interface CasinoSportsbookRules {
  readonly limits: {
    readonly minStakeCents: number;
    readonly maxStakeCents: number;
    /** Most one ticket can win (payout minus stake). */
    readonly maxProfitCents: number;
    /** One player's total stake on one game, both sides. */
    readonly perGameStakeCents: number;
    readonly openStakeCents: number;
    readonly openTickets: number;
    /** Stake on tickets placed in the last 24 hours. */
    readonly dailyStakeCents: number;
    /** All players' potential winnings on one side of one game. */
    readonly sideLiabilityCents: number;
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
  /** @deprecated Historical store favors for pinned old rounds only. */
  readonly quests: { readonly [K in QuestKey]: QuestRule };
  /**
   * Authoritative event-driven Jobs catalog for current progression. Optional
   * only so historical pinned rulesets remain valid.
   */
  readonly questDefinitions?: QuestDefinitionCatalog;
  /** Named quest contacts and their relationship tracks. */
  readonly contacts?: ContactCatalog;
  /** 1.4.0-A. The underworld factions behind the contacts. Absent before 1.4. */
  readonly factions?: FactionCatalog;
  /** Server-run street crews: identity, scheduler pacing and NPC action limits. */
  readonly npcGangs?: NpcGangRuleOverrides;
  /** Short-lived action-triggered street events. */
  readonly randomEncounters?: RandomEncounterRules;
  /** 1.5.0-A. Catalog only; no class-specific balance or dispatch behavior yet. */
  readonly vehicleCatalog?: VehicleCatalog;
  /** 1.6.0-A. Presence gates the supply-network foundation to pinned 1.6 rounds. */
  readonly supplyNetwork?: SupplyNetworkRules;
  /** 1.6.5-A. The loan shark's debt rules. Absent: no loans, and debt never touches the round. */
  readonly loanShark?: LoanSharkRules;
  /** 1.7.0-A. Individual crew members behind the thug and worker counts. Absent: counts only. */
  readonly crewRoster?: CrewRosterRules;
  /** 1.4.0-B. Seasonal faction standing. Absent: factions are identity only. */
  readonly factionStanding?: FactionStandingRules;
  /**
   * 1.4.0-B2. How the daily, weekly and city contract boards rotate. Absent means
   * the original shared rotation: every round on the ruleset sees the same board.
   */
  readonly contractRotation?: ContractRotationRules;
  /** 1.4.0-C. Board contracts carry a sponsoring faction and pay it standing. */
  readonly contractSponsors?: ContractSponsorRules;
  /** 1.4.0-D. Information, warnings and a capped nudge per faction, by standing tier. */
  readonly factionPerks?: FactionPerkRules;
  /** 1.4.0-E. The Inner Circle rival lock. Absent: every faction's Inner Circle stays open. */
  readonly factionRivalry?: FactionRivalryRules;
  /** 1.4.0-F. Faction cosmetics, public alignment and the street feed. Absent: standing stays private. */
  readonly factionPublic?: FactionPublicRules;
  /** Permanent per-round capabilities earned through Jobs. */
  readonly permanentUnlocks?: PermanentUnlockCatalog;
  /** Consumable favors earned from contacts. Effects are activated by later roadmap phases. */
  readonly favors?: FavorCatalog;
  /** Permanent account cosmetics awarded by specific one-time Jobs. */
  readonly cosmetics?: QuestCosmeticCatalog;
  /** The free per-round reward track. Absent until a ruleset ships it. See docs/STREET-PASS.md. */
  readonly streetPass?: StreetPassRules;
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
  /** 0.8.0-C. Store-side dynamic economy knobs. */
  readonly storeEconomy?: StoreEconomyRules;
  /** 0.4.0-E. Absent where thugs burn no product in fights. */
  readonly combatSupply?: CombatSupplyRules;
  /** 0.5.0-A. Absent where cities are all alike and nobody travels. Keyed by City slug. */
  readonly cities?: { readonly [slug: string]: CityRules };
  /** 0.5.0-A. Absent where nobody travels. */
  readonly travel?: TravelRules;
  /** 0.6.0-A. Absent where the street belongs to nobody. */
  readonly turf?: TurfRules;
  /** 1.1.0-A. Absent where blocks hold no businesses. Needs `turf`. */
  readonly business?: BusinessRules;
  /** 1.2.0-A. Absent before casinos become player destinations. */
  readonly casino?: CasinoRules;
  /** 1.3.0-A. Absent before the law keeps a Case. Never changes how `heat` behaves. */
  readonly law?: LawRules;
  readonly evidence: EvidenceRules;
}

/**
 * 1.6.5-A. Game-cash loans from an NPC loan shark. Every value is integer cents or whole
 * hours on the server clock. The limits are hard: no sequence of loans, missed payments or
 * retries can take a player past them.
 *
 * - A loan's quoted obligation (principal plus its fixed contract fee) is reserved against
 *   `debtCeilingCents` in full when it is accepted, so parallel loans cannot overrun it.
 * - Late fees are the only debt that can grow after acceptance. Each missed installment is
 *   charged `lateFeeCents` once, capped by the loan's `lateFeeCapPerLoanCents`, the player's
 *   round-wide `feeCapCents`, and whatever room is left under the ceiling. Nothing compounds.
 * - The contract fee is earned evenly over the loan's term: an early payoff owes only the
 *   part earned so far, and the rest is waived.
 * - Repayments only ever come out of the player's cash; proceeds never pay another loan.
 * - The ceiling and fee caps are read from the round's ruleset whenever they apply, never
 *   fixed per player. Debt above a lowered ceiling stays owed, but cannot grow.
 */
export interface LoanSharkRules {
  readonly enabled: boolean;
  /** Most a player can owe in one round: every loan's unpaid obligation plus unpaid late fees. */
  readonly debtCeilingCents: number;
  /** Most late fees that can ever be assessed against one player in one round. */
  readonly feeCapCents: number;
  /** Most late fees one loan can ever be assessed. */
  readonly lateFeeCapPerLoanCents: number;
  /** The fixed fee for one missed installment, assessed once. */
  readonly lateFeeCents: number;
  /** Hours between installments; the first falls due one interval after acceptance. */
  readonly installmentIntervalHours: number;
  /** Most installments one contract can be split into. */
  readonly maxInstallments: number;
  /** Largest contract fee a quote may carry, as a whole percent of its principal. */
  readonly maxContractFeePercent: number;
  /** 1.6.5-B. The fixed offer tiers on the Loan Shark page. Absent: nothing is offered. */
  readonly offers?: readonly LoanOfferRules[];
  /** 1.6.5-C. Escalating terms. Absent: every offer costs its listed fee. */
  readonly pricing?: LoanPricingRules;
  /**
   * 1.6.5-E. Collection pressure and recovery. Absent: delinquency only marks the player,
   * and clearing it clears it.
   */
  readonly collections?: LoanCollectionsRules;
}

/**
 * 1.6.5-E. What happens to a player who falls behind, and how they climb back.
 *
 * - Any missed installment still owing makes the player delinquent: no new loans.
 * - Enough of them at once puts the player in collections. While in collections, a share of
 *   each eligible income line earned since is garnished toward what is overdue, never more
 *   than a capped amount a day, never more than is overdue, never more than the cash on hand.
 *   Nothing is added to the debt by collections; it only takes payments.
 * - Clearing everything overdue ends delinquency or collections and starts recovery: new
 *   loans unlock after enough installments are paid on time, or as soon as nothing is owed.
 */
export interface LoanCollectionsRules {
  /** Missed installments still owing, across every loan, that put a player in collections. */
  readonly missedInstallmentsThreshold: number;
  /** Whole percent of each eligible income line garnished while in collections. */
  readonly garnishPercent: number;
  /** Most garnished in any rolling 24 hours. */
  readonly garnishCapPerDayCents: number;
  /** Economy ledger sources that count as income the shark can garnish. Only positive lines. */
  readonly garnishSources: readonly string[];
  /** Installments paid on time, after clearing what was overdue, before new loans unlock. */
  readonly recoveryOnTimeInstallments: number;
}

/**
 * 1.6.5-C. How a new loan's fee rises with what the player already owes and how they have
 * paid. Surcharges are whole percentage points of the cash advanced, added to the offer's
 * listed fee, and the total never passes `maxContractFeePercent`. A loan's price is fixed
 * when it is taken: nothing here ever reprices a loan already on the books.
 */
export interface LoanPricingRules {
  /**
   * By debt utilization before the loan (owed / ceiling), lowest first. The highest tier
   * whose `fromPercent` the player has reached applies. The first starts at 0.
   */
  readonly utilizationTiers: readonly LoanUtilizationTierRules[];
  /** Points added for each installment missed this round, whether or not it was paid since. */
  readonly missedInstallmentSurchargePercent: number;
  /** Most the payment-history surcharge can add. */
  readonly maxHistorySurchargePercent: number;
}

export interface LoanUtilizationTierRules {
  readonly fromPercent: number;
  readonly surchargePercent: number;
  /** Player-facing name for the tier. */
  readonly label: string;
}

/** 1.6.5-B. One fixed loan shark offer: the same terms for everyone it is open to. */
export interface LoanOfferRules {
  readonly key: string;
  readonly name: string;
  readonly description: string;
  /** Cash handed over on acceptance. */
  readonly principalCents: number;
  /** The fixed contract fee, earned evenly over the term. */
  readonly contractFeeCents: number;
  readonly installmentCount: number;
  /** Only offered to a boss whose net worth is at least this. Absent: open to everyone. */
  readonly minNetWorthCents?: number;
}

/**
 * 1.7.0-A. Every thug and worker is an individual member with a stable id, a status and an
 * assignment history. The aggregate counts on the player stay authoritative: members follow
 * them, so no existing action, total, happiness or net worth reads the roster yet.
 */
export interface CrewRosterRules {
  readonly enabled: boolean;
  /** 1.7.0-C career milestones. Effects apply only to the job named by the specialty. */
  readonly experiencePerCompletedJob?: number;
  readonly specialtyUnlockExperience?: number;
  readonly specialtyTierTwoExperience?: number;
  readonly specialtyBonusPercent?: { readonly tierOne: number; readonly tierTwo: number; readonly cap: number };
  /** 1.7.0-D. Paid training only accelerates an already earned specialty tier. */
  readonly training?: { readonly turnCost: number; readonly cashCostCents: number; readonly experience: number; readonly earnedExperienceRatioPercent: number };
}

export interface SupplyNetworkRules {
  readonly enabled: boolean;
  /** 1.6.0-B. Per-player cap on paid orders waiting at suppliers. */
  readonly maxOpenOrders?: number;
  /** 1.6.0-B. Round-wide offers and source stock, pinned to this ruleset. */
  readonly suppliers?: readonly SupplySupplierRules[];
  /** 1.6.0-C. Collecting paid orders in vehicle loads. Absent: orders wait at their supplier. */
  readonly pickups?: SupplyPickupRules;
  /** 1.6.0-D. Warehouses and safehouses players buy in cities. Absent: only the home stash. */
  readonly properties?: SupplyPropertyRules;
  /** 1.6.0-E. Dealer crews that sell stored supply in a district. Absent: no crews. */
  readonly dealers?: DealerRules;
  /** 1.6.0-H. Suppliers abroad, reached by contracted route cards. Absent: domestic supply only. */
  readonly lanes?: SupplyLanesRules;
}

export type SupplyLaneRouteKey = 'FREIGHT' | 'OVERLAND' | 'AIR' | 'NORTHERN';

/**
 * 1.6.0-H. International supply is a contract, not a drive: the player pays for the goods and
 * a route card up front, and the load arrives at a warehouse in one of the card's entry cities
 * after the card's transit time. Each card trades capacity, cost, time and risk. Every card can
 * be searched on arrival, more often where the police lean harder; nothing makes a lane safe.
 */
export interface SupplyLanesRules {
  /** Lane shipments a player can have on the way at once. */
  readonly maxInTransit: number;
  readonly routes: Readonly<Record<SupplyLaneRouteKey, SupplyLaneRouteRules>>;
  readonly suppliers: readonly SupplyLaneSupplierRules[];
}

export interface SupplyLaneRouteRules {
  readonly name: string;
  /** What the card is, in game terms. Never how it is done. */
  readonly description: string;
  /** Where loads on this card can be received. */
  readonly entryCities: readonly string[];
  /** The most one shipment can carry. */
  readonly capacityUnits: number;
  /** What the card costs: a flat fee and a fee per unit. */
  readonly baseFeeCents: number;
  readonly feeCentsPerUnit: number;
  readonly transitHours: number;
  /** Chances on arrival at police pressure 1; the entry city's pressure scales both. */
  readonly risk: {
    readonly seizeChance: number;
    readonly partialChance: number;
    /** Share of the load a partial search takes, rolled in this range. */
    readonly partialShare: { readonly min: number; readonly max: number };
    /** Case evidence a seizure leaves in the entry city (a bust is 1, an arrest 3); a partial search leaves half, at least 1. */
    readonly casePoints: number;
  };
}

export interface SupplyLaneSupplierRules {
  readonly key: string;
  readonly name: string;
  /** Where it is, in words. Never a playable city. */
  readonly origin: string;
  readonly description: string;
  /** The route cards it ships on. */
  readonly routes: readonly SupplyLaneRouteKey[];
  readonly offers: Readonly<Record<string, SupplyOfferRules>>;
}

/**
 * 1.6.0-E. A dealer crew is a few of the player's thugs posted in one district of a city
 * where the player has a foothold, selling one product from that city's storage at a price
 * the player sets. The pace and cut here are what 1.6.0-F's sales run on.
 */
export interface DealerRules {
  /** Crews a player can run at once, working or paused. */
  readonly maxCrews: number;
  readonly maxDealersPerCrew: number;
  /** Units each dealer holds. A crew's capacity is this times its dealers. */
  readonly unitsPerDealer: number;
  /** Units a new dealer moves an hour at the street price, in a district of traffic 1, where demand is 1. */
  readonly unitsPerDealerHour: number;
  /** Wages and rent per dealer for each hour a crew is working. Taken from sales from 1.6.0-F. */
  readonly operatingCentsPerDealerHour: number;
  /** The street price is Pip's price for the product, times the city's lean, times this. */
  readonly streetPriceMultiplier: number;
  /** What a crew may ask, as shares of the street price. */
  readonly priceRange: { readonly min: number; readonly max: number };
  /** How hard price bends the pace: pace × (street ÷ price) ^ this. */
  readonly priceElasticity: number;
  /** Foot traffic in each district archetype. */
  readonly districtTraffic: Readonly<Record<DistrictKey, number>>;
  /** Turns to set a crew up in a district, or move it to another. */
  readonly setupTurns: number;
  /** Experience tiers, lowest first; the first must start at 0. */
  readonly tiers: readonly DealerTierRules[];
  /** 1.6.0-F. How much a city's police pressure slows a crew: pace × pressure ^ -this. Absent: none. */
  readonly pressureWeight?: number;
  /** 1.6.0-F. Crews sell. Absent: crews hold stock and only show their pace. */
  readonly sales?: DealerSalesRules;
}

/** 1.6.0-F. Sales settle lazily, in whole intervals of server time, like upkeep. */
export interface DealerSalesRules {
  readonly intervalMinutes: number;
  /** Intervals settled in one batch at most; a longer absence settles in several. */
  readonly maxBatchIntervals: number;
  /** Experience each unit sold earns, shared across the crew's dealers. */
  readonly experiencePerUnit: number;
}

export interface DealerTierRules {
  readonly key: string;
  readonly name: string;
  readonly minExperience: number;
  /** The dealer's share of what he sells, in percent. */
  readonly cutPercent: number;
  /** Extra pace over a new dealer, as a share. */
  readonly paceBonus: number;
}

/**
 * 1.6.0-D. Properties give the network places to be. A warehouse holds supply in a city; a
 * safehouse is a foothold there. Neither makes product or money: both cost a price up front
 * and upkeep every period after.
 */
export interface SupplyPropertyRules {
  /** Warehouses a player can hold at once, besides the home stash. */
  readonly maxWarehouses: number;
  /** Safehouses a player can hold at once. The home city never needs one. */
  readonly maxSafehouses: number;
  /** How often upkeep falls due. The purchase pays the first period. */
  readonly upkeepPeriodHours: number;
  /** What each city charges. A city missing here sells neither. */
  readonly cities: Readonly<Record<string, SupplyCityPropertyRules>>;
}

export interface SupplyCityPropertyRules {
  readonly warehouse: { readonly costCents: number; readonly upkeepCents: number; readonly capacityUnits: number };
  readonly safehouse: { readonly costCents: number; readonly upkeepCents: number };
}

/**
 * 1.6.0-C. A pickup is a run that drives to the supplier, loads part of a paid order, and
 * brings it home through the road's usual risks. Delivered units land in the home stash.
 */
export interface SupplyPickupRules {
  /** Units the home stash holds, counting loads still on the road. 1.6.0-D adds warehouses. */
  readonly homeStashUnits: number;
  /** Turns a pickup from a supplier in the player's own city costs: no road, straight to the stash. */
  readonly localPickupTurns: number;
  /** 1.6.0-F. Stock moves between warehouses by run, like a pickup. Absent: it stays where it landed. */
  readonly shipments?: boolean;
}

export interface SupplySupplierRules {
  readonly key: string;
  readonly name: string;
  readonly citySlug: string;
  readonly description: string;
  readonly offers: Readonly<Record<string, SupplyOfferRules>>;
}

export interface SupplyOfferRules {
  readonly unitCostCents: number;
  readonly minOrderQuantity: number;
  readonly maxOrderQuantity: number;
  readonly stockPerRound: number;
}
