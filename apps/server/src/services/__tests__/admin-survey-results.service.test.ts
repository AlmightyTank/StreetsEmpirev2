import { describe, expect, it } from 'vitest';
import { aggregateQuestion } from '../admin-survey-results.service.js';

describe('Survey Phase F question aggregates', () => {
  it('calculates single-choice counts and percentages from answered submissions', () => {
    const question = {
      id: 'q-choice',
      type: 'SINGLE_CHOICE',
      prompt: 'Better or worse?',
      description: null,
      required: true,
      position: 1,
      minLength: null,
      maxLength: null,
      ratingMin: null,
      ratingMax: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      surveyId: 'survey',
      options: [
        { id: 'a', questionId: 'q-choice', value: 'BETTER', label: 'Better', position: 1 },
        { id: 'b', questionId: 'q-choice', value: 'WORSE', label: 'Worse', position: 2 },
      ],
    } as never;
    const submissions = [
      { id: 's1', submittedAt: new Date(), rewardGrantedAt: new Date(), answers: [{ questionId: 'q-choice', value: 'WORSE' }] },
      { id: 's2', submittedAt: new Date(), rewardGrantedAt: new Date(), answers: [{ questionId: 'q-choice', value: 'WORSE' }] },
      { id: 's3', submittedAt: new Date(), rewardGrantedAt: new Date(), answers: [{ questionId: 'q-choice', value: 'BETTER' }] },
      { id: 's4', submittedAt: new Date(), rewardGrantedAt: new Date(), answers: [] },
    ] as never;

    expect(aggregateQuestion(question, submissions)).toMatchObject({
      answered: 3,
      skipped: 1,
      aggregate: {
        kind: 'CHOICE',
        multiple: false,
        options: [
          { value: 'BETTER', count: 1, percent: 33.3 },
          { value: 'WORSE', count: 2, percent: 66.7 },
        ],
      },
    });
  });

  it('calculates rating averages without treating skipped answers as zero', () => {
    const question = {
      id: 'q-rating',
      type: 'RATING',
      prompt: 'Rate it',
      description: null,
      required: false,
      position: 1,
      minLength: null,
      maxLength: null,
      ratingMin: 1,
      ratingMax: 5,
      createdAt: new Date(),
      updatedAt: new Date(),
      surveyId: 'survey',
      options: [],
    } as never;
    const submissions = [
      { id: 's1', submittedAt: new Date(), rewardGrantedAt: new Date(), answers: [{ questionId: 'q-rating', value: 2 }] },
      { id: 's2', submittedAt: new Date(), rewardGrantedAt: new Date(), answers: [{ questionId: 'q-rating', value: 4 }] },
      { id: 's3', submittedAt: new Date(), rewardGrantedAt: new Date(), answers: [] },
    ] as never;

    expect(aggregateQuestion(question, submissions)).toMatchObject({
      answered: 2,
      skipped: 1,
      aggregate: { kind: 'RATING', average: 3 },
    });
  });
});
