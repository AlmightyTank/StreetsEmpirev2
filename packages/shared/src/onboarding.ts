import { z } from 'zod';

/**
 * 1.0.0-B. Onboarding and player education.
 *
 * The server only stores progress and works out the early goals from real play;
 * all wording lives in the web client's help catalog.
 */

/** Pages with a one-time intro card, in the order the roadmap introduces systems. */
export const ONBOARDING_PAGE_KEYS = [
  'stores',
  'produce',
  'combat',
  'travel',
  'turf',
  'hideout',
  'alliance',
] as const;
export type OnboardingPageKey = (typeof ONBOARDING_PAGE_KEYS)[number];

/** Instructional goals, not quests: nothing is rewarded, and they can be dismissed. */
export const ONBOARDING_GUIDE_STEPS = ['scout', 'recruit', 'restock', 'produce', 'weapon'] as const;
export type OnboardingGuideStepKey = (typeof ONBOARDING_GUIDE_STEPS)[number];

export interface OnboardingStateDto {
  intro: {
    /** True when the first-login intro should open by itself. */
    due: boolean;
    completedAt: string | null;
    skippedAt: string | null;
  };
  seenPages: OnboardingPageKey[];
  /** Null outside a season the account has joined. */
  guide: {
    dismissed: boolean;
    complete: boolean;
    steps: Array<{ key: OnboardingGuideStepKey; done: boolean }>;
  } | null;
}

export const onboardingActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('complete-intro') }).strict(),
  z.object({ action: z.literal('skip-intro') }).strict(),
  /** Replay: the intro opens again and every page intro shows again. */
  z.object({ action: z.literal('replay') }).strict(),
  z.object({ action: z.literal('see-page'), page: z.enum(ONBOARDING_PAGE_KEYS) }).strict(),
  z.object({ action: z.literal('dismiss-guide') }).strict(),
  z.object({ action: z.literal('restore-guide') }).strict(),
]);
export type OnboardingActionInput = z.infer<typeof onboardingActionSchema>;
