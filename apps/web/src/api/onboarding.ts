import type { OnboardingActionInput, OnboardingStateDto } from '@streets/shared';
import { api } from './client.js';

/** 1.0.0-B. Tutorial progress and the early getting-started goals. */
export const onboardingApi = {
  state: () => api.get<OnboardingStateDto>('/game/onboarding'),
  act: (input: OnboardingActionInput) => api.post<OnboardingStateDto>('/game/onboarding', input),
};
