import { createElement as h } from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import type { OnboardingStateDto } from '@streets/shared';
import { TOUR_STEP_KEYS } from '@streets/shared';
import { adjacentStep, neighborStep, TourOverlay, tourStepIndex } from './TourOverlay.js';

type Tour = NonNullable<OnboardingStateDto['tour']>;

const steps = (done: string[] = []) =>
  TOUR_STEP_KEYS.map((key) => ({ key, done: done.includes(key) }));

function showTour(overrides: Partial<Tour> = {}): Tour {
  return {
    due: false,
    active: true,
    dismissed: false,
    complete: false,
    step: 'scout-streets',
    steps: steps(),
    ...overrides,
  };
}

const render = (tour?: Tour) => renderToStaticMarkup(h(MemoryRouter, null, h(TourOverlay, { tour })));

describe('tour step helpers', () => {
  it('indexes steps for N-of-9 progress', () => {
    expect(tourStepIndex('build-street-sign')).toBe(0);
    expect(tourStepIndex('scout-streets')).toBe(1);
    expect(tourStepIndex('first-raid')).toBe(12);
    expect(tourStepIndex(null)).toBe(-1);
  });

  it('moves Next/Back across open steps only', () => {
    const state = steps(['build-street-sign', 'scout-streets', 'earn-first-payout', 'buy-condoms', 'buy-beer', 'buy-medicine', 'buy-pistols', 'buy-ammo-crate']);
    expect(neighborStep(state, 'scout-streets', 1)).toBe('grow-crew');
    expect(neighborStep(state, 'buy-condoms', -1)).toBeNull();
    expect(neighborStep(state, 'scout-streets', -1)).toBeNull();
  });

  it('moves arrows across adjacent steps, including completed prompts', () => {
    expect(adjacentStep('buy-beer', -1)).toBe('buy-condoms');
    expect(adjacentStep('buy-beer', 1)).toBe('buy-medicine');
    expect(adjacentStep('build-street-sign', -1)).toBeNull();
    expect(adjacentStep('first-raid', 1)).toBeNull();
  });
});

describe('TourOverlay', () => {
  it('renders the current step with a spotlight fallback, progress, and one primary action', () => {
    const html = render(showTour());
    // No DOM in SSR, so the target is missing and the fallback renders.
    expect(html).toContain('data-testid="tour-overlay"');
    expect(html).toContain('Learn the streets · Step 2 of 13');
    expect(html).toContain('Next step: Scout the streets');
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('Go to the action');
    expect(html).toContain('Go forward to Collect your first payout');
    expect(html).toContain('Skip walkthrough');
    expect(html).toContain('se-tour__card--fallback');
    expect(html).toContain('tabindex="-1"');
  });

  it('stays hidden when dismissed, complete or inactive', () => {
    expect(render(showTour({ dismissed: true }))).not.toContain('tour-overlay');
    expect(render(showTour({ dismissed: false, complete: true, step: null, steps: steps([...TOUR_STEP_KEYS]) }))).not.toContain('tour-overlay');
    expect(render(showTour({ active: false, due: true, step: 'scout-streets' }))).not.toContain('tour-overlay');
  });

  it('derives the current step from server progress, not clicks', () => {
    const html = render(showTour({ step: 'produce', steps: steps(['build-street-sign', 'scout-streets', 'buy-condoms', 'grow-crew']) }));
    expect(html).toContain('Grow your foundation · Step 10 of 13');
    expect(html).toContain('Cook your first batch');
  });
});
