import { describe, expect, it } from 'vitest';
import { onboardingActionSchema, TOUR_STEP_KEYS } from '../onboarding.js';

describe('guided walkthrough tour actions', () => {
  it('starts with Make Your Mark before the core-loop steps', () => {
    expect([...TOUR_STEP_KEYS]).toEqual([
      'build-street-sign',
      'accept-quest',
      'scout',
      'shop-supplies',
      'grow-crew',
      'produce',
      'upgrade-hideout',
      'recon-raid',
    ]);
  });

  it('parses start-tour, dismiss-tour and restore-tour', () => {
    expect(onboardingActionSchema.parse({ action: 'start-tour' })).toEqual({ action: 'start-tour' });
    expect(onboardingActionSchema.parse({ action: 'dismiss-tour' })).toEqual({ action: 'dismiss-tour' });
    expect(onboardingActionSchema.parse({ action: 'restore-tour' })).toEqual({ action: 'restore-tour' });
    expect(onboardingActionSchema.parse({ action: 'dismiss-sign-recap' })).toEqual({ action: 'dismiss-sign-recap' });
  });

  it('parses advance-tour only with a known step', () => {
    expect(onboardingActionSchema.parse({ action: 'advance-tour', step: 'scout' })).toEqual({
      action: 'advance-tour',
      step: 'scout',
    });
    expect(() => onboardingActionSchema.parse({ action: 'advance-tour', step: 'nope' })).toThrow();
    expect(() => onboardingActionSchema.parse({ action: 'advance-tour' })).toThrow();
  });

  it('keeps existing guide actions working', () => {
    expect(onboardingActionSchema.parse({ action: 'dismiss-guide' })).toEqual({ action: 'dismiss-guide' });
    expect(onboardingActionSchema.parse({ action: 'see-page', page: 'hideout' })).toEqual({
      action: 'see-page',
      page: 'hideout',
    });
  });
});
