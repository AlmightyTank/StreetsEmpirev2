export interface CombatIntelReportDto {
  targetPublicPimpId: number;
  displayName: string;
  createdAt: string;
  expiresAt: string;
  fitThugs: number;
  woundedThugs: number;
  strength: number;
  weapons: Record<string, number>;
  cashBand: { label: string; minCents: number; maxCents: number | null };
  estimatedMaxLootCents: number;
  crack: number | null;
  estimatedMaxCrackLoot: number | null;
}

export interface CombatReconResultDto {
  intel: CombatIntelReportDto;
  turnsSpent: number;
  turnsAfter: number;
}

export type SpecialRaidKindDto = 'DRUG_HOES' | 'STEAL_RIDE' | 'LURE_CREW';
export type BattleKindDto = 'RAID' | 'DRIVE_BY' | SpecialRaidKindDto;

export interface BattleReportDto {
  id: string;
  /** Absent on reports written before drive-bys existed, which were all raids. */
  kind?: BattleKindDto;
  createdAt: string;
  modelVersion: string;
  role: 'ATTACKER' | 'DEFENDER';
  won: boolean;
  opponent: { publicPimpId: number; displayName: string };
  yourSquad: number;
  opponentSquad: number;
  yourEquipment: Record<string, number>;
  yourStrength: number;
  opponentStrength: number;
  yourWounds: number;
  opponentWounds: number;
  woundedThugsAfter: number;
  nextRecoveryAt: string | null;
  cashChangeCents: number;
  cashAfterCents: number;
  crackChange?: number;
  crackAfter?: number;
  lootPercent?: number;
  baseLootPercent?: number;
  repeatTargetHits?: number;
  repeatLootMultiplierPercent?: number;
  turnsSpent: number;
  turnsAfter: number;
  nationalRankBefore: number;
  nationalRankAfter: number;
  protectedUntil: string | null;
  cooldownUntil: string | null;
  retaliation?: boolean;
  trophyCallouts?: Array<{ key: string; title: string; description: string }>;
  /** Special raid forms only. */
  raidForm?: {
    title: string;
    whoresDrugged?: number;
    crackSpent?: number;
    defenderCrackBurned?: number;
    defenderCondomsBurned?: number;
    lowRidersStolen?: number;
    lowRidersAfter?: number;
    whoresLured?: number;
    thugsLured?: number;
    beerSpent?: number;
    whoresAfter?: number;
    thugsAfter?: number;
  };
  /** Drive-by only. */
  driveBy?: {
    /** Whores killed on the target's side. Theirs when attacking, yours when defending. */
    whoresKilled: number;
    /** The defender's whores after the hit; only on the defender's own report. */
    whoresAfter?: number;
    /** Attacker only: cars sent, cars that did not come home, cars left. */
    carsSent?: number;
    lowRidersLost?: number;
    lowRidersAfter?: number;
  };
}

export interface CombatRecoveryDto {
  fitThugs: number;
  woundedThugs: number;
  nextRecoveryAt: string | null;
  medicinePerThug: number;
  maxTreatableThugs: number;
}

export interface CombatTreatmentDto {
  treatedThugs: number;
  medicineUsed: number;
  woundedThugs: number;
  nextRecoveryAt: string | null;
}

export interface CombatTargetDto {
  publicPimpId: number;
  displayName: string;
  netWorthCents: number;
  strength: 'Weaker' | 'Comparable' | 'Stronger';
  revengeAvailable?: boolean;
  intel?: CombatIntelReportDto | null;
  blockedReason: string | null;
  protectedUntil: string | null;
  /** Present only where drive-bys exist. Null means you can hit them. */
  driveByBlockedReason?: string | null;
  /** Per-form blocks for optional raid forms. */
  specialRaidBlockedReasons?: Partial<Record<SpecialRaidKindDto, string | null>>;
}


export interface CombatSpecialRaidDto {
  kind: SpecialRaidKindDto;
  title: string;
  buttonLabel: string;
  blockedReason: string | null;
  cooldownUntil: string | null;
  turnCost: number;
}

/** Drive-by state for the attacker, on rounds that have them. */
export interface CombatDriveByDto {
  blockedReason: string | null;
  cooldownUntil: string | null;
  lowRiders: number;
  maxShooters: number;
  rules: {
    turnCost: number;
    thugsPerLowRider: number;
    cooldownMinutes: number;
    protectionHours: number;
    defenderFieldedPercent: number;
    minThugWoundPercent: number;
    maxThugWoundPercent: number;
    minWhoreKillPercent: number;
    maxWhoreKillPercent: number;
  };
}

export interface CombatPageDto {
  enabled: boolean;
  roundId: string;
  serverTime: string;
  blockedReason: string | null;
  protectedUntil: string | null;
  cooldownUntil: string | null;
  recovery: CombatRecoveryDto | null;
  rules: null | {
    squadCap: number; turnCost: number; newcomerHours: number;
    protectionHours: number; cooldownMinutes: number;
    protectedCashCents: number; lootPercent: number; perThugLootCents: number;
    drugLootPercent?: number; perThugCrackLoot?: number;
    minLootPercent?: number; maxLootPercent?: number; weightedLootExponent?: number;
    repeatLootPenaltyPercent?: number; repeatLootFloorPercent?: number;
    reconTurnCost?: number; intelExpiresMinutes?: number; retaliationHours?: number;
  };
  targets: CombatTargetDto[];
  nextTarget: number | null;
  /** Optional old-school raid forms in this round. */
  specialRaids?: CombatSpecialRaidDto[];
  /** Absent where drive-bys have not shipped. */
  driveBy?: CombatDriveByDto;
}
