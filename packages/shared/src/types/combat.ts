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

export interface BattleReportDto {
  id: string;
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
  turnsSpent: number;
  turnsAfter: number;
  nationalRankBefore: number;
  nationalRankAfter: number;
  protectedUntil: string | null;
  cooldownUntil: string | null;
  retaliation?: boolean;
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
    reconTurnCost?: number; intelExpiresMinutes?: number; retaliationHours?: number;
  };
  targets: CombatTargetDto[];
  nextTarget: number | null;
}
