import type {
  GameActionResult,
  QuestCompleteInput,
  QuestCompleteResult,
  ReputationSummaryDto,
} from '@streets/shared';
import { api } from './client.js';

export const reputationApi = {
  summary: () => api.get<ReputationSummaryDto>('/game/reputation'),
  completeQuest: (input: QuestCompleteInput) =>
    api.post<GameActionResult<QuestCompleteResult>>('/game/reputation/quest', input),
};
