import type { SurveyDetailDto, SurveyPageDto } from '@streets/shared';
import { api } from './client.js';

export const surveysApi = {
  page: () => api.get<SurveyPageDto>('/game/surveys'),
  detail: (surveyId: string) =>
    api.get<SurveyDetailDto>('/game/surveys/' + encodeURIComponent(surveyId)),
};
