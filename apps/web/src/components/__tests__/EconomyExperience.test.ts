import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { EconomyBatchAction, EconomyFulfillmentCard, EconomyPendingNotice, EconomyQuote } from '../EconomyExperience.js';

describe('economy experience primitives', () => {
  it('labels a quote and exposes its current status', () => {
    const html = renderToStaticMarkup(createElement(EconomyQuote, {
      title: '100 cases',
      status: 'Prepaid',
      children: createElement('span', null, 'Full total $2,000'),
    }));
    expect(html).toContain('aria-label="Transaction quote"');
    expect(html).toContain('Prepaid');
    expect(html).toContain('Full total $2,000');
  });

  it('announces retry-safe pending transactions', () => {
    const html = renderToStaticMarkup(createElement(EconomyPendingNotice, null, 'Retry the same order.'));
    expect(html).toContain('role="status"');
    expect(html).toContain('Retry-safe transaction');
    expect(html).toContain('Retry the same order.');
  });

  it('uses common fulfillment and batch semantics', () => {
    const fulfillment = renderToStaticMarkup(createElement(EconomyFulfillmentCard, {
      title: 'Medicine',
      detail: 'Downtown Supply',
      status: 'Awaiting pickup',
      children: createElement('span', null, '100 remaining'),
    }));
    const batch = renderToStaticMarkup(createElement(EconomyBatchAction, {
      label: 'Order basket',
      children: createElement('span', null, 'Two lines'),
    }));
    expect(fulfillment).toContain('se-economy-fulfillment');
    expect(fulfillment).toContain('Awaiting pickup');
    expect(batch).toContain('aria-label="Order basket"');
  });
});
