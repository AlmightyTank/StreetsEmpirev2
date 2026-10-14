import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ActionDock, type ResultChip } from '../ActionDock.js';

const chips: ResultChip[] = ['Cash', 'Product', 'Turns', 'Heat', 'Rank'].map((label, index) => ({
  key: label,
  label,
  text: String(index + 1),
  tone: 'muted',
}));

describe('ActionDock result actions', () => {
  it('announces the result and exposes chip, receipt, and dismiss controls', () => {
    const html = renderToStaticMarkup(createElement(ActionDock, {
      label: 'Scout',
      onSubmit: () => undefined,
      outcome: {
        id: 'result-1',
        title: 'Scout finished',
        chips,
        receipt: createElement('div', null, 'Detailed receipt'),
        onDismiss: () => undefined,
      },
      children: createElement('button', { type: 'submit' }, 'Scout'),
    }));

    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('+2 more');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('>Receipt<');
    expect(html).toContain('aria-label="Dismiss result"');
    expect(html).not.toContain('Detailed receipt');
  });
});
