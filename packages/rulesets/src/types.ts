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
  /** Human hits on the gang inside `overTargetedHours` that send it to ground, win or lose. */
  readonly overTargetedHits: number;
  readonly overTargetedHours: number;
  readonly dormantMinHours: number;
  readonly dormantMaxHours: number;
}

/**
 * Phase K. NPC migration is an ordinary relocation: fee, time on the road, cooldown and
 * the round-end cutoff all apply, and a gang cannot leave while someone it hit can still
 * hit back. A gang that decides to move goes quiet first, so the move is readable.
 */
export interface NpcGangMigrationRules {
  readonly enabled: boolean;
  /** Only these tiers ever move house. */
  readonly tiers: readonly NpcGangTier[];
  /** How often a settled gang reconsiders its city. */
  readonly evaluateEveryHours: number;
  /** Hours a gang stays after arriving (or being seeded) before it reconsiders. */
  readonly minStayHours: number;
  /** A human counts toward a city's population if active inside this many hours. */
  readonly activeHumanHours: number;
  /** A city with fewer active humans than this is too quiet to stay in or move to. */
  readonly quietBelowHumans: number;
  /** One NPC gang per this many active humans, at least one and at most `maxPerCity`. */
  readonly humansPerGang: number;
  /** Lost fights inside the turf loss window that make a city too hostile. */
  readonly hostileLosses: number;
  /** A richer city must have at least this many more active humans to be worth the move. */
  readonly betterByHumans: number;
  /** A gang that has not managed to leave within this many hours drops the plan. */
  readonly packingHours: number;
}

/**
 * Phase J. NPC turf is ordinary turf: presence from Scout turns, a claim fight
 * against the locals, posted corner crews with upkeep. NPCs only take blocks
 * the locals hold; they never push a block a human crew holds.
 */
export interface NpcGangTurfRules {
  readonly enabled: boolean;
  /** Gangs below this ambition never go looking for a block; they still defend one they hold. */
  readonly minAmbition: number;
  readonly maxBlocksPerGang: number;
  /** All NPC gangs together, so every city keeps blocks for human crews. */
  readonly maxNpcBlocksPerCity: number;
  /** Reinforce while the corner is below this multiple of its minimum. */
  readonly reinforceBelowMinimum: number;
  /** Hours of corner beer the gang tries to keep at home. */
  readonly supplyHours: number;
  /** Lost fights inside `lossWindowHours` that make a gang give its block up. */
  readonly abandonAfterLosses: number;
  readonly lossWindowHours: number;
  /** Raid weight added while human crews are working the gang's block. */
  readonly pressureIntentBonus: number;
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
  /**
   * 1.5.0-E2. A vehicle class on the shelf. When the round has a VEHICLE_PURCHASE_ACCESS unlock
   * for the class, buying it waits for that unlock; selling and owning never do.
   */
  readonly vehicleClass?: 'SEDAN' | 'VAN';
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
  /** Trips A. The boss visits another city and comes home. Absent: the boss never leaves. */
  readonly trips?: TripRules;
}

/**
 * Trips A. The boss leaves home for a stay in another city and comes back. Home keeps
 * working while they are gone, run by a lieutenant who skims the take. Stage A flies the
 * boss alone: a ticket from home cash, a hotel stay paid up front, and a bankroll that
 * is all the boss has in town.
 */
export interface TripRules {
  /** Real minutes in the air, airport included, between any two cities. Each way. */
  readonly flightMinutes: number;
  /** A round-trip ticket for the boss, paid from home cash. */
  readonly ticketCents: number;
  /** The most bankroll one boss can carry onto a plane. */
  readonly carryOnCapCents: number;
  /** Stay lengths offered at launch, in real minutes. */
  readonly stayMinutes: readonly number[];
  /** The longest a stay can run, extensions included. */
  readonly maxStayMinutes: number;
  /** Extensions are sold in blocks of this many minutes. */
  readonly extendMinutes: number;
  /** The hotel's rate per real hour, before the city's lean. */
  readonly hotelCentsPerHour: number;
  /** Each city's lean on the hotel rate. Missing is 1. */
  readonly hotelPrice?: { readonly [citySlug: string]: number };
  /** Turns it takes to get out the door. */
  readonly launchTurns: number;
  /** The lieutenant's share of Scout and Produce takes while the boss is away, 0 to 1. */
  readonly lieutenantCut: number;
  /** No new trips in the round's last hours. */
  readonly cutoffHours: number;
  /** Trips B. The boss can ride along with a run. Absent: runs are crew only. */
  readonly rideAlong?: RideAlongRules;
  /** Trips C. A boss away from home can be found and hit. Absent: nobody hunts a boss. */
  readonly hunted?: HuntedRules;
  /** Trips D. The boss can fly with bodyguards and rent guns in town. Absent: the boss flies alone. */
  readonly bodyguards?: BodyguardRules;
  /** Trips D2. Airport security reads Heat. Absent: nobody looks twice. */
  readonly airport?: AirportRules;
  /** Trips D2. The boss can visit an outpost in person. Absent: outposts never see the boss. */
  readonly outpostVisits?: OutpostVisitRules;
  /** Trips D2. Two bosses in one city can sit down and agree a truce. Absent: no sit-downs. */
  readonly sitDowns?: SitDownRules;
  /** Trips D2. Allies who live where a boss is hit can send backup. Absent: a boss stands alone. */
  readonly allyBackup?: boolean;
  /**
   * Trips E. The girls notice the boss is gone: whore happiness sits lower the longer the
   * boss is away (on a flight trip or riding along), up to a cap, and recovers the moment
   * the boss is home. Absent: nobody notices.
   */
  readonly awayHappiness?: { readonly pointsPerHour: number; readonly maxPoints: number };
}

/**
 * Trips D2. A hot boss gets pulled aside at the airport on the way out: part of the carried
 * bankroll is taken and the flight lands late. Past `noFlyHeat`, nobody lets them board.
 */
export interface AirportRules {
  /** Heat from which security starts looking twice. */
  readonly checkFromHeat: number;
  /** Chance of being pulled aside for each point of Heat past `checkFromHeat`. */
  readonly chancePerHeat: number;
  readonly maxChance: number;
  /** Share of the carried bankroll taken when pulled aside. */
  readonly seizePercent: number;
  /** Real minutes lost in the back room: the whole trip runs this much later. */
  readonly delayMinutes: number;
  /** At this Heat or above, no flight. */
  readonly noFlyHeat: number;
  /** Heat each bodyguard adds for the check only: a crew draws eyes. Missing is 0. */
  readonly bodyguardHeat?: number;
  /** Security checks the flight home too, as the boss leaves town. Missing is off. */
  readonly checkHome?: boolean;
}

/**
 * Trips D2. A boss in town where they hold an outpost can walk the corner: for a while the
 * crew there does not walk out when supplies run short, and a boss on a flight trip can
 * carry the box's cash in their bankroll, up to the carry-on cap.
 */
export interface OutpostVisitRules {
  /** Hours after a visit in which the corner crew stays put whatever the box holds. */
  readonly moraleHours: number;
}

/**
 * Trips D2. A boss in town proposes a sit-down to a boss who is also in that city (living
 * there or visiting). If the other agrees while both are still there, neither crew can hit
 * the other for `truceHours`: no raids, drive-bys, special raids, convoy tails or boss hits.
 */
export interface SitDownRules {
  /** Minutes an invitation stays open. */
  readonly inviteMinutes: number;
  readonly truceHours: number;
}

/**
 * Trips D. Bodyguards fly with the boss: fit thugs out of home, each on their own ticket
 * and lodged by the hour, and unarmed, because nothing goes through the airport. In town,
 * a boss with Tommy's out-of-town connect can rent guns for them, one each, paid out of the
 * bankroll and handed back at check-out. Bodyguards fight a hit on the boss.
 */
export interface BodyguardRules {
  /** The most bodyguards on one trip. */
  readonly max: number;
  /** A round-trip ticket for each bodyguard, from home cash. */
  readonly ticketCents: number;
  /** Lodging for each bodyguard, per real hour, paid with the boss's hotel. */
  readonly lodgingCentsPerThugHour: number;
  /** Rent for one gun for the rest of a stay, by weapon. Never below zero; never the price of the gun. */
  readonly gunRentCents: { readonly [K in WeaponKey]: number };
  /** The permanent unlock that opens Tommy's out-of-town connect. */
  readonly gunConnectUnlockKey: string;
}

/**
 * Trips C. The boss away from home is a target. Locals find a visiting boss with an area
 * recon (a solo boss keeps a low profile, so only sometimes), tail them on the convoy
 * clock, and the hit lands if the boss is still in town. A solo boss has nobody to fight
 * back. A beaten boss loses part of the bankroll, flies home and is laid up: no travel
 * until they heal, while the lieutenant keeps running home. The convoy rules set the
 * warning window, the turn cost and the re-hit cooldown.
 */
export interface HuntedRules {
  /** Chance an area recon spots a solo boss in town or on the way in, rolled per recon. */
  readonly soloSightChance: number;
  /** Share of the bankroll a successful hit takes, rolled in this range. */
  readonly bankrollPercent: { readonly min: number; readonly max: number };
  /** Real minutes a beaten boss is laid up: no trips, no riding along. */
  readonly layUpMinutes: number;
  /** Home defends raids at this share of its strength while the boss is away or laid up. */
  readonly awayDefenseMultiplier: number;
}

/**
 * Trips B. The boss rides with a run. Every town the run stops in holds it for as long as
 * the boss likes, up to `maxStayMinutes`, and the hotel bills by the started hour out of
 * the run's own cash. When the cash cannot cover the next hour, the boss checks out and
 * the run heads home.
 */
export interface RideAlongRules {
  /** The longest the run stays in one town with the boss aboard. */
  readonly maxStayMinutes: number;
  /** Lodging for each escort, per real hour, on top of the boss's hotel. */
  readonly crewCentsPerThugHour: number;
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
  /**
   * 1.1.0-B. Corner crews are still the crew: when it is unhappy they walk off like anyone
   * else (each settled hour counts as this many turns of the departure chance), and a Lure
   * Crew raid can take them. Absent: corners only walk when supply runs short, as in 0.6.0.
   */
  readonly desertTurnsPerHour?: number;
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

/** 1.1.0-A. The ten businesses a block's lots can hold. */
export type BusinessKey =
  | 'NIGHTCLUB'
  | 'BAR'
  | 'STRIP_CLUB'
  | 'CHOP_SHOP'
  | 'PAWN_SHOP'
  | 'AUTO_GARAGE'
  | 'CONVENIENCE_STORE'
  | 'WAREHOUSE'
  | 'CASINO_FRONT'
  | 'LAUNDROMAT';

/**
 * 1.1.0-A. Businesses, Fronts & Rackets. Every turf block has three lots, fixed by its
 * district, and each lot holds one business. Lots start empty: the crew holding the block
 * builds and upgrades them, they change hands with the block in a block war, and a war
 * leaves them running at a fatigued rate until the neighborhood recovers.
 *
 * Data only in A: nothing reads these numbers until 1.1.0-B builds the first business.
 * See docs/ROADMAP-1.1.0.md.
 */
export interface BusinessCrackdownRules {
  /** Extra Heat per staffed, active racket in the swept city when the federal turf crackdown lands. */
  readonly activeRacketHeatPerBusiness: number;
}

export interface BusinessRules {
  /** 1.1.0-B. A owns the data and the map; B turns building, staffing and collecting on. */
  readonly building?: boolean;
  /** 1.1.0-E. Away blocks can run businesses through their 0.6.0-D outpost box. */
  readonly outposts?: boolean;
  readonly catalog: { readonly [K in BusinessKey]: BusinessTypeRules };
  /** The three lots on every block of a district, in lot order. Lot 1 opens first. */
  readonly lots: { readonly [K in DistrictKey]: readonly [BusinessKey, BusinessKey, BusinessKey] };
  /** One business per city earns more there. Keyed by City slug. */
  readonly signatures: { readonly [slug: string]: BusinessSignatureRules };
  /**
   * Foot traffic: the same business earns more on a richer block. A Bar on the Casino strip
   * out-earns one in the slums, which is also what pays for staff on the blocks where a
   * thug covers the fewest girls.
   */
  readonly districtIncome: { readonly [K in DistrictKey]: number };
  readonly levels: BusinessLevelRules;
  readonly supply: BusinessSupplyRules;
  readonly register: BusinessRegisterRules;
  /** Turns to open a business (send its staff in) or close it (bring them home). */
  readonly staffTurnCost: number;
  /**
   * Staff are still the crew's, so an unhappy crew's staff walk off like anyone else. Each
   * settled hour at a business counts as this many turns of the ruleset's departure chance.
   */
  readonly staffDepartureTurnsPerHour: number;
  /** Most an away (outpost) business makes, as a share of the same business at home. */
  readonly awayOutputShare: number;
  readonly tiers: BusinessTierRules;
  readonly fatigue: BusinessFatigueRules;
  readonly wars: BlockWarRules;
  readonly allies: BlockWarAllyRules;
  readonly locals: BusinessLocalsRules;
  readonly torch: BusinessTorchRules;
  /** Levels every business on a block loses when a war ends in a Sack. */
  readonly sackLevelsLost: number;
  /** 1.1.0-C. One racket per business, on top of its front income. Absent before C. */
  readonly rackets?: RacketRules;
  /** 1.1.0-F. Extra release-crackdown pressure on businesses that are actively running rackets. */
  readonly crackdown?: BusinessCrackdownRules;
}

export type RacketKey =
  | 'ECSTASY_DEMAND'
  | 'INFORMATION_NETWORK'
  | 'BACK_ROOM_CARDS'
  | 'LOOSE_LIPS'
  | 'VIP_ROOM'
  | 'PILLOW_TALK'
  | 'STOLEN_LOW_RIDERS'
  | 'VEHICLE_RECOVERY'
  | 'FENCING'
  | 'LOAN_SHARKING'
  | 'RUN_MODS'
  | 'GETAWAY_CARS'
  | 'BEER_SUPPLY'
  | 'COUNTER_SALES'
  | 'PRODUCT_STORAGE'
  | 'SHIPMENT_CAPACITY'
  | 'HOUSE_ALWAYS_WINS'
  | 'CASINO_LAUNDERING'
  | 'LAUNDERING'
  | 'WASH_AND_FOLD';

/**
 * What a racket does, at full strength (top level, fully staffed). A racket's strength is
 * `levelStrength` for its business's level times its staffing share; the effect scales with it.
 */
export type RacketEffect =
  /** Extra cash into the register: a share of the business's front income. */
  | { readonly kind: 'CASH'; readonly incomeShare: number }
  /** Better prices at one store for some items, on top of standing. */
  | { readonly kind: 'STORE_PRICE'; readonly store: string; readonly items: readonly string[]; readonly buyDiscountPercent?: number; readonly sellBonusPercent?: number }
  /** Earlier sightings of pushes on the crew's blocks and tails on its runs, on top of Lookouts. */
  | { readonly kind: 'HEADS_UP'; readonly minutes: number }
  /** Turns off a recon on a crew in the same city. Paid recon always costs at least one turn. */
  | { readonly kind: 'RECON_DISCOUNT'; readonly turns: number }
  /** Home raid defense strength, on top of Lookouts. */
  | { readonly kind: 'RAID_DEFENSE'; readonly percent: number }
  /** Share of the Low-Riders a convoy hit would take off a run that are recovered on the spot. */
  | { readonly kind: 'VEHICLE_RECOVERY'; readonly share: number }
  /** Share off the chance of a police stop on a run out of the home city. */
  | { readonly kind: 'RUN_STOPS'; readonly share: number }
  /** Share of a beaten push squad's wounds it avoids by getting away. */
  | { readonly kind: 'GETAWAY'; readonly share: number }
  /** Product sold over the counter each hour, at Pip's base price, into the register. */
  | { readonly kind: 'COUNTER_SALES'; readonly unitsPerHour: number }
  /** Extra product sealed away from raids, on top of the Safe Room. */
  | { readonly kind: 'PRODUCT_STORAGE'; readonly units: number }
  /** Extra cargo per Low-Rider on runs out of the home city, as a share. */
  | { readonly kind: 'CARGO'; readonly share: number }
  /** Heat washed off each hour, paid from the register, under the laundering caps. */
  | { readonly kind: 'LAUNDER'; readonly heatPerHour: number }
  /** Share off the Heat the crew's other rackets draw. */
  | { readonly kind: 'HEAT_SHIELD'; readonly share: number };

export interface RacketTypeRules {
  readonly name: string;
  readonly business: BusinessKey;
  readonly description: string;
  readonly effect: RacketEffect;
  /** Heat the racket draws each hour at full strength. */
  readonly heatPerHour: number;
}

export interface RacketRules {
  readonly catalog: { readonly [K in RacketKey]: RacketTypeRules };
  /** Strength by business level (index 0 = level 1), before staffing. */
  readonly levelStrength: readonly number[];
  /** Turns to set or switch a racket. */
  readonly switchTurnCost: number;
  /** Hours after a racket is set before it can be switched again (or shut). */
  readonly switchCooldownHours: number;
  readonly laundering: {
    /** Heat a crew can wash off in a day (UTC), across all its laundering. */
    readonly dailyHeatCap: number;
    /** Heat a crew can wash off in a round. */
    readonly roundHeatCap: number;
    /** Price per point of Heat washed, as a share of the crew's bribe price. */
    readonly bribePriceShare: number;
  };
}

export interface BusinessTypeRules {
  readonly name: string;
  /** Who works it. Girls staff the Strip Club only; thugs staff everything else. */
  readonly staff: 'THUGS' | 'WHORES';
  /** Staff a level-1 business needs. Scaled by `levels.staffMultiplier`. */
  readonly baseStaff: number;
  /** Front income an hour at level 1, on a 1.0 foot-traffic block, home, no fatigue. */
  readonly incomeCentsPerHour: number;
  /** Cash to open it at level 1. Each upgrade costs a multiple of this. */
  readonly buildCostCents: number;
}

export interface BusinessSignatureRules {
  readonly business: BusinessKey;
  /** Multiplies that business's income in this city. */
  readonly multiplier: number;
}

/** One entry per level, level 1 first. All arrays are `maxLevel` long. */
export interface BusinessLevelRules {
  readonly maxLevel: number;
  /** Income at each level as a multiple of level 1. */
  readonly incomeMultiplier: readonly number[];
  /** Staff at each level as a multiple of `baseStaff`, rounded up. */
  readonly staffMultiplier: readonly number[];
  /** Cost to reach each level as a multiple of `buildCostCents`: index 0 is the build. */
  readonly costMultiplier: readonly number[];
  /** Turns to build or upgrade. */
  readonly buildTurnCost: number;
  /** Upgrades cost this much more while the block's fatigue is above `fatigue.upgradeMarkupAbove`. */
  readonly fatiguedUpgradeMarkup: number;
}

/** A business burns beer and product under the BUSINESS supply job, like a corner crew. */
export interface BusinessSupplyRules {
  readonly beerPerStaffPerHour: number;
  readonly productPerStaffPerHour: number;
}

/** Income waits in the register; past the cap it is lost, so someone has to come by. */
export interface BusinessRegisterRules {
  /** Hours of full income the register holds. */
  readonly capHours: number;
  readonly collectTurnCost: number;
}

/**
 * A block's tier opens its lots. It rises with uninterrupted holding and business levels,
 * the way a settlement grows in rank.
 */
export interface BusinessTierRules {
  /** Lots open at Foothold, Established and Stronghold. */
  readonly lotsOpen: readonly [number, number, number];
  /** Hours held (siege pauses the clock) to reach Established and Stronghold. */
  readonly establishedHours: number;
  readonly strongholdHours: number;
  /** Level the lot-1 business needs for Established. */
  readonly establishedLotOneLevel: number;
  /** Total levels on lots 1 and 2 for Stronghold. */
  readonly strongholdLevels: number;
  /** Tiers a block drops when a war ends in a Take. */
  readonly takeTierDrop: number;
}

/** War fatigue (devastation): a per-block meter. Output is (100 - fatigue)%. */
export interface BusinessFatigueRules {
  /** Fatigue never rises above this, so a business always makes something. */
  readonly max: number;
  readonly perFight: number;
  readonly perSiegeHour: number;
  readonly onTake: number;
  readonly onConcede: number;
  readonly onSack: number;
  readonly onLocalsClaim: number;
  readonly recoveryPerHour: number;
  /** Slower recovery on a block that changed hands this many times inside the window. */
  readonly scarredRecoveryPerHour: number;
  readonly scarredHandsChanged: number;
  readonly scarredWindowHours: number;
  /** Upgrades cost `levels.fatiguedUpgradeMarkup` more above this fatigue. */
  readonly upgradeMarkupAbove: number;
}

/**
 * Taking a block from a player is a block war: declare, an opening fight, a siege that
 * builds Control to 100, and a truce. Taking a block from the locals stays a single fight.
 */
export interface BlockWarRules {
  readonly declareTurnCost: number;
  /** Wars one crew can have declared at a time. */
  readonly maxDeclaredPerCrew: number;
  /** Real minutes between the declaration and the opening fight. */
  readonly warningMinutes: number;
  /** Hours for a siege to take Control from 0 to 100 with no allied help. */
  readonly siegeHours: number;
  /** Control rate x (1 + this x allied share): an ally at the full cap speeds the siege. */
  readonly allySiegeSpeedup: number;
  /** Control lost when the holder breaks the siege. */
  readonly breakSiegeControlLoss: number;
  readonly resiegeCooldownHours: number;
  readonly maxWarHours: number;
  readonly truceHours: number;
  readonly sackTruceHours: number;
  /** Hours the losing attacker cannot declare on that block again. */
  readonly loserCooldownHours: number;
  /** Minutes between starting a break attempt and the fight landing, so an ally can answer. */
  readonly breakMusterMinutes: number;
  /**
   * 1.1.0-D. Block wars are played: a player-held block is taken by a war, not the 0.6.0-C
   * push, and the settings below apply. Absent before D, where the numbers are proposals.
   */
  readonly enabled?: boolean;
  /** Share of the block's registers a Sack takes, and the most it can take. */
  readonly sackLootShare?: number;
  readonly sackLootCapCents?: number;
  /** Heat a Sack puts on the attacker, and a torch on the holder. */
  readonly sackHeat?: number;
  readonly torchHeat?: number;
}

/**
 * One ally per side, and only a member who is online and answers the call. No dice: the
 * uncertainty is whether a real ally is around.
 */
export interface BlockWarAllyRules {
  readonly maxPerSide: number;
  /** An ally sends at most this multiple of the declarer's committed thugs, on either side. */
  readonly maxShareOfDeclarer: number;
  /** Minutes an attacker's call to join a siege stays open. */
  readonly siegeCallMinutes: number;
  /** Active wars one crew can be the ally in. Declaring is counted separately. */
  readonly maxWarsAsAlly: number;
  /** Most of the winnings the caller can promise the ally, and the step it moves in. */
  readonly maxCutShare: number;
  readonly cutStep: number;
}

/** A block the locals take over: its businesses go dormant and decay. */
export interface BusinessLocalsRules {
  /** Hours after the locals take over before levels start to fall. */
  readonly graceHours: number;
  /** Every business loses a level this often after the grace period. */
  readonly levelLossEveryHours: number;
  /** Tiers dropped when the locals take over, and hours until the block is a Foothold. */
  readonly takeoverTierDrop: number;
  readonly footholdAfterHours: number;
  /** Extra local thugs per business level on the block, capped at a share of the district's base. */
  readonly localsPerLevel: number;
  readonly maxLocalsBonusShare: number;
}

/** The holder burns a business down rather than hand it over. */
export interface BusinessTorchRules {
  readonly levelsLost: number;
  /** Share of the lost levels' build cost paid back. */
  readonly salvageShare: number;
  readonly turnCost: number;
  /** Minutes the torch takes; it must finish before Control reaches 100. */
  readonly minutes: number;
  /** No torching in the round's final hours. */
  readonly closedFinalHours: number;
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

export interface StoreRelationshipPerk {
  readonly at: number;
  readonly label: string;
  readonly description: string;
  readonly buyDiscountPercent?: number;
  readonly sellBonusPercent?: number;
}

export interface StoreShipmentRules {
  readonly enabled: boolean;
  readonly seed: string;
  readonly delayChancePercent: number;
  readonly delayMinutes: number;
  readonly partialChancePercent: number;
  readonly partialMultiplier: number;
  readonly largeChancePercent: number;
  readonly largeMultiplier: number;
}

export interface StoreSpecialOrderRules {
  readonly enabled: boolean;
  readonly markupPercent: number;
  readonly minWaitMinutes: number;
  readonly waitMultiplier: number;
  readonly standingMarkupDiscountPercentPerTier: number;
  readonly standingWaitDiscountPercentPerTier: number;
}

export interface StoreIntegrationRules {
  readonly enabled: boolean;
  readonly turfSpecialOrderDiscountPercentPerBlock: number;
  readonly maxTurfSpecialOrderDiscountPercent: number;
  readonly travelOpportunityMinProfitPercent: number;
}

export interface StoreEconomyRules {
  /**
   * 0.8.0-C. Home Pip product trades nudge the same local pressure used by
   * the high market: buying lifts the next quote, selling cools it, and the
   * pressure slowly normalizes through the high-market recovery clock.
   */
  readonly pipProductPressure?: {
    readonly enabled: boolean;
    /** Maximum share up or down that Pip's product quotes can move from their city baseline. */
    readonly maxPricePressure: number;
  };
  /** 0.8.0-D. Best reached trader relationship perk, keyed by store. */
  readonly traderPerks?: Partial<Record<StoreKey, readonly StoreRelationshipPerk[]>>;
  /** 0.8.0-E. Lazy-settled incoming shipments for restocked store shelves. */
  readonly shipments?: StoreShipmentRules;
  /** 0.8.0-F. Paid sourcing for sold-out eligible restocked shelves. */
  readonly specialOrders?: StoreSpecialOrderRules;
  /** 0.8.0-G. Cross-system store hooks and modest bonuses. */
  readonly integrations?: StoreIntegrationRules;
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
  readonly npcGangs?: NpcGangRules;
  /** 1.5.0-A. Catalog only; no class-specific balance or dispatch behavior yet. */
  readonly vehicleCatalog?: VehicleCatalog;
  /** 1.6.0-A. Presence gates the supply-network foundation to pinned 1.6 rounds. */
  readonly supplyNetwork?: SupplyNetworkRules;
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
