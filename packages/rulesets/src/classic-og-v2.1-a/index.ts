import { classicOgV20A } from '../classic-og-v2.0-a/index.js';
import { LIVING_CASE_REWARD_CENTS } from '../living-case-outcomes.js';
import { defineLivingStoryCatalog } from '../living-stories.js';
import type { Ruleset } from '../types.js';

/** 2.0.0-E. New rounds opt in to modest case rewards; old pinned rounds stay unchanged. */
export const classicOgV21A = {
  ...classicOgV20A,
  meta: { ...classicOgV20A.meta, id: 'classic-og-v2.1-a', version: '2.1.0-A',
    name: 'Classic OG - Living Streets Case Outcomes' },
  livingStories: defineLivingStoryCatalog(
    Object.fromEntries(Object.entries(classicOgV20A.livingStories).map(([key, definition]) => [
      key, { ...definition, rewardBudgetCents: LIVING_CASE_REWARD_CENTS },
    ])),
  ),
} satisfies Ruleset;
