import {
  SURVEY_DEFAULT_LONG_TEXT_MAX_LENGTH,
  SURVEY_DEFAULT_RATING_MAX,
  SURVEY_DEFAULT_RATING_MIN,
  SURVEY_DEFAULT_SHORT_TEXT_MAX_LENGTH,
  SURVEY_DEFAULT_TEXT_MIN_LENGTH,
  type SurveyAnswerInputDto,
  type SurveyAnswerValueDto,
  type SurveyQuestionDto,
} from '@streets/shared';

export type SurveyFormValue = SurveyAnswerValueDto | undefined;
export type SurveyFormState = Record<string, SurveyFormValue>;

export interface SurveyFormValidation {
  answers: SurveyAnswerInputDto[];
  fields: Record<string, string>;
}

export function surveyAnswersToForm(answers: readonly SurveyAnswerInputDto[] | null): SurveyFormState {
  return Object.fromEntries((answers ?? []).map((answer) => [answer.questionId, answer.value]));
}

/**
 * Fast client feedback only. The server repeats every check authoritatively
 * before recording answers or paying rewards.
 */
export function validateSurveyForm(
  questions: readonly SurveyQuestionDto[],
  values: SurveyFormState,
): SurveyFormValidation {
  const answers: SurveyAnswerInputDto[] = [];
  const fields: Record<string, string> = {};

  for (const question of questions) {
    const value = values[question.id];
    const required = () => { fields[question.id] = 'This question is required.'; };

    switch (question.type) {
      case 'YES_NO':
        if (typeof value !== 'boolean') {
          if (question.required) required();
          break;
        }
        answers.push({ questionId: question.id, value });
        break;

      case 'SINGLE_CHOICE':
        if (typeof value !== 'string' || value.length === 0) {
          if (question.required) required();
          break;
        }
        if (!question.options.some((option) => option.value === value)) {
          fields[question.id] = 'Choose one of the options shown.';
          break;
        }
        answers.push({ questionId: question.id, value });
        break;

      case 'MULTIPLE_CHOICE': {
        const selected = Array.isArray(value) ? value : [];
        if (!selected.length) {
          if (question.required) fields[question.id] = 'Choose at least one option.';
          break;
        }
        const allowed = new Set(question.options.map((option) => option.value));
        if (selected.some((option) => !allowed.has(option))) {
          fields[question.id] = 'Choose only the options shown.';
          break;
        }
        answers.push({ questionId: question.id, value: [...selected] });
        break;
      }

      case 'RATING': {
        if (typeof value !== 'number' || !Number.isInteger(value)) {
          if (question.required) required();
          break;
        }
        const min = question.ratingMin ?? SURVEY_DEFAULT_RATING_MIN;
        const max = question.ratingMax ?? SURVEY_DEFAULT_RATING_MAX;
        if (value < min || value > max) {
          fields[question.id] = `Choose a rating from ${min} to ${max}.`;
          break;
        }
        answers.push({ questionId: question.id, value });
        break;
      }

      case 'SHORT_TEXT':
      case 'LONG_TEXT': {
        const text = typeof value === 'string' ? value.trim() : '';
        if (!text) {
          if (question.required) required();
          break;
        }
        const min = question.minLength ?? SURVEY_DEFAULT_TEXT_MIN_LENGTH;
        const max = question.maxLength ?? (
          question.type === 'SHORT_TEXT'
            ? SURVEY_DEFAULT_SHORT_TEXT_MAX_LENGTH
            : SURVEY_DEFAULT_LONG_TEXT_MAX_LENGTH
        );
        if (text.length < min) {
          fields[question.id] = `Write at least ${min} characters.`;
          break;
        }
        if (text.length > max) {
          fields[question.id] = `Keep this answer to ${max} characters or fewer.`;
          break;
        }
        answers.push({ questionId: question.id, value: text });
        break;
      }
    }
  }

  return { answers, fields };
}
