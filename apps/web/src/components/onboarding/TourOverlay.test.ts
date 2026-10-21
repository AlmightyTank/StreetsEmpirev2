import { createElement as h } from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import type { OnboardingStateDto } from '@streets/shared';
import { TOUR_STEP_KEYS } from '@streets/shared';
import { neighborStep, TourOverlay, tourStepIndex } from './TourOverlay.js';

type Tour = NonNullable<OnboardingStateDto['tour']>;

const steps = (done: string[] = []) =>
  TOUR_STEP_KEYS.map((key) => ({ key, done: done.includes(key) }));

function showTour(overrides: Partial<Tour> = {}): Tour {
  return {
    due: false,
    active: true,
    dismissed: false,
    complete: false,
    step: 'scout',
    steps: steps(),
    ...overrides,
  };
}

const render = (tour?: Tour) => renderToStaticMarkup(h(MemoryRouter, null, h(TourOverlay, { tour })));

describe('tour step helpers', () => {
  it('indexes steps for N-of-8 progress', () => {
    expect(tourStepIndex('build-street-sign')).toBe(0);
    expect(tourStepIndex('accept-quest')).toBe(1);
    expect(tourStepIndex('recon-raid')).toBe(7);
    expect(tourStepIndex(null)).toBe(-1);
  });

  it('moves Next/Back across open steps only', () => {
    const state = steps(['build-street-sign', 'accept-quest', 'scout']);
    expect(neighborStep(state, 'scout', 1)).toBe('shop-supplies');
    expect(neighborStep(state, 'shop-supplies', -1)).toBeNull();
    expect(neighborStep(state, 'accept-quest', -1)).toBeNull();
  });
});

describe('TourOverlay', () => {
  it('renders the current step with progress, Guide Me and skip', () => {
    const html = render(showTour());
    // No DOM in SSR, so the target is missing and the fallback renders.
    expect(html).toContain('data-testid="tour-overlay"');
    expect(html).toContain('Guided tour · Step 3 of 8');
    expect(html).toContain('Work the block');
    expect(html).toContain('Guide me to the action');
    expect(html).toContain('Skip tour');
    expect(html).toContain('se-tour__card--fallback');
    expect(html).toContain('tabindex="-1"');
  });

  it('stays hidden when dismissed, complete or inactive', () => {
    expect(render(showTour({ dismissed: true }))).not.toContain('tour-overlay');
    expect(render(showTour({ dismissed: false, complete: true, step: null, steps: steps([...TOUR_STEP_KEYS]) }))).not.toContain('tour-overlay');
    expect(render(showTour({ active: false, due: true, step: 'accept-quest' }))).not.toContain('tour-overlay');
  });

  it('derives the current step from server progress, not clicks', () => {
    const html = render(showTour({ step: 'produce', steps: steps(['accept-quest', 'scout', 'shop-supplies', 'grow-crew']) }));
    expect(html).toContain('Guided tour · Step 6 of 8');
    expect(html).toContain('Cook your first batch');
  });
});
