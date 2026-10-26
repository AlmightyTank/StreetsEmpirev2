import { createElement as h } from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import type { OnboardingStateDto } from '@streets/shared';
import { TOUR_STEP_KEYS } from '@streets/shared';
import { DEFAULT_STREET_SIGN } from '@streets/shared';
import { TourOffer } from './TourOffer.js';

type Tour = NonNullable<OnboardingStateDto['tour']>;

const steps = (done: string[] = []) =>
  TOUR_STEP_KEYS.map((key) => ({ key, done: done.includes(key) }));

const base: Tour = {
  due: false,
  active: false,
  dismissed: false,
  complete: false,
  step: null,
  steps: steps(),
};

const render = (tour?: Tour) =>
  renderToStaticMarkup(h(MemoryRouter, null, h(TourOffer, { tour })));

describe('TourOffer', () => {
  it('offers the tour to new players with start and skip', () => {
    const html = render({ ...base, due: true, step: 'build-street-sign' });
    expect(html).toContain('data-testid="tour-offer"');
    expect(html).toContain('Start walkthrough');
    expect(html).toContain('Skip');
  });

  it('resumes an active tour with a clear next step and one primary action', () => {
    const html = render({ ...base, active: true, step: 'produce', steps: steps(['build-street-sign', 'scout-streets', 'buy-condoms', 'grow-crew']) });
    expect(html).toContain('Next step: Cook your first batch');
    expect(html).toContain(`Step 5 of ${TOUR_STEP_KEYS.length}`);
    expect(html).toContain('aria-valuenow="4"');
    expect(html).toContain('>Go to the action</button>');
    expect(html).not.toContain('href="/game/produce"');
  });

  it('shows the permanent identity payoff and turf handoff after completion', () => {
    const html = render({ ...base, signRecap: { ...DEFAULT_STREET_SIGN, streetName: 'Cedar' } });
    expect(html).toContain('data-testid="walkthrough-complete"');
    expect(html).toContain('first permanent upgrade');
    expect(html).toContain('You’re on the map');
    expect(html).toContain('Cedar');
    expect(html).toContain('not a turf claim');
    expect(html).toContain('Next system: Turf');
    expect(html).toContain('Build enough power to take your first piece of turf');
    expect(html).toContain('See turf');
  });

  it('stays hidden for dismissed, complete and veteran players', () => {
    // Dismissed this season.
    expect(render({ ...base, due: false, step: 'scout-streets', dismissed: true})).not.toContain('tour-offer');
    // Complete.
    expect(render({ ...base, complete: true, step: null, steps: steps([...TOUR_STEP_KEYS]) })).not.toContain('tour-offer');
    // Veteran: never due, never active.
    expect(render({ ...base, step: null })).not.toContain('tour-offer');
    // No season joined.
    expect(render(undefined)).not.toContain('tour-offer');
  });
});
