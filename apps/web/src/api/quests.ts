import type { FavorActivationResult, FavorArmResult, GameActionResult, PlayerQuestDto, QuestClaimResponse, QuestPageDto, TrackedQuestsDto } from '@streets/shared';
import { api } from './client.js';

export const questsApi = {
  page: () => api.get<QuestPageDto>('/game/quests'),
  history: () => api.get<{ quests: PlayerQuestDto[] }>('/game/quests/history'),
  tracked: () => api.get<TrackedQuestsDto>('/game/quests/tracked'),
  accept: (key: string, actionId: string) =>
    api.post<QuestPageDto>('/game/quests/' + encodeURIComponent(key) + '/accept', { actionId }),
  abandon: (key: string) =>
    api.post<QuestPageDto>('/game/quests/' + encodeURIComponent(key) + '/abandon', {}),
  setAutoAccept: (enabled: boolean) =>
    api.put<QuestPageDto>('/game/quests/auto-accept', { enabled }),
  track: (key: string, tracked: boolean) =>
    api.post<QuestPageDto>('/game/quests/' + encodeURIComponent(key) + '/track', { tracked }),
  respondToScene: (key: string, sceneKey: string, responseKey: string) =>
    api.post<QuestPageDto>(
      '/game/quests/' + encodeURIComponent(key) + '/scenes/' + encodeURIComponent(sceneKey),
      { responseKey },
    ),
  claim: (key: string, actionId: string, branchKey?: string) =>
    api.post<QuestClaimResponse>(
      '/game/quests/' + encodeURIComponent(key) + '/claim',
      { actionId, ...(branchKey ? { branchKey } : {}) },
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
