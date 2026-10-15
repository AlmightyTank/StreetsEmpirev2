import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { HoldingCard } from '../HoldingsPage.js';

describe('city holding card', () => {
  it('uses existing bookmarked management routes and a wrapping layout', () => {
    const city = {
      citySlug: 'san-francisco', cityName: 'San Francisco', corners: ['CASINO'], fronts: 1,
      warehouses: [{ id: 'stash', name: 'Home stash', kind: 'STASH', isActive: true, capacityUnits: 100, stock: [{ productKey: 'WEED', quantity: 12 }], paidThrough: null, upkeepCents: '0', upkeepDue: false }],
      safehouses: [], crews: [], inbound: [], pressure: { casePoints: 5, stage: 'SUSPECT' },
    };
    const html = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(HoldingCard, { city })));
    expect(html).toContain('San Francisco');
    expect(html).toContain('grid-template-columns:repeat(auto-fit, minmax(min(100%, 12rem), 1fr))');
    expect(html).toContain('href="/game/turf?city=san-francisco"');
    expect(html).toContain('href="/game/supply"');
    expect(html).toContain('href="/game/dealers"');
    expect(html).toContain('href="/game#pressure"');
    expect(html).toContain('aria-label="San Francisco management"');
  });
});
