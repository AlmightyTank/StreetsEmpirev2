import type { HideoutDto, HideoutRoomDto } from './api.js';

export type HideoutRequirementKeyDto =
  | 'CLEAN_SHIFT_STREAK'
  | 'ROCKS_SUPPLIED'
  | 'RAIDS_DONE'
  | 'DRIVE_BYS_DONE'
  | 'LOW_RIDERS'
  | 'WEAPONS_OWNED'
  | 'TURF_BLOCKS_HELD';

export interface HideoutRequirementDto {
  key: HideoutRequirementKeyDto;
  label: string;
  current: number;
  required: number;
  met: boolean;
}

export interface HideoutSpecializationChoiceDto {
  key: string;
  name: string;
  blurb: string;
}

export interface HideoutSpecializationDto {
  unlockLevel: number;
  /** Null until the player makes the permanent seasonal choice. */
  selectedKey: string | null;
  choices: HideoutSpecializationChoiceDto[];
}

export interface HideoutRoomV2Dto extends HideoutRoomDto {
  canUpgrade: boolean;
  /** Player-facing explanation when the next level cannot be bought. */
  lockReason: string | null;
  nextRequirements: HideoutRequirementDto[];
  nextCostTurns?: number | null;
  nextCostComponents?: Array<{ key: string; quantity: number; current: number; met: boolean }>;
  /** Real-time construction the next level takes once it is paid for; 0 is instant. */
  nextBuildMinutes?: number | null;
  /** This room's level under construction, if any. */
  build?: { level: number; startedAt: string; readyAt: string } | null;
  specialization: HideoutSpecializationDto | null;
}

/** The one room the crew is building right now. */
export interface HideoutConstructionDto {
  room: HideoutRoomV2Dto['key'];
  roomName: string;
  level: number;
  startedAt: string;
  readyAt: string;
}

export interface HideoutProtectedProductDto {
  key: string;
  name: string;
  total: number;
  protected: number;
  exposed: number;
}

export interface HideoutAssetProtectionDto {
  /** Total raid cash floor after the base combat floor and Safe Room bonus. */
  cashFloorCents: number;
  protectedCashCents: number;
  exposedCashCents: number;
  protectedProductCapacity: number;
  protectedProductUnits: number;
  exposedProductUnits: number;
  /** Highest-value units are sealed first; this is computed, never separate inventory. */
  policy: 'HIGHEST_VALUE_FIRST';
  products: HideoutProtectedProductDto[];
}

export interface HideoutSecurityEventDto {
  kind: 'RECON' | 'CONVOY_TAIL' | 'TURF_PUSH';
  at: string;
  title: string;
  detail: string;
  urgent: boolean;
  /** Revealed only by higher Lookouts warning tiers. */
  actor: { publicPimpId: number; displayName: string } | null;
}

export interface HideoutSecurityDto {
  lookoutsLevel: number;
  defenseBonusPercent: number;
  reconWarningTier: 'NONE' | 'PRESENCE' | 'SOURCE';
  historyHours: number;
  convoyHeadsUpMinutes: number;
  localTrafficVisible: boolean;
  /** Live rival runs in home-city reach. Count only; paid convoy recon keeps identities/value/route exclusive. */
  localTrafficCount: number | null;
  pendingConvoyThreats: number;
  pendingTurfThreats: number;
  suspicious: HideoutSecurityEventDto[];
  specializationHooks: {
    streetEyes: { warningHoursBonus: number; active: boolean };
    armedWatch: { defenseBonusPercent: number; active: boolean };
  };
}

export interface HideoutWorkshopRecipeDto {
  key: string;
  name: string;
  baseIngredientCentsPerUnit: number;
  effectiveIngredientCentsPerUnit: number;
}

export interface CraftingIngredientDto {
  key: string;
  name: string;
  quantity: number;
}

export interface CraftingRecipeDto {
  key: string;
  name: string;
  purpose: string;
  ingredients: CraftingIngredientDto[];
  output: { key: string; name: string; quantity: number; footprint: { width: number; height: number } };
  turns: number;
  requiresPower: boolean;
  unlockLevel: number;
  unlocked: boolean;
}

export interface CraftingWorkshopDto {
  level: number;
  skill: number;
  skillXp: number;
  availableComponents: Array<{ key: string; quantity: number }>;
  recipes: CraftingRecipeDto[];
}

export interface CraftingResultDto {
  recipe: CraftingRecipeDto;
  output: { key: string; name: string; quantity: number; footprint: { width: number; height: number } };
  availableComponents: Array<{ key: string; quantity: number }>;
  skill: number;
  skillXp: number;
}

export interface HideoutWorkshopDto {
  level: number;
  outputBonusPercent: number;
  ingredientEfficiencyPercent: number;
  recipes: HideoutWorkshopRecipeDto[];
  crafting?: CraftingWorkshopDto;
}

export interface HideoutGarageDto {
  level: number;
  runLimit: number;
  relocationFeeDiscountPercent: number;
}

export type HideoutWeaponPriorityDto = 'POWER' | 'CONSERVE';

export interface HideoutArmoryDto {
  priority: HideoutWeaponPriorityDto;
  choices: Array<{
    key: HideoutWeaponPriorityDto;
    name: string;
    blurb: string;
  }>;
  weapons: {
    pistols: number;
    shotguns: number;
    tek9s: number;
    ak47s: number;
    total: number;
  };
  fitThugs: number;
  armedCapacity: number;
  unarmedFitThugs: number;
}

export interface HideoutInfirmaryDto {
  fitThugs: number;
  woundedThugs: number;
  medicine: number;
  nextRecoveryAt: string | null;
  medicineEfficiencyPercent: number;
  medicineNeededForAll: number;
  maxTreatableThugs: number;
}

export interface HideoutGeneratorUpgradeDto {
  key: 'CAPACITY' | 'EFFICIENCY';
  level: number;
  nextLevel: number;
  costCents: number;
  components: Array<{ key: string; quantity: number }>;
  benefit: string;
}

export interface HideoutGeneratorDto {
  powered: boolean;
  fuel: number;
  capacity: number;
  fuelPerTurn: number;
  estimatedPoweredTurns: number;
  capacityLevel: number;
  efficiencyLevel: number;
  availableComponents: Array<{ key: string; quantity: number }>;
  upgrades: HideoutGeneratorUpgradeDto[];
}

export interface HideoutWeaponPriorityResult {
  priority: HideoutWeaponPriorityDto;
}

export type HideoutSpecializationRoomDto = 'SAFE_ROOM' | 'LOOKOUTS' | 'WORKSHOP' | 'BACK_OFFICE';

export interface HideoutSpecializationResult {
  room: HideoutSpecializationRoomDto;
  specialization: string;
  name: string;
}

export interface HideoutLedgerEntryDto {
  id: string;
  category: 'INCOME' | 'EXPENSE';
  source: string;
  label: string;
  amountCents: number;
  createdAt: string;
}

export interface HideoutLedgerWindowDto {
  days: 1 | 7 | 30;
  incomeCents: number;
  expenseCents: number;
  netCents: number;
}

export interface HideoutLedgerDto {
  backOfficeLevel: number;
  historyDays: number;
  rowLimit: number;
  windows: HideoutLedgerWindowDto[];
  entries: HideoutLedgerEntryDto[];
  specializationHooks: {
    bookkeeping: { historyDaysBonus: number; active: boolean };
    connections: { takeBonusPercent: number; active: boolean };
  };
}

export interface HideoutV2Dto extends Omit<HideoutDto, 'rooms'> {
  /** 1 means the original cash-only contract; 2 enables 0.7 progression metadata. */
  rulesVersion: 1 | 2;
  rooms: HideoutRoomV2Dto[];
  /** The build in progress, if any. Only one room is built at a time. */
  construction?: HideoutConstructionDto | null;
  /** Present only on rulesets with the 0.7-B asset protection model. */
  assetProtection?: HideoutAssetProtectionDto;
  /** Present only on rulesets with the 0.7-C Lookouts/security model. */
  security?: HideoutSecurityDto;
  /** Present only on rulesets with the 0.7-D Workshop model. */
  workshop?: HideoutWorkshopDto;
  /** Present only on rulesets with the 0.7-D Garage/logistics model. */
  garage?: HideoutGarageDto;
  /** Present only on rulesets with the 0.7-E Back Office ledger model. */
  ledger?: HideoutLedgerDto;
  /** Present only on rulesets with the 0.7-F Armory model. */
  armory?: HideoutArmoryDto;
  /** Present only on rulesets with the 0.7-F Infirmary model. */
  infirmary?: HideoutInfirmaryDto;
  /** 2.3.0. Turn-based generator fuel and upgrade preview. */
  generator?: HideoutGeneratorDto;
}
