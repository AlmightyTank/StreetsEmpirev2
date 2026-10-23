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
    const html = render({ ...base, due: true, step: 'accept-quest' });
    expect(html).toContain('data-testid="tour-offer"');
    expect(html).toContain('Start the tour');
    expect(html).toContain('Skip');
  });

  it('resumes an active tour with the next step and a Guide me action', () => {
    const html = render({ ...base, active: true, step: 'produce', steps: steps(['accept-quest', 'scout', 'shop-supplies', 'grow-crew']) });
    expect(html).toContain('Next: Cook your first batch');
    expect(html).toContain(`4 of ${TOUR_STEP_KEYS.length}`);
    expect(html).toContain('>Guide me</button>');
    expect(html).not.toContain('href="/game/produce"');
  });

  it('shows the saved sign in the Make Your Mark recap', () => {
    const html = render({ ...base, signRecap: { ...DEFAULT_STREET_SIGN, streetName: 'Cedar' } });
    expect(html).toContain('data-testid="street-sign-recap"');
    expect(html).toContain('You’re on the map');
    expect(html).toContain('Cedar');
    expect(html).toContain('not a turf claim');
  });

  it('stays hidden for dismissed, complete and veteran players', () => {
    // Dismissed this season.
    expect(render({ ...base, due: false, step: 'scout' , dismissed: true})).not.toContain('tour-offer');
    // Complete.
    expect(render({ ...base, complete: true, step: null, steps: steps([...TOUR_STEP_KEYS]) })).not.toContain('tour-offer');
    // Veteran: never due, never active.
    expect(render({ ...base, step: null })).not.toContain('tour-offer');
    // No season joined.
    expect(render(undefined)).not.toContain('tour-offer');
  });
});
