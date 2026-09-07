import type {
  DistrictsDto,
  GameActionResult,
  PayoutResult,
  ProduceCrackResult,
  ScoutResult,
  WorkResult,
} from '@streets/shared';
import { api } from './client.js';

export const actionsApi = {
  districts: () => api.get<DistrictsDto>('/game/districts'),

  scout: (input: { district: string; turns: number; actionId: string }) =>
    api.post<GameActionResult<ScoutResult>>('/game/scout', input),

  work: (input: { district: string; turns: number; actionId: string }) =>
    api.post<GameActionResult<WorkResult>>('/game/work', input),

  produceCrack: (input: { turns: number; actionId: string }) =>
    api.post<GameActionResult<ProduceCrackResult>>('/game/produce-crack', input),

  setPayout: (input: { percent: number; actionId: string }) =>
    api.put<GameActionResult<PayoutResult>>('/game/payout', input),
};
