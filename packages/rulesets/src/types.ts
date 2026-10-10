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
  re…20356 tokens truncated…les {
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
