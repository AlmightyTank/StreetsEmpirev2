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
export const ONBOARDING_GUIDE_STEPS = ['meet_contact', 'open_front', 'face_encounter', 'choose_career'] as const;
export type OnboardingGuideStepKey = (typeof ONBOARDING_GUIDE_STEPS)[number];

/**
 * Guided walkthrough: the ordered core-loop tour. Progress is derived from
 * real ledger-backed play (never clicks); rewards come from the mapped quest
 * objectives, never from the tour itself.
 */
export const TOUR_STEP_KEYS = [
  'accept-quest',
  'scout',
  'shop-supplies',
  'grow-crew',
  'produce',
  'upgrade-hideout',
  'recon-raid',
] as const;
export type TourStepKey = (typeof TOUR_STEP_KEYS)[number];

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
  /** Null outside a season the account has joined. */
  tour: {
    /** True when the tour offer should be shown (new players only). */
    due: boolean;
    /** True once the player starts the tour and until it is dismissed/completed. */
    active: boolean;
    dismissed: boolean;
    complete: boolean;
    /** First incomplete step key, or null when complete. */
    step: TourStepKey | null;
    steps: Array<{ key: TourStepKey; done: boolean }>;
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
  z.object({ action: z.literal('start-tour') }).strict(),
  z.object({ action: z.literal('advance-tour'), step: z.enum(TOUR_STEP_KEYS) }).strict(),
  z.object({ action: z.literal('dismiss-tour') }).strict(),
  z.object({ action: z.literal('restore-tour') }).strict(),
]);
export type OnboardingActionInput = z.infer<typeof onboardingActionSchema>;
