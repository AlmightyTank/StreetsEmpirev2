import { create } from 'zustand';
import type { OnboardingActionInput, OnboardingStateDto } from '@streets/shared';
import { onboardingApi } from '../api/onboarding.js';

interface OnboardingStore {
  state: OnboardingStateDto | null;
  /** Player whose first request settled, including the non-blocking failure path. */
  loadedFor: string | null;
  /** The intro is open, because it was due or the player asked to replay it. */
  introOpen: boolean;
  load: (playerId?: string) => Promise<void>;
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
  loadedFor: null,
  introOpen: false,

  async load(playerId) {
    try {
      const state = await onboardingApi.state();
      set((current) => ({
        state,
        loadedFor: playerId ?? current.loadedFor,
        introOpen: current.introOpen || state.intro.due,
      }));
    } catch {
      // Older server or signed out: no onboarding, the game still works.
      set((current) => ({ loadedFor: playerId ?? current.loadedFor }));
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
