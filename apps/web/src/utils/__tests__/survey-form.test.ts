import { describe, expect, it } from 'vitest';
import type { SurveyQuestionDto } from '@streets/shared';
import { validateSurveyForm } from '../surveyForm.js';

function question(
  id: string,
  type: SurveyQuestionDto['type'],
  overrides: Partial<SurveyQuestionDto> = {},
): SurveyQuestionDto {
  return {
    id,
    type,
    prompt: id,
    description: null,
    required: true,
    position: 1,
    minLength: null,
    maxLength: null,
    ratingMin: null,
    ratingMax: null,
    options: [],
    ...overrides,
  };
}

describe('Survey Phase D form validation', () => {
  it('flags missing required answers before the request', () => {
    const q = question('required', 'YES_NO');
    expect(validateSurveyForm([q], {}).fields[q.id]).toMatch(/required/i);
  });

  it('accepts critical written feedback exactly like positive feedback', () => {
    const q = question('feedback', 'LONG_TEXT');
    expect(validateSurveyForm([q], { [q.id]: 'I hate this change.' })).toEqual({
      answers: [{ questionId: q.id, value: 'I hate this change.' }],
      fields: {},
    });
    expect(validateSurveyForm([q], { [q.id]: 'I love this change.' }).fields).toEqual({});
  });

  it('omits a blank optional written answer', () => {
    const q = question('optional', 'SHORT_TEXT', { required: false });
    expect(validateSurveyForm([q], { [q.id]: '   ' })).toEqual({ answers: [], fields: {} });
  });

  it('enforces rating bounds and authored multiple choices', () => {
    const rating = question('rating', 'RATING', { ratingMin: 1, ratingMax: 5 });
    const multi = question('multi', 'MULTIPLE_CHOICE', {
      position: 2,
      options: [
        { id: 'a', value: 'MOBILE', label: 'Mobile', position: 1 },
        { id: 'b', value: 'DESKTOP', label: 'Desktop', position: 2 },
      ],
    });

    expect(validateSurveyForm(
      [rating, multi],
      { rating: 6, multi: ['MOBILE', 'OTHER'] },
    ).fields).toEqual({
      rating: 'Choose a rating from 1 to 5.',
      multi: 'Choose only the options shown.',
    });
  });
});
