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

export interface HideoutV2Dto extends Omit<HideoutDto, 'rooms'> {
  /** 1 means the original cash-only contract; 2 enables 0.7 progression metadata. */
  rulesVersion: 1 | 2;
  rooms: HideoutRoomV2Dto[];
}
