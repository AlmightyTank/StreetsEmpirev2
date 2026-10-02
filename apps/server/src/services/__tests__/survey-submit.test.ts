import { describe, expect, it } from 'vitest';
import type { SurveyQuestionForSubmission } from '../survey.service.js';
import { validateSurveyAnswers } from '../survey.service.js';

function question(
  id: string,
  type: SurveyQuestionForSubmission['type'],
  overrides: Partial<SurveyQuestionForSubmission> = {},
): SurveyQuestionForSubmission {
  return {
    id,
    surveyId: 'survey-1',
    type,
    prompt: id,
    description: null,
    required: true,
    position: 1,
    minLength: null,
    maxLength: null,
    ratingMin: null,
    ratingMax: null,
    createdAt: new Date('2026-10-01T00:00:00Z'),
    updatedAt: new Date('2026-10-01T00:00:00Z'),
    options: [],
    ...overrides,
  };
}

function option(questionId: string, value: string, position: number) {
  return { id: `${questionId}-${value}`, questionId, value, label: value, position };
}

describe('Survey Phase C answer validation', () => {
  it('treats positive and negative written feedback the same', () => {
    const q = question('feedback', 'LONG_TEXT');

    expect(validateSurveyAnswers([q], [{ questionId: q.id, value: 'I love this change.' }]))
      .toEqual([{ questionId: q.id, value: 'I love this change.' }]);

    expect(validateSurveyAnswers([q], [{ questionId: q.id, value: 'I hate this change.' }]))
      .toEqual([{ questionId: q.id, value: 'I hate this change.' }]);
  });

  it('requires every required question', () => {
    const q = question('required', 'YES_NO');
    expect(() => validateSurveyAnswers([q], [])).toThrow(/required/i);
  });

  it('accepts only authored choice values', () => {
    const q = question('choice', 'SINGLE_CHOICE', {
      options: [option('choice', 'BETTER', 1), option('choice', 'WORSE', 2)],
    });

    expect(validateSurveyAnswers([q], [{ questionId: q.id, value: 'WORSE' }]))
      .toEqual([{ questionId: q.id, value: 'WORSE' }]);
    expect(() => validateSurveyAnswers([q], [{ questionId: q.id, value: 'SECRET' }]))
      .toThrow(/choices shown/i);
  });

  it('enforces authored rating bounds', () => {
    const q = question('rating', 'RATING', { ratingMin: 1, ratingMax: 5 });
    expect(validateSurveyAnswers([q], [{ questionId: q.id, value: 5 }]))
      .toEqual([{ questionId: q.id, value: 5 }]);
    expect(() => validateSurveyAnswers([q], [{ questionId: q.id, value: 6 }]))
      .toThrow(/rating from 1 to 5/i);
  });

  it('trims text and omits blank optional answers', () => {
    const required = question('short', 'SHORT_TEXT');
    const optional = question('optional', 'LONG_TEXT', { required: false, position: 2 });

    expect(validateSurveyAnswers(
      [required, optional],
      [
        { questionId: required.id, value: '   useful feedback   ' },
        { questionId: optional.id, value: '   ' },
      ],
    )).toEqual([{ questionId: required.id, value: 'useful feedback' }]);
  });

  it('requires at least three non-whitespace characters by default', () => {
    const q = question('short', 'SHORT_TEXT');
    expect(() => validateSurveyAnswers([q], [{ questionId: q.id, value: ' ok ' }]))
      .toThrow(/at least 3/i);
  });

  it('rejects duplicate answers even when called below the transport layer', () => {
    const q = question('duplicate', 'YES_NO');
    expect(() => validateSurveyAnswers(
      [q],
      [
        { questionId: q.id, value: true },
        { questionId: q.id, value: false },
      ],
    )).toThrow(/only once/i);
  });

  it('accepts multiple authored choices and rejects foreign values', () => {
    const q = question('multi', 'MULTIPLE_CHOICE', {
      options: [option('multi', 'MOBILE', 1), option('multi', 'DESKTOP', 2)],
    });
    expect(validateSurveyAnswers([q], [{ questionId: q.id, value: ['MOBILE', 'DESKTOP'] }]))
      .toEqual([{ questionId: q.id, value: ['MOBILE', 'DESKTOP'] }]);
    expect(() => validateSurveyAnswers([q], [{ questionId: q.id, value: ['MOBILE', 'OTHER'] }]))
      .toThrow(/choices shown/i);
  });
});
