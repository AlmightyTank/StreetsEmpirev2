import { classicOgV30E } from '../classic-og-v3.0-e/index.js';
import { LIVING_CASE_REWARD_CENTS } from '../living-case-outcomes.js';
import { defineLivingStoryCatalog } from '../living-stories.js';
import type { Ruleset } from '../types.js';

/** 2.0.0-E. New rounds opt in to modest case rewards; old pinned rounds stay unchanged. */
export const classicOgV30F = {
  ...classicOgV30E,
  meta: { ...classicOgV30E.meta, id: 'classic-og-v3.0-f', version: '3.0.0-F',
    name: 'Classic OG - Living Streets Case Outcomes' },
  livingStories: defineLivingStoryCatalog(
    Object.fromEntries(Object.entries(classicOgV30E.livingStories).map(([key, definition]) => [
      key, { ...definition, rewardBudgetCents: LIVING_CASE_REWARD_CENTS },
    ])),
  ),
} satisfies Ruleset;
