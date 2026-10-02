export const SURVEYS_CHANGED_EVENT = 'streets:surveys-changed';

import type { GameActionResult, SurveyDetailDto, SurveyPageDto, SurveySubmissionResultDto, SurveySubmitInputDto } from '@streets/shared';
import { api } from './client.js';

export const surveysApi = {
  page: () => api.get<SurveyPageDto>('/game/surveys'),
  detail: (surveyId: string) =>
    api.get<SurveyDetailDto>('/game/surveys/' + encodeURIComponent(surveyId)),
  submit: (surveyId: string, input: SurveySubmitInputDto) =>
    api.post<GameActionResult<SurveySubmissionResultDto>>(
      '/game/surveys/' + encodeURIComponent(surveyId) + '/submit',
      input,
    ),
};
