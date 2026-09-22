import type { FavorActivationResult, FavorArmResult, GameActionResult, QuestClaimResult, QuestPageDto } from '@streets/shared';
import { api } from './client.js';

export const questsApi = {
  page: () => api.get<QuestPageDto>('/game/quests'),
  accept: (key: string, actionId: string) =>
    api.post<QuestPageDto>('/game/quests/' + encodeURIComponent(key) + '/accept', { actionId }),
  abandon: (key: string) =>
    api.post<QuestPageDto>('/game/quests/' + encodeURIComponent(key) + '/abandon', {}),
  track: (key: string, tracked: boolean) =>
    api.post<QuestPageDto>('/game/quests/' + encodeURIComponent(key) + '/track', { tracked }),
  claim: (key: string, actionId: string) =>
    api.post<GameActionResult<QuestClaimResult>>(
      '/game/quests/' + encodeURIComponent(key) + '/claim',
      { actionId },
    ),
  activateFavor: (key: string, actionId: string) =>
    api.post<GameActionResult<FavorActivationResult>>(
      '/game/favors/' + encodeURIComponent(key) + '/activate',
      { actionId },
    ),
  armFavor: (key: string, actionId: string) =>
    api.post<GameActionResult<FavorArmResult>>(
      '/game/favors/' + encodeURIComponent(key) + '/arm',
      { actionId },
    ),
  disarmFavor: (key: string, actionId: string) =>
    api.post<GameActionResult<FavorArmResult>>(
      '/game/favors/' + encodeURIComponent(key) + '/disarm',
      { actionId },
    ),
};
