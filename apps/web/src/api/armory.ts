import type { ArmoryBulkActionInput, ArmoryBulkActionResult, ArmoryFeatureItemInput, ArmoryFeatureItemResult, ArmoryLookActionInput, ArmoryLookActionResult, ArmoryModActionInput, ArmoryModActionResult, GameActionResult, IndividualInventoryDto } from '@streets/shared';
import { api } from './client.js';

export const armoryApi = {
  catalog: () => api.get<IndividualInventoryDto>('/game/armory'),
  update: (input: ArmoryBulkActionInput) => api.post<GameActionResult<ArmoryBulkActionResult>>('/game/armory/actions', input),
  customize: (input: ArmoryModActionInput) => api.post<GameActionResult<ArmoryModActionResult>>('/game/armory/mod-actions', input),
  setLook: (input: ArmoryLookActionInput) => api.post<GameActionResult<ArmoryLookActionResult>>('/game/armory/look', input),
  feature: (input: ArmoryFeatureItemInput) => api.post<GameActionResult<ArmoryFeatureItemResult>>('/game/armory/feature', input),
};
