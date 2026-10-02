import { describe, expect, it } from 'vitest';
import { adminSurveyDefinitionSchema } from '../schemas/admin-survey.js';

describe('Survey Phase E admin definition schema', () => {
  const base = {
    title: 'Store overhaul feedback',
    description: 'Tell us how the new basket and store flow feels.',
    releaseTag: '1.1.0-F',
    featureTag: 'Stores',
    roundId: null,
    startsAt: null,
    endsAt: null,
    rewards: [{ kind: 'CASH', amount: 5000 }],
    questions: [{
      type: 'YES_NO',
      prompt: 'Did you try the new basket?',
      description: null,
      required: true,
      minLength: null,
      maxLength: null,
      ratingMin: null,
      ratingMax: null,
      options: [],
    }],
  };

  it('accepts a complete admin survey definition', () => {
    expect(adminSurveyDefinitionSchema.parse(base).title).toBe(base.title);
  });

  it('rejects non-positive reward amounts', () => {
    expect(adminSurveyDefinitionSchema.safeParse({
      ...base,
      rewards: [{ kind: 'TURNS', amount: 0 }],
    }).success).toBe(false);
  });

  it('rejects invalid schedule timestamps at the transport boundary', () => {
    expect(adminSurveyDefinitionSchema.safeParse({
      ...base,
      startsAt: 'tomorrow night',
    }).success).toBe(false);
  });
});
