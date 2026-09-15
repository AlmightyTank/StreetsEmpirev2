import type { GameActionResult, HideoutDto, HideoutUpgradeInput, HideoutUpgradeResult } from '@streets/shared';
import { api } from './client.js';

export const hideoutApi = {
  catalog: () => api.get<HideoutDto>('/game/hideout'),
  upgrade: (input: HideoutUpgradeInput) =>
    api.post<GameActionResult<HideoutUpgradeResult>>('/game/hideout/upgrade', input),
};
