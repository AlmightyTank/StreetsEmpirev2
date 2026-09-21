import type { GameActionResult, HideoutUpgradeInput, HideoutUpgradeResult, HideoutV2Dto } from '@streets/shared';
import { api } from './client.js';

export const hideoutApi = {
  catalog: () => api.get<HideoutV2Dto>('/game/hideout'),
  upgrade: (input: HideoutUpgradeInput) =>
    api.post<GameActionResult<HideoutUpgradeResult>>('/game/hideout/upgrade', input),
};
