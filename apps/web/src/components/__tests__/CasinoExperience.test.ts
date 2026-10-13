import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { CasinoBankrollSummary, CasinoBetControl, CasinoGameSelector } from '../CasinoExperience.js';

describe('casino experience primitives', () => {
  it('marks the active deep-linked game', () => {
    const selector = createElement(CasinoGameSelector, {
      activeKey: 'slots',
      games: [{ key: 'slots', label: 'Slots', icon: 'S', href: '/game/casino/slots' }],
    });
    const html = renderToStaticMarkup(createElement(MemoryRouter, null, selector));
    expect(html).toContain('aria-label="Switch game"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('/game/casino/slots');
  });

  it('renders shared bankroll context', () => {
    const html = renderToStaticMarkup(createElement(CasinoBankrollSummary, {
      metrics: [
        { label: 'Cash here', value: '$100.00' },
        { label: 'On the floor', value: '$25.00', active: true },
      ],
      actions: createElement('button', { type: 'button' }, 'Cash out'),
      note: 'Session is open in New York.',
    }));
    expect(html).toContain('aria-label="Casino wallet"');
    expect(html).toContain('is-live');
    expect(html).toContain('Session is open in New York.');
  });

  it('labels the reusable wager stepper', () => {
    const html = renderToStaticMarkup(createElement(CasinoBetControl, {
      id: 'test-bet',
      label: 'Bet',
      value: '10',
      onChange: vi.fn(),
      onDecrease: vi.fn(),
      onIncrease: vi.fn(),
      onMax: vi.fn(),
    }));
    expect(html).toContain('role="group"');
    expect(html).toContain('aria-label="Decrease bet"');
    expect(html).toContain('aria-label="Increase bet"');
    expect(html).toContain('>Max</button>');
  });
});
