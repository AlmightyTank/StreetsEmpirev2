import type { HideoutDto, HideoutRoomDto } from './api.js';

export type HideoutRequirementKeyDto =
  | 'CLEAN_SHIFT_STREAK'
  | 'ROCKS_SUPPLIED'
  | 'RAIDS_DONE'
  | 'DRIVE_BYS_DONE'
  | 'LOW_RIDERS'
  | 'WEAPONS_OWNED';

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
  /** Selection is intentionally not persisted until 0.7.0-G. */
  selectedKey: string | null;
  choices: HideoutSpecializationChoiceDto[];
}

export interface HideoutRoomV2Dto extends HideoutRoomDto {
  canUpgrade: boolean;
  /** Player-facing explanation when the next level cannot be bought. */
  lockReason: string | null;
  nextRequirements: HideoutRequirementDto[];
  specialization: HideoutSpecializationDto | null;
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

export interface HideoutV2Dto extends Omit<HideoutDto, 'rooms'> {
  /** 1 means the original cash-only contract; 2 enables 0.7 progression metadata. */
  rulesVersion: 1 | 2;
  rooms: HideoutRoomV2Dto[];
  /** Present only on rulesets with the 0.7-B asset protection model. */
  assetProtection?: HideoutAssetProtectionDto;
}
