import type { ArmoryBulkActionInput, ArmoryBulkActionResult, GameActionResult, IndividualInventoryDto } from '@streets/shared';
import { api } from './client.js';

export const armoryApi = {
  catalog: () => api.get<IndividualInventoryDto>('/game/armory'),
  update: (input: ArmoryBulkActionInput) => api.post<GameActionResult<ArmoryBulkActionResult>>('/game/armory/actions', input),
};
