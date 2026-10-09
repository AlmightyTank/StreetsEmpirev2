import type {
  DistrictsDto,
  GameActionResult,
  PayoutResult,
  ProduceCrackResult,
  ProductTypeDto,
  RandomEncounterChoiceResult,
  ScoutResult,
} from '@streets/shared';
import { api } from './client.js';

export const actionsApi = {
  districts: () => api.get<DistrictsDto>('/game/districts'),

  scout: (input: { district: string; turns: number; actionId: string }) =>
    api.post<GameActionResult<ScoutResult>>('/game/scout', input),


  produceCrack: (input: { turns: number; productType: ProductTypeDto; actionId: string }) =>
    api.post<GameActionResult<ProduceCrackResult>>('/game/produce-crack', input),

  resolveEncounter: (id: string, input: { choice: string; actionId: string }) =>
    api.post<GameActionResult<RandomEncounterChoiceResult>>(`/game/encounters/${encodeURIComponent(id)}/resolve`, input),

  setPayout: (input: { percent: number; actionId: string }) =>
    api.put<GameActionResult<PayoutResult>>('/game/payout', input),
};
