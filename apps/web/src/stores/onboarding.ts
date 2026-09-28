import { create } from 'zustand';
import type { OnboardingActionInput, OnboardingStateDto } from '@streets/shared';
import { onboardingApi } from '../api/onboarding.js';

interface OnboardingStore {
  state: OnboardingStateDto | null;
  /** The intro is open, because it was due or the player asked to replay it. */
  introOpen: boolean;
  load: () => Promise<void>;
  act: (input: OnboardingActionInput) => Promise<void>;
  openIntro: () => void;
  closeIntro: () => void;
}

/**
 * 1.0.0-B. Onboarding never blocks play: every call here fails quietly, and a
 * failed save only means a tip may show again.
 */
export const useOnboarding = create<OnboardingStore>((set) => ({
  state: null,
  introOpen: false,

  async load() {
    try {
      const state = await onboardingApi.state();
      set((current) => ({ state, introOpen: current.introOpen || state.intro.due }));
    } catch {
      // Older server or signed out: no onboarding, the game still works.
    }
  },

  async act(input) {
    try {
      const state = await onboardingApi.act(input);
      set({ state });
    } catch {
      // A tip showing twice is better than a blocked action.
    }
  },

  openIntro() {
    set({ introOpen: true });
  },

  closeIntro() {
    set({ introOpen: false });
  },
}));
