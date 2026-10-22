import type {
  GameActionResult,
  HideoutDto,
  HideoutRoomV2Dto,
  HideoutSpecializationInput,
  HideoutSpecializationResult,
  HideoutUpgradeInput,
  HideoutUpgradeResult,
  HideoutWeaponPriorityInput,
  HideoutWeaponPriorityResult,
  HideoutV2Dto,
  HideoutCosmeticsDto,
  UpdateHideoutCosmeticsInput,
  StashDto,
  UpdateStashLayoutInput,
  ScavengePageDto,
  OpenScavengeCacheResult,
  HideoutGeneratorDto,
  CraftingWorkshopDto,
  CraftingResultDto,
} from '@streets/shared';
import { api } from './client.js';

type HideoutWireDto = HideoutDto | HideoutV2Dto;

/**
 * Normalizes the legacy cash-only hideout payload into the stronger v2 shape.
 * This keeps staggered deployments or stale responses from crashing the page
 * while all internal UI code can continue to rely on required v2 fields.
 */
export function normalizeHideoutDto(input: HideoutWireDto): HideoutV2Dto {
  const rulesVersion = 'rulesVersion' in input && input.rulesVersion === 2 ? 2 : 1;

  const rooms: HideoutRoomV2Dto[] = input.rooms.map((room) => {
    const v2 = room as Partial<HideoutRoomV2Dto>;
    const maxed = room.nextCostCents === null;
    return {
      ...room,
      canUpgrade: typeof v2.canUpgrade === 'boolean' ? v2.canUpgrade : !maxed,
      lockReason: typeof v2.lockReason === 'string' || v2.lockReason === null
        ? v2.lockReason
        : maxed
          ? `${room.name} is fully upgraded for this season.`
          : null,
      nextRequirements: Array.isArray(v2.nextRequirements) ? v2.nextRequirements : [],
      specialization: v2.specialization ?? null,
    };
  });

  return {
    ...input,
    rulesVersion,
    rooms,
  };
}

export const hideoutApi = {
  catalog: () => api.get<HideoutWireDto>('/game/hideout').then(normalizeHideoutDto),
  cosmetics: () => api.get<HideoutCosmeticsDto>('/game/hideout/cosmetics'),
  updateCosmetics: (input: UpdateHideoutCosmeticsInput) => api.post<HideoutCosmeticsDto>('/game/hideout/cosmetics', input),
  upgrade: (input: HideoutUpgradeInput) =>
    api.post<GameActionResult<HideoutUpgradeResult>>('/game/hideout/upgrade', input),
  setWeaponPriority: (input: HideoutWeaponPriorityInput) =>
    api.post<GameActionResult<HideoutWeaponPriorityResult>>('/game/hideout/armory/priority', input),
  specialize: (input: HideoutSpecializationInput) =>
    api.post<GameActionResult<HideoutSpecializationResult>>('/game/hideout/specialization', input),
  stash: () => api.get<StashDto>('/game/hideout/stash'),
  saveStashLayout: (input: UpdateStashLayoutInput) => api.put<StashDto>('/game/hideout/stash/layout', input),
  scavenging: () => api.get<ScavengePageDto>('/game/hideout/scavenging'),
  openCache: (cacheId: string) => api.post<OpenScavengeCacheResult>(`/game/hideout/scavenging/${encodeURIComponent(cacheId)}/open`, {}),
  generator: () => api.get<HideoutGeneratorDto>('/game/hideout/generator'),
  updateGenerator: (input: { powered?: boolean; refuelCans?: number; upgrade?: 'CAPACITY' | 'EFFICIENCY' }) => api.post<HideoutGeneratorDto>('/game/hideout/generator', input),
  workshop: () => api.get<CraftingWorkshopDto>('/game/hideout/workshop'),
  craft: (recipeKey: string, actionId?: string) => api.post<import('@streets/shared').GameActionResult<CraftingResultDto>>('/game/hideout/workshop/craft', { recipeKey, ...(actionId ? { actionId } : {}) }),
};
