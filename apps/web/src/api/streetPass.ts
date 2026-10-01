import type { GameActionResult, StreetPassClaimResult, StreetPassDto } from '@streets/shared';
import { api } from './client.js';

export const streetPassApi = {
  /** `pass` is null on rounds without a Street Pass. */
  get: () => api.get<{ pass: StreetPassDto | null }>('/game/street-pass'),
  claim: (tier: number, actionId: string) =>
    api.post<GameActionResult<StreetPassClaimResult>>('/game/street-pass/claim', { tier, actionId }),
};
