import { describe, expect, it } from 'vitest';
import { surveySubmitSchema } from '../schemas/survey.js';

describe('Survey Phase A submission schema', () => {
  it('accepts all initial answer value shapes', () => {
    const parsed = surveySubmitSchema.parse({
      actionId: 'survey-action-123',
      answers: [
        { questionId: 'yes-no', value: true },
        { questionId: 'single', value: 'BETTER' },
        { questionId: 'multi', value: ['BASKET', 'MOBILE'] },
        { questionId: 'rating', value: 5 },
        { questionId: 'short', value: 'Clear and quick.' },
        { questionId: 'long', value: 'I like the new flow, especially on mobile.' },
      ],
    });

    expect(parsed.answers).toHaveLength(6);
  });

  it('rejects two answers for the same question', () => {
    const result = surveySubmitSchema.safeParse({
      actionId: 'survey-action-456',
      answers: [
        { questionId: 'same-question', value: true },
        { questionId: 'same-question', value: false },
      ],
    });

    expect(result.success).toBe(false);
  });

  it('rejects duplicate multi-choice values', () => {
    const result = surveySubmitSchema.safeParse({
      actionId: 'survey-action-789',
      answers: [
        { questionId: 'multi', value: ['STORE', 'STORE'] },
      ],
    });

    expect(result.success).toBe(false);
  });
});
