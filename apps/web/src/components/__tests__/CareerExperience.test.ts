import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { CareerGuidance, CareerMetricStrip, CareerNavigation } from '../CareerExperience.js';

describe('career experience primitives', () => {
  it('links the career destinations and marks the active page', () => {
    const html = renderToStaticMarkup(createElement(MemoryRouter, null,
      createElement(CareerNavigation, { active: 'pass' }),
    ));
    expect(html).toContain('aria-label="Career destinations"');
    expect(html).toContain('href="/game/xp-progress"');
    expect(html).toContain('href="/game/street-pass"');
    expect(html).toContain('aria-current="page"');
  });

  it('renders a labelled summary with progress tones', () => {
    const html = renderToStaticMarkup(createElement(CareerMetricStrip, {
      label: 'Round progress',
      items: [
        { label: 'Level', value: '12', tone: 'accent' },
        { label: 'Ready', value: '2', detail: 'rewards', tone: 'good' },
      ],
    }));
    expect(html).toContain('aria-label="Round progress"');
    expect(html).toContain('se-career-metric--good');
    expect(html).toContain('rewards');
  });

  it('keeps supporting explanations optional', () => {
    const html = renderToStaticMarkup(createElement(CareerGuidance, {
      title: 'Permanent and seasonal progress',
      children: createElement('p', null, 'XP persists between rounds.'),
    }));
    expect(html).toContain('<details');
    expect(html).toContain('How it works');
    expect(html).toContain('XP persists between rounds.');
  });
});
